-- AI Danny — Structured Brain (the "SQL layer")
-- ---------------------------------------------------------------------------
-- WHY: markdown notes + vector memories are great for fuzzy recall, terrible
-- for aggregate questions ("pipeline value?", "calls last month?", "avg sleep
-- this week?"). Those answers live in STRUCTURED rows the AI can query with a
-- tiny SQL statement instead of reading thousands of tokens of prose.
--
-- DESIGN PRINCIPLES
--   1. Every table is user-scoped (user_id) + RLS'd (multi-tenant safe).
--   2. Conventional, self-describing column names so the model writes correct
--      SQL on the first try.
--   3. COMMENT ON everything — describe_brain() surfaces these to the agent so
--      it learns the schema in ONE cheap call before querying.
--   4. Natural keys + UNIQUE constraints so ingestion is idempotent (upsert).
--   5. A single read-only entry point (ai_query) the agent uses — SELECT only.
--
-- Run AFTER 0003_briefings.sql in the Supabase SQL editor.
-- ---------------------------------------------------------------------------

-- =========================================================================
-- 1. PEOPLE — the hub everything else links to (prospects, clients, team…)
-- =========================================================================
create table if not exists public.people (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  full_name       text not null,
  email           text,
  company         text,
  title           text,
  relationship    text default 'other',  -- prospect | client | team | partner | personal | other
  first_met       date,
  last_contact_at timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(user_id, email)
);
comment on table public.people is 'Every person Daniel interacts with. Hub table — meetings, commitments, deals, revenue all reference it.';
comment on column public.people.relationship is 'One of: prospect, client, team, partner, personal, other.';
comment on column public.people.last_contact_at is 'Timestamp of most recent meeting/touch — use for "who haven''t I followed up with".';

create index if not exists people_user_idx on public.people(user_id);
create index if not exists people_relationship_idx on public.people(user_id, relationship);
create index if not exists people_name_idx on public.people(user_id, lower(full_name));

-- =========================================================================
-- 2. MEETINGS — one row per call (Sybill / Granola / manual). The structured
--    twin of the Obsidian note; the note holds the prose, this holds the facts.
-- =========================================================================
create table if not exists public.meetings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  source        text not null,            -- sybill | granola | manual
  external_id   text,                     -- id in the source system
  title         text not null,
  started_at    timestamptz,
  ended_at      timestamptz,
  duration_min  int,
  meeting_type  text,                     -- external | internal
  category      text,                     -- prospect_discovery | customer_checkin | …
  summary       text,
  recording_url text,
  source_url    text,
  obsidian_path text,                     -- relative path to the markdown note
  created_at    timestamptz not null default now(),
  unique(user_id, source, external_id)
);
comment on table public.meetings is 'One row per meeting/call. started_at is the real meeting time. Use for counts, durations, cadence.';
comment on column public.meetings.category is 'Sybill/Granola category: prospect_discovery, customer_checkin, internal, etc.';

create index if not exists meetings_user_started_idx on public.meetings(user_id, started_at desc);
create index if not exists meetings_category_idx on public.meetings(user_id, category);

-- meeting ↔ people (many-to-many)
create table if not exists public.meeting_attendees (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  person_id  uuid not null references public.people(id) on delete cascade,
  primary key (meeting_id, person_id)
);
comment on table public.meeting_attendees is 'Join table: which people attended which meeting.';

-- =========================================================================
-- 3. COMMITMENTS — extracted promises/action items (who owes what, by when)
-- =========================================================================
create table if not exists public.commitments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  description  text not null,
  owner_side   text default 'me',         -- me | them  (who is responsible)
  person_id    uuid references public.people(id) on delete set null,  -- counterparty
  meeting_id   uuid references public.meetings(id) on delete set null, -- source meeting
  due_date     date,
  status       text not null default 'open',  -- open | done | cancelled
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
comment on table public.commitments is 'Action items / promises. owner_side="me" = Daniel owes it. Use for "what''s overdue / what did I promise X".';

create index if not exists commitments_user_status_idx on public.commitments(user_id, status, due_date);
create index if not exists commitments_person_idx on public.commitments(person_id);

