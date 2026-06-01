-- AI Danny — initial Supabase schema
-- Run this in your Supabase Dashboard → SQL Editor.

-- 1. Profiles table — one row per auth user, holds role + display info
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  role        text not null default 'team' check (role in ('owner', 'team', 'public')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-update timestamp
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

-- 2. Auto-create a profile when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    'team'  -- new sign-ups default to team; promote to owner manually
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Row-Level Security — each user can read their own profile.
--    Owner can read+write all (for the admin panel).
alter table public.profiles enable row level security;

drop policy if exists "Profiles: read own" on public.profiles;
create policy "Profiles: read own"
  on public.profiles for select
  using ( auth.uid() = id or
          exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner') );

drop policy if exists "Profiles: update own" on public.profiles;
create policy "Profiles: update own"
  on public.profiles for update
  using ( auth.uid() = id )
  with check ( auth.uid() = id );

-- 4. Team-question log (replaces the per-vault file logging from Phase 1)
create table if not exists public.team_questions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  question     text not null,
  answer       text not null,
  cited_notes  text[] default '{}',
  created_at   timestamptz not null default now()
);

alter table public.team_questions enable row level security;

drop policy if exists "team_questions: read own" on public.team_questions;
create policy "team_questions: read own"
  on public.team_questions for select
  using ( auth.uid() = user_id or
          exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner') );

drop policy if exists "team_questions: insert own" on public.team_questions;
create policy "team_questions: insert own"
  on public.team_questions for insert
  with check ( auth.uid() = user_id );

-- 5. Helpful index
create index if not exists team_questions_user_idx on public.team_questions(user_id, created_at desc);
