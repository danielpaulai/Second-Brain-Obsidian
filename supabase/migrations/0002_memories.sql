-- AI Danny — cross-session memory (Phase 3)
-- Run this in your Supabase Dashboard → SQL Editor AFTER 0001_profiles.sql.

-- 1. Enable pgvector for semantic memory search
create extension if not exists vector;

-- 2. Memories table — one row per durable fact extracted from a conversation
create table if not exists public.memories (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  text          text not null,
  embedding     vector(1536),               -- text-embedding-3-small dimensions
  kind          text default 'fact',         -- fact / preference / context / commitment
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now(),
  use_count     int not null default 0
);

-- 3. Index for fast similarity search
create index if not exists memories_embedding_idx
  on public.memories
  using hnsw (embedding vector_cosine_ops);

create index if not exists memories_user_idx
  on public.memories(user_id, created_at desc);

-- 4. Row-Level Security — each user only sees their own memories.
--    Owner can see all (for admin / debugging).
alter table public.memories enable row level security;

drop policy if exists "memories: read own" on public.memories;
create policy "memories: read own"
  on public.memories for select
  using ( auth.uid() = user_id or
          exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner') );

drop policy if exists "memories: insert own" on public.memories;
create policy "memories: insert own"
  on public.memories for insert
  with check ( auth.uid() = user_id );

drop policy if exists "memories: update own" on public.memories;
create policy "memories: update own"
  on public.memories for update
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );

drop policy if exists "memories: delete own" on public.memories;
create policy "memories: delete own"
  on public.memories for delete
  using ( auth.uid() = user_id );

-- 5. RPC for cosine-similarity search (called from the server with the service role)
create or replace function public.match_memories (
  query_embedding vector(1536),
  target_user_id  uuid,
  match_count     int default 5,
  similarity_threshold float default 0.45
)
returns table (
  id            uuid,
  text          text,
  kind          text,
  similarity    float,
  created_at    timestamptz
)
language sql stable as $$
  select
    m.id,
    m.text,
    m.kind,
    1 - (m.embedding <=> query_embedding) as similarity,
    m.created_at
  from public.memories m
  where m.user_id = target_user_id
    and m.embedding is not null
    and 1 - (m.embedding <=> query_embedding) > similarity_threshold
  order by m.embedding <=> query_embedding
  limit match_count;
$$;