-- =========================================================================
-- 4. DEALS — sales pipeline
-- =========================================================================
create table if not exists public.deals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  person_id      uuid references public.people(id) on delete set null,
  company        text,
  stage          text not null default 'lead', -- lead | discovery | proposal | negotiation | won | lost
  value          numeric,
  currency       text default 'USD',
  probability    int,                          -- 0-100
  expected_close date,
  closed_at      date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.deals is 'Sales pipeline. Open pipeline = stage not in (won,lost). value*probability = weighted pipeline.';
comment on column public.deals.stage is 'lead, discovery, proposal, negotiation, won, lost.';

create index if not exists deals_user_stage_idx on public.deals(user_id, stage);
create index if not exists deals_close_idx on public.deals(user_id, expected_close);

-- =========================================================================
-- 5. REVENUE EVENTS — money in (and out, via refunds)
-- =========================================================================
create table if not exists public.revenue_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  deal_id      uuid references public.deals(id) on delete set null,
  person_id    uuid references public.people(id) on delete set null,
  amount       numeric not null,
  currency     text default 'USD',
  kind         text default 'one_time',   -- one_time | recurring | refund
  occurred_on  date not null,
  description  text,
  created_at   timestamptz not null default now()
);
comment on table public.revenue_events is 'Individual revenue events. Sum by month for MRR/revenue. kind=refund is negative impact.';

create index if not exists revenue_user_date_idx on public.revenue_events(user_id, occurred_on desc);

-- =========================================================================
-- 6. CONTENT POSTS — Daniel is a personal-branding founder; track post perf
-- =========================================================================
create table if not exists public.content_posts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  platform     text not null,             -- linkedin | x | instagram | youtube | newsletter
  title        text,
  url          text,
  posted_at    timestamptz,
  impressions  int default 0,
  likes        int default 0,
  comments     int default 0,
  shares       int default 0,
  saves        int default 0,
  leads        int default 0,             -- attributed leads/DMs
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(user_id, url)
);
comment on table public.content_posts is 'Published content + engagement. Use for "best performing posts", "posting cadence", "engagement rate".';

create index if not exists content_user_posted_idx on public.content_posts(user_id, posted_at desc);

-- =========================================================================
-- 7. TASKS — todos (distinct from commitments: these are self-assigned)
-- =========================================================================
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  status       text not null default 'todo', -- todo | doing | done | cancelled
  priority     text,                          -- low | medium | high
  due_date     date,
  project      text,
  person_id    uuid references public.people(id) on delete set null,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
comment on table public.tasks is 'Self-assigned todos. Use for "what''s on my plate", "overdue tasks".';

create index if not exists tasks_user_status_idx on public.tasks(user_id, status, due_date);

-- =========================================================================
-- 8. METRICS — quantified self / business KPIs, long (EAV) time-series format
--    sleep_hours, resting_hr, run_distance_km, weight_kg, deep_work_hours,
--    mood, mrr, cash_balance, … one row per (metric, day, source).
-- =========================================================================
create table if not exists public.metric_definitions (
  key         text primary key,           -- snake_case identifier
  label       text not null,
  unit        text,
  description text,
  category    text                         -- health | fitness | finance | productivity | business
);
comment on table public.metric_definitions is 'Catalog of known metric keys. The agent reads this to know WHICH metrics exist before querying the metrics table.';

create table if not exists public.metrics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  metric_key  text not null references public.metric_definitions(key) on delete cascade,
  metric_date date not null,
  value_num   numeric,
  value_text  text,
  source      text default 'manual',       -- apple_health | whoop | strava | oura | manual | …
  created_at  timestamptz not null default now(),
  unique(user_id, metric_key, metric_date, source)
);
comment on table public.metrics is 'Daily time-series values. One row per metric per day per source. value_num for numbers, value_text for labels.';

create index if not exists metrics_user_key_date_idx on public.metrics(user_id, metric_key, metric_date desc);

-- Seed a starter catalog (safe to edit/extend later)
insert into public.metric_definitions (key, label, unit, description, category) values
  ('sleep_hours',     'Sleep',            'hours', 'Total sleep duration that night',        'health'),
  ('resting_hr',      'Resting HR',       'bpm',   'Resting heart rate',                     'health'),
  ('hrv',             'HRV',              'ms',    'Heart rate variability',                 'health'),
  ('weight_kg',       'Weight',           'kg',    'Body weight',                            'health'),
  ('run_distance_km', 'Run distance',     'km',    'Distance run that day',                  'fitness'),
  ('steps',           'Steps',            'count', 'Daily step count',                       'fitness'),
  ('deep_work_hours', 'Deep work',        'hours', 'Hours of focused deep work',             'productivity'),
  ('mood',            'Mood',             '1-10',  'Self-rated mood',                        'health'),
  ('mrr',             'MRR',              'USD',   'Monthly recurring revenue snapshot',     'business'),
  ('cash_balance',    'Cash balance',     'USD',   'Business cash on hand',                  'finance')
