-- ============================================================================
-- SOHBETO — Supabase init.sql
-- Kendi Supabase projende: SQL Editor > New query > bu dosyayı yapıştır > RUN
-- Tekrar çalıştırılabilir (idempotent) yazıldı.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enum types
do $$ begin create type public.app_role as enum ('admin','moderator','user'); exception when duplicate_object then null; end $$;
do $$ begin create type public.member_role as enum ('admin','member'); exception when duplicate_object then null; end $$;
do $$ begin create type public.message_type as enum ('text','image','audio','video','file','system'); exception when duplicate_object then null; end $$;
do $$ begin create type public.call_type as enum ('audio','video'); exception when duplicate_object then null; end $$;
do $$ begin create type public.call_status as enum ('ringing','accepted','declined','missed','ended','failed'); exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------------ profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique,
  display_name text,
  avatar_url text,
  bio text,
  is_online boolean not null default false,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- ----------------------------------------------------------------- user_roles
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- ------------------------------------------------------------------- contacts
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_user_id uuid references auth.users(id) on delete cascade,
  phone text,
  alias text,
  blocked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, contact_user_id),
  unique (owner_id, phone)
);
grant select, insert, update, delete on public.contacts to authenticated;
grant all on public.contacts to service_role;
alter table public.contacts enable row level security;

-- -------------------------------------------------------------- conversations
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  title text,
  avatar_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
grant select, insert, update on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  muted_until timestamptz,
  primary key (conversation_id, user_id)
);
grant select, insert, update, delete on public.conversation_members to authenticated;
grant all on public.conversation_members to service_role;
alter table public.conversation_members enable row level security;

-- üyelik kontrolü (RLS içinde recursion olmaması için security definer)
create or replace function public.is_member(_conversation_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = _conversation_id and user_id = _user_id
  )
$$;

-- ------------------------------------------------------------------- messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text,
  type public.message_type not null default 'text',
  attachment_url text,
  attachment_meta jsonb,
  reply_to uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index if not exists messages_conv_created_idx on public.messages (conversation_id, created_at desc);
grant select, insert, update, delete on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;

create table if not exists public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  primary key (message_id, user_id)
);
grant select, insert, update on public.message_receipts to authenticated;
grant all on public.message_receipts to service_role;
alter table public.message_receipts enable row level security;

-- ---------------------------------------------------------------------- calls
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid references auth.users(id) on delete cascade,
  type public.call_type not null default 'audio',
  status public.call_status not null default 'ringing',
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);
create index if not exists calls_callee_idx on public.calls (callee_id, started_at desc);
grant select, insert, update on public.calls to authenticated;
grant all on public.calls to service_role;
alter table public.calls enable row level security;

-- ---------------------------------------------------------- push_subscriptions
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  platform text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subscriptions (user_id);
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
alter table public.push_subscriptions enable row level security;

-- -------------------------------------------------------------- user_settings
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark',
  show_last_seen boolean not null default true,
  show_avatar boolean not null default true,
  notify_messages boolean not null default true,
  notify_calls boolean not null default true,
  language text not null default 'tr',
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.user_settings to authenticated;
grant all on public.user_settings to service_role;
alter table public.user_settings enable row level security;

-- ------------------------------------------------------------ blocks & reports
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
grant select, insert, delete on public.blocks to authenticated;
grant all on public.blocks to service_role;
alter table public.blocks enable row level security;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now()
);
grant select, insert on public.reports to authenticated;
grant all on public.reports to service_role;
alter table public.reports enable row level security;

-- ============================================================================
-- RLS POLİTİKALARI
-- ============================================================================
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated" on public.profiles for select to authenticated using (true);
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated using (auth.uid() = id);

drop policy if exists "read own roles" on public.user_roles;
create policy "read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own contacts" on public.contacts;
create policy "own contacts" on public.contacts for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "member reads conversation" on public.conversations;
create policy "member reads conversation" on public.conversations for select to authenticated using (public.is_member(id, auth.uid()));
drop policy if exists "create conversation" on public.conversations;
create policy "create conversation" on public.conversations for insert to authenticated with check (auth.uid() = created_by);
drop policy if exists "member updates conversation" on public.conversations;
create policy "member updates conversation" on public.conversations for update to authenticated using (public.is_member(id, auth.uid()));

drop policy if exists "member reads members" on public.conversation_members;
create policy "member reads members" on public.conversation_members for select to authenticated using (public.is_member(conversation_id, auth.uid()));
drop policy if exists "add members" on public.conversation_members;
create policy "add members" on public.conversation_members for insert to authenticated
  with check (auth.uid() = user_id or public.is_member(conversation_id, auth.uid()));
drop policy if exists "update own membership" on public.conversation_members;
create policy "update own membership" on public.conversation_members for update to authenticated using (auth.uid() = user_id);
drop policy if exists "leave conversation" on public.conversation_members;
create policy "leave conversation" on public.conversation_members for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "member reads messages" on public.messages;
create policy "member reads messages" on public.messages for select to authenticated using (public.is_member(conversation_id, auth.uid()));
drop policy if exists "member sends message" on public.messages;
create policy "member sends message" on public.messages for insert to authenticated
  with check (auth.uid() = sender_id and public.is_member(conversation_id, auth.uid()));
