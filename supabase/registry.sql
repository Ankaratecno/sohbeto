-- ============================================================================
-- SOHBETO — NUMARA KAYIT DEFTERİ + KURUCU TABLOSU + ZAMANLI MESAJ
-- Kendi Supabase projende: SQL Editor > New query > yapıştır > RUN
-- Tekrar çalıştırılabilir (idempotent).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1) KURUCU / RESMÎ HESAPLAR (ayrı tablo — kimse bu numaraları alamaz)
-- ----------------------------------------------------------------------------
create table if not exists public.founder_accounts (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  username text not null unique,
  display_name text not null default 'SOHBETO',
  org text default 'Ankara Tecno',
  verified boolean not null default true,
  avatar_kind text not null default 'so-icon',
  created_at timestamptz not null default now()
);
grant select on public.founder_accounts to anon, authenticated;
grant all on public.founder_accounts to service_role;
alter table public.founder_accounts enable row level security;

drop policy if exists "founder accounts public read" on public.founder_accounts;
create policy "founder accounts public read" on public.founder_accounts
  for select using (true);

insert into public.founder_accounts (phone, username, display_name, org)
values ('+90606061992', 'sohbeto', 'SOHBETO', 'Ankara Tecno')
on conflict (phone) do nothing;

-- ----------------------------------------------------------------------------
-- 2) ALINAN NUMARALAR + KULLANICI ADI EŞLEŞMESİ
-- ----------------------------------------------------------------------------
create table if not exists public.registered_numbers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null unique,
  username text unique,
  display_name text,
  is_online boolean not null default false,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, phone)
);
create index if not exists reg_numbers_user_idx on public.registered_numbers (user_id);
create index if not exists reg_numbers_online_idx on public.registered_numbers (is_online);

grant select, insert, update on public.registered_numbers to authenticated;
grant all on public.registered_numbers to service_role;
alter table public.registered_numbers enable row level security;

drop policy if exists "read registry" on public.registered_numbers;
create policy "read registry" on public.registered_numbers
  for select to authenticated using (true);
drop policy if exists "insert own number" on public.registered_numbers;
create policy "insert own number" on public.registered_numbers
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "update own number" on public.registered_numbers;
create policy "update own number" on public.registered_numbers
  for update to authenticated using (auth.uid() = user_id);

-- Kurucu numarası asla normal kayıt olarak alınamaz
create or replace function public.guard_reserved_number()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.founder_accounts f where f.phone = new.phone) then
    raise exception 'Bu numara rezerve edilmiştir';
  end if;
  if new.username is not null
     and exists (select 1 from public.founder_accounts f where lower(f.username) = lower(new.username)) then
    raise exception 'Bu kullanıcı adı rezerve edilmiştir';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_reserved_number on public.registered_numbers;
create trigger trg_guard_reserved_number before insert or update on public.registered_numbers
  for each row execute function public.guard_reserved_number();