on conflict (key) do nothing;

-- =========================================================================
-- RLS — owner sees all; each user sees only their own rows. Writes happen
-- server-side via the service role (which bypasses RLS), so we only need
-- SELECT policies here for the authenticated read path.
-- =========================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'people','meetings','meeting_attendees','commitments','deals',
    'revenue_events','content_posts','tasks','metrics'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($p$
      drop policy if exists "%1$s: read own" on public.%1$s;
    $p$, t);
  end loop;
end $$;

-- meeting_attendees has no user_id column — gate it through its parent meeting.
create policy "people: read own" on public.people for select
  using (auth.uid() = user_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));
create policy "meetings: read own" on public.meetings for select
  using (auth.uid() = user_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));
create policy "meeting_attendees: read own" on public.meeting_attendees for select
  using (exists(select 1 from public.meetings m where m.id = meeting_id
               and (m.user_id = auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'))));
create policy "commitments: read own" on public.commitments for select
  using (auth.uid() = user_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));
create policy "deals: read own" on public.deals for select
  using (auth.uid() = user_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));
create policy "revenue_events: read own" on public.revenue_events for select
  using (auth.uid() = user_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));
create policy "content_posts: read own" on public.content_posts for select
  using (auth.uid() = user_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));
create policy "tasks: read own" on public.tasks for select
  using (auth.uid() = user_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));
create policy "metrics: read own" on public.metrics for select
  using (auth.uid() = user_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));

-- =========================================================================
-- AI ENTRY POINTS
-- =========================================================================

-- describe_brain(): compact schema + column comments so the agent learns the
-- structured layer in one cheap call before writing any query.
create or replace function public.describe_brain()
returns table(table_name text, column_name text, data_type text, note text)
language sql stable security definer set search_path = public as $$
  select c.table_name::text,
         c.column_name::text,
         c.data_type::text,
         col_description(format('public.%I', c.table_name)::regclass::oid, c.ordinal_position)::text
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name in ('people','meetings','meeting_attendees','commitments',
                         'deals','revenue_events','content_posts','tasks',
                         'metric_definitions','metrics')
  order by c.table_name, c.ordinal_position;
$$;
comment on function public.describe_brain is 'Returns the structured-brain schema (tables/columns/comments) for the AI to read before writing SQL.';

-- ai_query(): the ONLY way the agent runs SQL. SELECT-only, single-statement,
-- DDL/DML forbidden. Returns rows as JSON. Read-only by construction.
create or replace function public.ai_query(query_text text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
  cleaned text := btrim(query_text);
begin
  -- must start with SELECT or WITH (CTE)
  if cleaned !~* '^(select|with)\s' then
    raise exception 'ai_query: only SELECT/WITH queries are allowed';
  end if;
  -- single statement only (no stacked queries)
  if rtrim(cleaned, ';') ~ ';' then
    raise exception 'ai_query: only a single statement is allowed';
  end if;
  -- block write / DDL keywords as whole words
  if cleaned ~* '\m(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|merge|call|do)\M' then
    raise exception 'ai_query: write/DDL keywords are not allowed';
  end if;

  execute format('select coalesce(jsonb_agg(row_to_json(q)), ''[]''::jsonb) from (%s) q',
                 rtrim(cleaned, ';'))
    into result;
  return result;
end;
$$;
comment on function public.ai_query is 'Read-only SQL entry point for the AI agent. SELECT/WITH only, single statement, returns JSON rows.';

-- updated_at touch trigger for the mutable tables
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists people_touch on public.people;
create trigger people_touch before update on public.people
  for each row execute function public.touch_updated_at();
drop trigger if exists deals_touch on public.deals;
create trigger deals_touch before update on public.deals
  for each row execute function public.touch_updated_at();
drop trigger if exists content_touch on public.content_posts;
create trigger content_touch before update on public.content_posts
  for each row execute function public.touch_updated_at();
