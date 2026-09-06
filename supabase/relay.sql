-- ====================================================================
-- SOHBETO — RELAY (POSTA KUTUSU)
-- --------------------------------------------------------------------
-- Sorun: Karşı taraf çevrimdışıyken mesaj sadece GÖNDERENİN belleğinde
-- kuyruğa alınıyordu. Gönderen de uygulamayı kapatınca mesaj kayboluyordu.
-- Çözüm: Kanal kapalıyken paketler bu tabloya bırakılır; alıcı uygulamayı
-- açtığında kendi kutusunu çeker, teslim alınca satırlar silinir.
--
-- Paketler motorun kendi metinleridir (SEC### ile şifreli, MEDIA_PART###,
-- VOICE_PART### ...). Sunucu içeriği çözemez, sadece taşır.
--
-- Çalıştırma: Supabase SQL Editor'da bu dosyanın tamamını çalıştır.
-- ====================================================================

create table if not exists public.relay_messages (
  id          bigserial primary key,
  to_phone    text not null,
  from_phone  text not null default '',
  payload     text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days'
);

create index if not exists relay_messages_to_idx on public.relay_messages (to_phone, id);

grant select, insert, delete on public.relay_messages to authenticated;
grant usage, select on sequence public.relay_messages_id_seq to authenticated;
grant all on public.relay_messages to service_role;

alter table public.relay_messages enable row level security;

-- Doğrudan tablo erişimi kapalı: her şey aşağıdaki fonksiyonlardan geçer.
drop policy if exists "relay owner read" on public.relay_messages;
create policy "relay owner read" on public.relay_messages
  for select to authenticated
  using (to_phone = (select p.phone from public.profiles p where p.id = auth.uid()));

drop policy if exists "relay owner delete" on public.relay_messages;
create policy "relay owner delete" on public.relay_messages
  for delete to authenticated
  using (to_phone = (select p.phone from public.profiles p where p.id = auth.uid()));

-- ------------------------------------------------------------ gönder
create or replace function public.relay_send(p_to text, p_payload text, p_from text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_to text := case when regexp_replace(coalesce(p_to,''), '[^0-9]', '', 'g') = '' then null
                    else '+' || regexp_replace(p_to, '[^0-9]', '', 'g') end;
  v_from text := coalesce(
    (select p.phone from public.profiles p where p.id = auth.uid()),
    case when regexp_replace(coalesce(p_from,''), '[^0-9]', '', 'g') = '' then ''
         else '+' || regexp_replace(p_from, '[^0-9]', '', 'g') end);
  v_id bigint;
begin
  if auth.uid() is null then raise exception 'Yetkisiz'; end if;
  if v_to is null then raise exception 'Hedef numara gerekli'; end if;
  if p_payload is null or length(p_payload) = 0 then raise exception 'Boş paket'; end if;
  if length(p_payload) > 300000 then raise exception 'Paket çok büyük'; end if;

  -- Kutu taşmasın: alıcı başına en fazla 5000 bekleyen paket.
  delete from public.relay_messages where expires_at < now();
  if (select count(*) from public.relay_messages where to_phone = v_to) > 5000 then
    raise exception 'Alıcı kutusu dolu';
  end if;

  insert into public.relay_messages (to_phone, from_phone, payload)
  values (v_to, coalesce(v_from, ''), p_payload)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.relay_send(text, text, text) from public;
grant execute on function public.relay_send(text, text, text) to authenticated;

-- ------------------------------------------------------------ çek + sil
-- Tek turda çeker ve siler (tekrar teslim olmaz; motor zaten msgId ile ayıklar).
create or replace function public.relay_fetch(p_limit int default 300)
returns table (id bigint, from_phone text, payload text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := (select p.phone from public.profiles p where p.id = auth.uid());
begin
  if auth.uid() is null then raise exception 'Yetkisiz'; end if;
  if v_phone is null or v_phone = '' then return; end if;

  return query
  with picked as (
    select r.id from public.relay_messages r
    where r.to_phone = v_phone and r.expires_at > now()
    order by r.id
    limit greatest(1, least(coalesce(p_limit, 300), 1000))
  )
  delete from public.relay_messages d
  using picked
  where d.id = picked.id
  returning d.id, d.from_phone, d.payload, d.created_at;
end;
$$;

revoke all on function public.relay_fetch(int) from public;
grant execute on function public.relay_fetch(int) to authenticated;