-- ----------------------------------------------------------------------------
-- 3) ZAMANLI (MANUEL YAZILAN) KURUCU MESAJLARI
--    body + send_at: o tarihten sonra bağlanan herkes mesajı alır.
-- ----------------------------------------------------------------------------
create table if not exists public.founder_messages (
  id uuid primary key default gen_random_uuid(),
  founder_phone text not null default '+90606061992'
    references public.founder_accounts(phone) on delete cascade,
  body text not null,
  send_at timestamptz not null default now(),   -- gönderim tarihi
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists founder_msgs_send_idx on public.founder_messages (send_at desc);

grant select on public.founder_messages to authenticated;
grant all on public.founder_messages to service_role;
alter table public.founder_messages enable row level security;

drop policy if exists "read due founder messages" on public.founder_messages;
create policy "read due founder messages" on public.founder_messages
  for select to authenticated using (active and send_at <= now());

-- Teslim kayıtları: offline olan sonra bağlanınca alır, iki kez almaz.
create table if not exists public.founder_message_receipts (
  message_id uuid not null references public.founder_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  read_at timestamptz,
  primary key (message_id, user_id)
);
grant select, insert, update on public.founder_message_receipts to authenticated;
grant all on public.founder_message_receipts to service_role;
alter table public.founder_message_receipts enable row level security;

drop policy if exists "own founder receipts" on public.founder_message_receipts;
create policy "own founder receipts" on public.founder_message_receipts
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4) İSTEMCİ FONKSİYONLARI
-- ----------------------------------------------------------------------------
-- Numara + kullanıcı adı kaydı (normalize eder, çakışmayı bildirir)
create or replace function public.register_my_number(p_phone text, p_username text default null, p_display_name text default null)
returns table (ok boolean, reason text)
language plpgsql security definer set search_path = public as $$
declare v_phone text; v_user text;
begin
  if auth.uid() is null then return query select false, 'auth'; return; end if;
  v_phone := nullif(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g'), '');
  if v_phone is null then return query select false, 'phone'; return; end if;
  v_phone := '+' || v_phone;
  v_user := nullif(lower(regexp_replace(coalesce(p_username,''), '[^a-z0-9_\.]', '', 'gi')), '');

  if exists (select 1 from public.founder_accounts f where f.phone = v_phone) then
    return query select false, 'reserved_phone'; return;
  end if;
  if v_user is not null and exists (
    select 1 from public.founder_accounts f where lower(f.username) = v_user
  ) then
    return query select false, 'reserved_username'; return;
  end if;
  if exists (select 1 from public.registered_numbers r where r.phone = v_phone and r.user_id <> auth.uid()) then
    return query select false, 'phone_taken'; return;
  end if;
  if v_user is not null and exists (
    select 1 from public.registered_numbers r where r.username = v_user and r.user_id <> auth.uid()
  ) then
    return query select false, 'username_taken'; return;
  end if;

  insert into public.registered_numbers (user_id, phone, username, display_name, is_online, last_seen)
  values (auth.uid(), v_phone, v_user, nullif(p_display_name,''), true, now())
  on conflict (phone) do update set
    user_id = auth.uid(),
    username = coalesce(v_user, public.registered_numbers.username),
    display_name = coalesce(nullif(p_display_name,''), public.registered_numbers.display_name),
    is_online = true,
    last_seen = now();

  return query select true, 'ok';
end $$;
revoke all on function public.register_my_number(text, text, text) from public;
grant execute on function public.register_my_number(text, text, text) to authenticated;

-- Kullanıcı adı müsait mi?
create or replace function public.is_username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when nullif(lower(regexp_replace(coalesce(p_username,''), '[^a-z0-9_\.]', '', 'gi')), '') is null then false
    else not exists (
      select 1 from public.founder_accounts f
      where lower(f.username) = lower(regexp_replace(p_username, '[^a-z0-9_\.]', '', 'gi'))
    ) and not exists (
      select 1 from public.registered_numbers r
      where r.username = lower(regexp_replace(p_username, '[^a-z0-9_\.]', '', 'gi'))
        and r.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    )
  end
$$;
revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to authenticated;

-- Çevrimiçi durumu (heartbeat)
create or replace function public.touch_my_presence(p_online boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.registered_numbers
     set is_online = coalesce(p_online, true), last_seen = now()
   where user_id = auth.uid();
end $$;
revoke all on function public.touch_my_presence(boolean) from public;
grant execute on function public.touch_my_presence(boolean) to authenticated;

-- Bana henüz teslim edilmemiş, vakti gelmiş kurucu mesajları
create or replace function public.pending_founder_messages()
returns table (id uuid, body text, send_at timestamptz, founder_phone text)
language sql stable security definer set search_path = public as $$
  select m.id, m.body, m.send_at, m.founder_phone
  from public.founder_messages m
  where m.active
    and m.send_at <= now()
    and auth.uid() is not null
    and not exists (
      select 1 from public.founder_message_receipts r
      where r.message_id = m.id and r.user_id = auth.uid()
    )
  order by m.send_at asc
$$;
revoke all on function public.pending_founder_messages() from public;
grant execute on function public.pending_founder_messages() to authenticated;

create or replace function public.mark_founder_message_delivered(p_message_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.founder_message_receipts (message_id, user_id)
  values (p_message_id, auth.uid())
  on conflict (message_id, user_id) do nothing;
end $$;
revoke all on function public.mark_founder_message_delivered(uuid) from public;
grant execute on function public.mark_founder_message_delivered(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) KULLANIM (senin manuel gönderimin)
-- Table Editor > founder_messages > Insert row:
--   body    = "Es selamü aleyküm ve rahmetullah 🌙 Sohbeto'ya hoş geldin!"
--   send_at = 2026-08-25 09:00:00+03   (bu tarihten sonra bağlanan herkes alır)
-- veya SQL ile:
--   insert into public.founder_messages (body, send_at)
--   values ('Duyuru metni', '2026-08-25 09:00:00+03');
-- ============================================================================

-- ============================================================================
-- 6) KURUCU GİRİŞİ (PIN) — SOHBETO olarak giriş yapıp gelen mesajları görmek
--    ve cevaplamak için. PIN, yalnızca SQL Editor'da (service) belirlenir.
-- ============================================================================
alter table public.founder_accounts add column if not exists pin_hash text;

-- PIN'i belirle/değiştir (SQL Editor / service rolü ile çalıştırılır)
create or replace function public.set_founder_pin(p_phone text, p_pin text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_phone text;
begin
  if length(coalesce(p_pin,'')) < 6 then return false; end if;
  v_phone := nullif(regexp_replace(coalesce(p_phone,''), '[^0-9]','','g'), '');
  if v_phone is null then return false; end if;
  v_phone := '+' || v_phone;
  update public.founder_accounts
     set pin_hash = encode(digest(p_pin, 'sha256'), 'hex')
   where phone = v_phone;
  return found;
end $$;
revoke all on function public.set_founder_pin(text, text) from public;
grant execute on function public.set_founder_pin(text, text) to service_role;

-- PIN ile kurucu girişini doğrula (istemci çağırır)
create or replace function public.verify_founder_login(p_phone text, p_pin text)
returns table (ok boolean, phone text, display_name text)
language plpgsql security definer set search_path = public as $$
declare v_phone text; v_name text;
begin
  if auth.uid() is null then return query select false, null::text, null::text; return; end if;
  v_phone := nullif(regexp_replace(coalesce(p_phone,''), '[^0-9]','','g'), '');
  if v_phone is null then return query select false, null::text, null::text; return; end if;
  v_phone := '+' || v_phone;
  select f.display_name into v_name
    from public.founder_accounts f
   where f.phone = v_phone
     and f.pin_hash is not null
     and f.pin_hash = encode(digest(coalesce(p_pin,''), 'sha256'), 'hex');
  if v_name is null then
    return query select false, v_phone, null::text; return;
  end if;
  return query select true, v_phone, v_name;
end $$;
revoke all on function public.verify_founder_login(text, text) from public;
grant execute on function public.verify_founder_login(text, text) to authenticated;

-- İlk kurucu PIN (varsayılan: 571571). GÜVENLİK: mutlaka değiştir!
select public.set_founder_pin('+90606061992', '571571');
-- ============================================================================
