-- ============================================================================
-- SOHBETO — ASILI VERİ (offline mesaj kuyruğu) + VERİMETRİ anahtar defteri
-- Kendi Supabase projende: SQL Editor > New query > yapıştır > RUN
-- Tekrar çalıştırılabilir (idempotent).
--
-- MANTIK
--   X, Y'ye mesaj yazar. Y çevrimdışıysa mesaj P2P ile gitmez.
--   Bu durumda mesaj benzersiz bir "verimetri kodu" ile buraya ASILI kalır.
--   Y sonradan uygulamayı açtığında kuyruğunu çeker, mesajı çözer, sohbete düşer.
--   X o esnada kapalı olsa bile mesaj kaybolmaz.
--
--   İçerik cihazda AES-GCM ile şifrelenir; burada yalnızca okunamaz blob durur.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 0) Yardımcı: oturumun kayıtlı numarası
-- ----------------------------------------------------------------------------
create or replace function public.my_registered_phone()
returns text language sql stable security definer set search_path = public as $$
  select r.phone from public.registered_numbers r
   where r.user_id = auth.uid()
   order by r.created_at desc limit 1
$$;
revoke all on function public.my_registered_phone() from public;
grant execute on function public.my_registered_phone() to authenticated;

-- ----------------------------------------------------------------------------
-- 1) VERİMETRİ ANAHTAR DEFTERİ (uçtan uca şifreleme açık anahtarları)
--    Yalnızca AÇIK anahtar burada durur. Özel anahtar cihazdan hiç çıkmaz.
-- ----------------------------------------------------------------------------
create table if not exists public.verimetri_keys (
  phone text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  pubkey text not null,          -- base64url, ECDH P-256 raw public key
  alg text not null default 'ecdh-p256',
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.verimetri_keys to authenticated;
grant all on public.verimetri_keys to service_role;
alter table public.verimetri_keys enable row level security;

drop policy if exists "read keys" on public.verimetri_keys;
create policy "read keys" on public.verimetri_keys
  for select to authenticated using (true);
drop policy if exists "write own key" on public.verimetri_keys;
create policy "write own key" on public.verimetri_keys
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "update own key" on public.verimetri_keys;
create policy "update own key" on public.verimetri_keys
  for update to authenticated using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2) ASILI VERİ KUYRUĞU
-- ----------------------------------------------------------------------------
create table if not exists public.asili_veri (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,               -- verimetri kodu (benzersiz mesaj kimliği)
  from_phone text not null,
  to_phone text not null,
  kind text not null default 'text',       -- text | image | audio | video | file | call
  alg text not null default 'aes-gcm-ecdh',
  iv text,                                 -- base64url
  payload text not null,                   -- base64url şifreli gövde
  msg_id text,                             -- motorun kendi mesaj kimliği (ack/duplicate için)
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days')
);
create index if not exists asili_to_idx on public.asili_veri (to_phone, delivered_at, created_at);
create index if not exists asili_from_idx on public.asili_veri (from_phone, created_at desc);

grant select, insert, update on public.asili_veri to authenticated;
grant all on public.asili_veri to service_role;
alter table public.asili_veri enable row level security;

-- Kuyruğu yalnızca tarafları görebilir (RPC'ler security definer olsa da
-- doğrudan tablo erişimi de sızdırmasın).
drop policy if exists "read own queue" on public.asili_veri;
create policy "read own queue" on public.asili_veri
  for select to authenticated
  using (to_phone = public.my_registered_phone() or from_phone = public.my_registered_phone());

drop policy if exists "insert as sender" on public.asili_veri;
create policy "insert as sender" on public.asili_veri
  for insert to authenticated
  with check (from_phone = public.my_registered_phone());

drop policy if exists "receiver marks delivered" on public.asili_veri;
create policy "receiver marks delivered" on public.asili_veri
  for update to authenticated
  using (to_phone = public.my_registered_phone())
  with check (to_phone = public.my_registered_phone());

-- ----------------------------------------------------------------------------
-- 3) İSTEMCİ FONKSİYONLARI
-- ----------------------------------------------------------------------------