drop policy if exists "sender edits message" on public.messages;
create policy "sender edits message" on public.messages for update to authenticated using (auth.uid() = sender_id);
drop policy if exists "sender deletes message" on public.messages;
create policy "sender deletes message" on public.messages for delete to authenticated using (auth.uid() = sender_id);

drop policy if exists "read own receipts" on public.message_receipts;
create policy "read own receipts" on public.message_receipts for select to authenticated
  using (auth.uid() = user_id or exists (select 1 from public.messages m where m.id = message_id and m.sender_id = auth.uid()));
drop policy if exists "write own receipts" on public.message_receipts;
create policy "write own receipts" on public.message_receipts for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "update own receipts" on public.message_receipts;
create policy "update own receipts" on public.message_receipts for update to authenticated using (auth.uid() = user_id);

drop policy if exists "read own calls" on public.calls;
create policy "read own calls" on public.calls for select to authenticated using (auth.uid() = caller_id or auth.uid() = callee_id);
drop policy if exists "start call" on public.calls;
create policy "start call" on public.calls for insert to authenticated with check (auth.uid() = caller_id);
drop policy if exists "update own calls" on public.calls;
create policy "update own calls" on public.calls for update to authenticated using (auth.uid() = caller_id or auth.uid() = callee_id);

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own blocks" on public.blocks;
create policy "own blocks" on public.blocks for all to authenticated
  using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

drop policy if exists "own reports" on public.reports;
create policy "own reports" on public.reports for select to authenticated using (auth.uid() = reporter_id);
drop policy if exists "create report" on public.reports;
create policy "create report" on public.reports for insert to authenticated with check (auth.uid() = reporter_id);

-- ============================================================================
-- TETİKLEYİCİLER
-- ============================================================================
-- yeni kullanıcı -> profil + ayarlar
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, display_name)
  values (new.id, new.phone, coalesce(new.raw_user_meta_data->>'display_name', new.phone, 'Sohbeto'))
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- mesaj -> konuşma son mesaj zamanı
create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;
drop trigger if exists on_message_insert on public.messages;
create trigger on_message_insert after insert on public.messages
  for each row execute function public.touch_conversation();

-- ============================================================================
-- REALTIME
-- ============================================================================
alter table public.messages replica identity full;
alter table public.calls replica identity full;
alter table public.conversation_members replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.calls;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.message_receipts;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- STORAGE
-- ============================================================================
insert into storage.buckets (id, name, public) values ('avatars','avatars',true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('media','media',false)
  on conflict (id) do nothing;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars own write" on storage.objects;
create policy "avatars own write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars own update" on storage.objects;
create policy "avatars own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "media own read" on storage.objects;
create policy "media own read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "media own write" on storage.objects;
create policy "media own write" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- BİTTİ. Sonraki adım: VAPID anahtarları + send-push edge function.
-- ============================================================================
-- WEB PUSH NOTLARI (19.08.2026)
-- 1) Authentication > Providers > "Anonymous sign-ins" AÇIK olmalı.
--    (Uygulama anonim oturum açar; push_subscriptions RLS auth.uid() ile çalışır.)
-- 2) Edge Function secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
-- 3) Deploy: supabase functions deploy send-push
-- ============================================================================

-- ============================================================================
-- EK: PUSH HEDEFLEME (telefon numarası ile)
-- Sohbeto mesajlaşması P2P (PeerJS) olduğu için mesaj DB'ye yazılmıyor.
-- Bu yüzden push hedefi olarak kullanıcının sanal numarası saklanır.
-- Bu bloğu SQL Editor'de tekrar RUN etmek güvenlidir.
-- ============================================================================
alter table public.push_subscriptions add column if not exists phone text;

-- Tarayıcı verileri/anonim oturum yenilense bile mevcut push endpoint'ini
-- güvenli biçimde o an giriş yapmış kullanıcıya bağlar. Doğrudan upsert,
-- eski satır başka bir auth.uid()'ye ait olduğunda RLS nedeniyle güncelleyemez.
create or replace function public.upsert_push_subscription(
  p_device_id text,
  p_phone text,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_platform text,
  p_user_agent text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli';
  end if;
  if p_endpoint is null or p_endpoint = '' or p_p256dh is null or p_auth is null then
    raise exception 'Geçersiz push aboneliği';
  end if;

  insert into public.push_subscriptions (
    user_id, device_id, phone, endpoint, p256dh, auth, platform, user_agent, last_seen
  ) values (
    auth.uid(), p_device_id, nullif(p_phone, ''), p_endpoint, p_p256dh, p_auth,
    p_platform, p_user_agent, now()
  )
  on conflict (endpoint) do update set
    user_id = auth.uid(),
    device_id = excluded.device_id,
    phone = excluded.phone,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    platform = excluded.platform,
    user_agent = excluded.user_agent,
    last_seen = now();
end;
$$;
revoke all on function public.upsert_push_subscription(text, text, text, text, text, text, text) from public;
grant execute on function public.upsert_push_subscription(text, text, text, text, text, text, text) to authenticated;
create index if not exists push_subs_phone_idx on public.push_subscriptions (phone);
