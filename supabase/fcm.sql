-- ============================================================================
-- SOHBETO — FCM (APK bildirimleri) — cihaz token defteri + uyandırma biletleri
-- Kendi Supabase projende: SQL Editor > New query > yapıştır > RUN
-- Tekrar çalıştırılabilir (idempotent).
--
-- GİZLİLİK MANTIĞI
--   FCM'e (Google'a) HİÇBİR zaman mesaj metni, gönderen numarası ya da başlık
--   gitmez. Google'a giden paket sadece {"t":"1"} = "uyan" sinyalidir.
--   Kim yazdı / arama mı mesaj mı bilgisi burada, kendi Supabase'inde
--   fcm_tickets tablosunda durur; telefon uyanınca kendi cihaz sırrıyla
--   fcm-peek fonksiyonundan çeker ve bildirimi CİHAZDA oluşturur.
--   Mesaj metni asla burada yoktur; o zaten asili_veri'de şifreli blob olarak
--   durur ve yalnızca uygulama içinde çözülür.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Cihaz token defteri
-- ----------------------------------------------------------------------------
create table if not exists public.fcm_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text,                        -- sanal numara (+90...)
  token text not null unique,        -- FCM kayıt token'ı
  device_id text,                    -- uygulamanın ürettiği cihaz kimliği
  secret text not null,              -- cihaz sırrı (fcm-peek için)
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fcm_tokens_phone_idx on public.fcm_tokens (phone);
create index if not exists fcm_tokens_user_idx on public.fcm_tokens (user_id);

-- Tablo yalnızca sunucu (service_role) tarafından okunur; istemci RPC kullanır.
revoke all on public.fcm_tokens from anon, authenticated;
grant all on public.fcm_tokens to service_role;
alter table public.fcm_tokens enable row level security;

-- ----------------------------------------------------------------------------
-- 2) Uyandırma biletleri (kim aradı / kim yazdı — METİN YOK)
-- ----------------------------------------------------------------------------
create table if not exists public.fcm_tickets (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references public.fcm_tokens(id) on delete cascade,
  kind text not null default 'message',   -- message | call
  from_phone text,                        -- gönderenin sanal numarası
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index if not exists fcm_tickets_token_idx on public.fcm_tickets (token_id, consumed_at);

revoke all on public.fcm_tickets from anon, authenticated;
grant all on public.fcm_tickets to service_role;
alter table public.fcm_tickets enable row level security;

-- ----------------------------------------------------------------------------
-- 3) Token kaydet / tazele (uygulama açılışında çağrılır)
-- ----------------------------------------------------------------------------
create or replace function public.upsert_fcm_token(
  p_token text,
  p_secret text,
  p_phone text default null,
  p_device_id text default null,
  p_platform text default 'android'
)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_phone text;
begin
  if auth.uid() is null then return false; end if;
  if coalesce(p_token,'') = '' or coalesce(p_secret,'') = '' then return false; end if;
  v_phone := nullif(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g'), '');
  if v_phone is not null then v_phone := '+' || v_phone; end if;

  insert into public.fcm_tokens (user_id, phone, token, device_id, secret, platform)
  values (auth.uid(), v_phone, p_token, p_device_id, p_secret, coalesce(nullif(p_platform,''),'android'))
  on conflict (token) do update
    set user_id = excluded.user_id,
        phone = coalesce(excluded.phone, public.fcm_tokens.phone),
        device_id = coalesce(excluded.device_id, public.fcm_tokens.device_id),
        secret = excluded.secret,
        platform = excluded.platform,
        updated_at = now();
  return true;
end $$;
revoke all on function public.upsert_fcm_token(text, text, text, text, text) from public;
grant execute on function public.upsert_fcm_token(text, text, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Token sil (çıkış / bildirim kapatma)
-- ----------------------------------------------------------------------------
create or replace function public.delete_fcm_token(p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  delete from public.fcm_tokens where token = p_token and user_id = auth.uid();
  return true;
end $$;
revoke all on function public.delete_fcm_token(text) from public;
grant execute on function public.delete_fcm_token(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) Eski bilet temizliği (isteğe bağlı, pg_cron ile)
-- ----------------------------------------------------------------------------
create or replace function public.fcm_bilet_temizle()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  delete from public.fcm_tickets
   where created_at < now() - interval '2 days';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.fcm_bilet_temizle() from public;
grant execute on function public.fcm_bilet_temizle() to service_role;

-- BİTTİ. Sonraki adım: Supabase Secrets'a FCM_SERVICE_ACCOUNT ekle,
-- send-push ve fcm-peek fonksiyonlarını deploy et (bkz. fcm-kurulum.txt).