-- Açık anahtarımı defterime yaz
create or replace function public.verimetri_set_key(p_pubkey text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_phone text;
begin
  if auth.uid() is null then return false; end if;
  v_phone := public.my_registered_phone();
  if v_phone is null or coalesce(p_pubkey,'') = '' then return false; end if;
  insert into public.verimetri_keys (phone, user_id, pubkey, updated_at)
  values (v_phone, auth.uid(), p_pubkey, now())
  on conflict (phone) do update
    set pubkey = excluded.pubkey, user_id = excluded.user_id, updated_at = now();
  return true;
end $$;
revoke all on function public.verimetri_set_key(text) from public;
grant execute on function public.verimetri_set_key(text) to authenticated;

-- Bir numaranın açık anahtarını al
create or replace function public.verimetri_get_key(p_phone text)
returns text language sql stable security definer set search_path = public as $$
  select k.pubkey from public.verimetri_keys k
   where k.phone = '+' || regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')
   limit 1
$$;
revoke all on function public.verimetri_get_key(text) from public;
grant execute on function public.verimetri_get_key(text) to authenticated;

-- Mesajı kuyruğa as (aynı kod tekrar gelirse sessizce yoksayılır)
create or replace function public.asili_gonder(
  p_code text,
  p_to_phone text,
  p_payload text,
  p_iv text default null,
  p_alg text default 'aes-gcm-ecdh',
  p_kind text default 'text',
  p_msg_id text default null
)
returns table (ok boolean, reason text)
language plpgsql security definer set search_path = public as $$
declare v_from text; v_to text;
begin
  if auth.uid() is null then return query select false, 'auth'; return; end if;
  v_from := public.my_registered_phone();
  if v_from is null then return query select false, 'no_number'; return; end if;
  v_to := nullif(regexp_replace(coalesce(p_to_phone,''), '[^0-9]', '', 'g'), '');
  if v_to is null then return query select false, 'to_phone'; return; end if;
  v_to := '+' || v_to;
  if coalesce(p_code,'') = '' or coalesce(p_payload,'') = '' then
    return query select false, 'payload'; return;
  end if;
  if length(p_payload) > 200000 then return query select false, 'too_big'; return; end if;

  insert into public.asili_veri (code, from_phone, to_phone, kind, alg, iv, payload, msg_id)
  values (p_code, v_from, v_to, coalesce(nullif(p_kind,''),'text'),
          coalesce(nullif(p_alg,''),'aes-gcm-ecdh'), p_iv, p_payload, nullif(p_msg_id,''))
  on conflict (code) do nothing;

  return query select true, 'ok';
end $$;
revoke all on function public.asili_gonder(text, text, text, text, text, text, text) from public;
grant execute on function public.asili_gonder(text, text, text, text, text, text, text) to authenticated;

-- Bana asılı duran, henüz teslim edilmemiş veriler
create or replace function public.asili_kuyrugum(p_limit int default 200)
returns table (
  code text, from_phone text, to_phone text, kind text,
  alg text, iv text, payload text, msg_id text, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select a.code, a.from_phone, a.to_phone, a.kind, a.alg, a.iv, a.payload, a.msg_id, a.created_at
    from public.asili_veri a
   where a.to_phone = public.my_registered_phone()
     and a.delivered_at is null
     and a.expires_at > now()
   order by a.created_at asc
   limit least(coalesce(p_limit, 200), 500)
$$;
revoke all on function public.asili_kuyrugum(int) from public;
grant execute on function public.asili_kuyrugum(int) to authenticated;

-- Teslim aldım (aynı veri bir daha düşmez)
create or replace function public.asili_teslim(p_codes text[])
returns int language plpgsql security definer set search_path = public as $$
declare v_phone text; v_n int;
begin
  v_phone := public.my_registered_phone();
  if v_phone is null or p_codes is null then return 0; end if;
  update public.asili_veri
     set delivered_at = now()
   where to_phone = v_phone and delivered_at is null and code = any(p_codes);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.asili_teslim(text[]) from public;
grant execute on function public.asili_teslim(text[]) to authenticated;

-- Gönderdiğim verilerin teslim durumu (çift tik için)
create or replace function public.asili_durumum(p_codes text[])
returns table (code text, delivered_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.code, a.delivered_at from public.asili_veri a
   where a.from_phone = public.my_registered_phone()
     and a.code = any(coalesce(p_codes, array[]::text[]))
$$;
revoke all on function public.asili_durumum(text[]) from public;
grant execute on function public.asili_durumum(text[]) to authenticated;

-- Süresi geçmiş kuyruk temizliği (pg_cron ile çağrılabilir)
create or replace function public.asili_temizle()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  delete from public.asili_veri
   where expires_at <= now() or (delivered_at is not null and delivered_at < now() - interval '7 days');
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.asili_temizle() from public;
grant execute on function public.asili_temizle() to service_role;
