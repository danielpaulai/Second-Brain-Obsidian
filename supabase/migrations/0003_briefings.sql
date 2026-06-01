-- AI Danny — Cadence layer (P-Cadence)
-- Stores generated briefings (morning brief, weekly review, etc.) and a thin
-- log of meetings already processed so the post-meeting capture job is
-- idempotent. Run AFTER 0002_memories.sql.

-- 1. Briefings — one row per scheduled run (morning, weekly, etc.)
create table if not exists public.briefings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null,            -- 'morning' | 'weekly' | 'ad-hoc'
  title         text not null,
  body          text not null,            -- markdown
  meta          jsonb default '{}'::jsonb, -- tool calls, sources, latency
  created_at    timestamptz not null default now()
);

create index if not exists briefings_user_created_idx
  on public.briefings(user_id, created_at desc);

create index if not exists briefings_kind_idx
  on public.briefings(user_id, kind, created_at desc);

alter table public.briefings enable row level security;

drop policy if exists "briefings: read own" on public.briefings;
create policy "briefings: read own"
  on public.briefings for select
  using ( auth.uid() = user_id or
          exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner') );

-- Inserts/updates are done by the cron route via the service role only.
-- Users can delete their own briefings (clean up / privacy).
drop policy if exists "briefings: delete own" on public.briefings;
create policy "briefings: delete own"
  on public.briefings for delete
  using ( auth.uid() = user_id );

-- 2. Processed meetings — idempotency log for the post-meeting capture job.
--    Granola meeting IDs we've already pulled commitments from.
create table if not exists public.processed_meetings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  meeting_id      text not null,           -- external (Granola) id
  meeting_title   text,
  meeting_ended_at timestamptz,
  memories_added  int not null default 0,
  processed_at    timestamptz not null default now(),
  unique(user_id, meeting_id)
);

create index if not exists processed_meetings_user_idx
  on public.processed_meetings(user_id, processed_at desc);

alter table public.processed_meetings enable row level security;

drop policy if exists "processed_meetings: read own" on public.processed_meetings;
create policy "processed_meetings: read own"
  on public.processed_meetings for select
  using ( auth.uid() = user_id or
          exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner') );
