-- AI Danny — Identity & Knowledge layer (the "who Danny is / what Danny knows")
-- ---------------------------------------------------------------------------
-- 0004 captured OPERATIONS (what happened: meetings, deals, revenue, metrics).
-- 0005 captures IDENTITY + PLAYBOOK (how Danny thinks, sells, sounds, decides).
--
-- These are the PRECISE-RETRIEVAL INDEX over knowledge that already lives in
-- prose (MASTER.md, voice.md, the 266 distilled categories). The agent queries
-- a few rows ("my rebuttals for a price objection") instead of loading whole
-- documents. Deep nuance still lives in the vault; this is the queryable map.
--
-- Population: a one-time distillation pass reads the vault + distilled
-- categories and fills these rows; then they're refined incrementally.
--
-- Run AFTER 0004_structured_brain.sql.
-- ---------------------------------------------------------------------------

-- =========================================================================
-- A. OFFERS & SALES PLAYBOOK
-- =========================================================================

create table if not exists public.offers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  tagline      text,
  tier         text,                       -- entry | core | premium | enterprise
  price        numeric,
  currency     text default 'USD',
  billing      text,                       -- one_time | monthly | retainer | usage
  deliverables text[],
  ideal_client text,
  positioning  text,                       -- the one-line "why this, why now, why Danny"
  guarantee    text,
  status       text default 'active',      -- active | retired | draft
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.offers is 'Productized offers/packages Danny sells. Query for pricing, positioning, what is currently active.';

create table if not exists public.offer_objections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  offer_id   uuid references public.offers(id) on delete cascade,
  objection  text not null,
  rebuttal   text not null,
  category   text,                          -- price | trust | timing | fit | authority
  created_at timestamptz not null default now()
);
comment on table public.offer_objections is 'Objection → Danny''s rebuttal. Query by category to handle a live objection in his voice.';

create table if not exists public.case_studies (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  client_name  text,
  person_id    uuid references public.people(id) on delete set null,
  offer_id     uuid references public.offers(id) on delete set null,
  before_state text,
  after_state  text,
  key_metric   text,                        -- e.g. "MRR", "followers", "close rate"
  result_value text,                        -- e.g. "0 → 40k", "+312%"
  quote        text,
  timeframe    text,                        -- e.g. "90 days"
  created_at   timestamptz not null default now()
);
comment on table public.case_studies is 'Client transformations/results. Use as proof in content + sales. Query by metric or offer.';

create table if not exists public.icp_segments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  description   text,
  pains         text[],
  desires       text[],
  where_to_find text,
  disqualifiers text[],
  created_at    timestamptz not null default now()
);
comment on table public.icp_segments is 'Ideal customer profiles. Query to qualify a prospect or target content.';

-- =========================================================================
-- B. PROBLEM → SOLUTION KNOWLEDGE BASE
-- =========================================================================

create table if not exists public.client_problems (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  problem     text not null,
  domain      text,                         -- marketing | sales | ops | mindset | content | offer
  symptoms    text[],
  root_cause  text,
  severity    text,                         -- low | medium | high
  frequency   text,                         -- how often Danny sees this (rare|common|constant)
  created_at  timestamptz not null default now()
);
comment on table public.client_problems is 'Recurring problems clients bring. Pair with solutions via solutions.problem_id.';

create table if not exists public.solutions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  problem_id      uuid references public.client_problems(id) on delete cascade,
  solution        text not null,
  approach        text,                      -- the how, step by step
  framework_id    uuid,                      -- references frameworks(id) (set below)
  typical_outcome text,
  time_to_result  text,
  created_at      timestamptz not null default now()
);
comment on table public.solutions is 'How Danny solves a client_problem. Query problem→solution for advice in his actual method.';

create table if not exists public.common_issues (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  issue        text not null,
  area         text,                         -- delivery | tooling | team | client_mgmt | content_ops
  trigger      text,                         -- what causes it
  standard_fix text,
  prevention   text,
  created_at   timestamptz not null default now()
);
comment on table public.common_issues is 'Recurring INTERNAL/operational issues + Danny''s standard fix (distinct from client_problems).';

create table if not exists public.frameworks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  acronym     text,
  summary     text,
  steps       text[],
  when_to_use text,
  source_note text,                          -- vault note title it was distilled from
  created_at  timestamptz not null default now()
);
comment on table public.frameworks is 'Named methodologies/mental models Danny uses. Query by name or when_to_use.';

-- now that frameworks exists, point solutions.framework_id at it
alter table public.solutions
  drop constraint if exists solutions_framework_fk;
alter table public.solutions
  add constraint solutions_framework_fk
  foreign key (framework_id) references public.frameworks(id) on delete set null;

-- =========================================================================
-- C. VOICE, TONE & PERSONALITY
-- =========================================================================

create table if not exists public.voice_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  rule_type   text not null,                 -- do | avoid
  rule        text not null,
  reason      text,
  example_good text,
  example_bad text,
  category    text,                          -- word | phrase | structure | tone | formatting
  created_at  timestamptz not null default now()
);
comment on table public.voice_rules is 'Concrete do/avoid language rules. Query rule_type=avoid before writing to filter AI-slop; do for style.';

create table if not exists public.tone_profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  context     text not null,                 -- sales | content | coaching | internal | dm | email
  description text,
  energy      text,                          -- low | medium | high
  formality   text,                          -- casual | neutral | formal
  pacing      text,                          -- punchy | conversational | measured
  created_at  timestamptz not null default now(),
  unique(user_id, context)
);
comment on table public.tone_profiles is 'How Danny''s tone shifts by context. Query by context before generating in that channel.';

create table if not exists public.personality_traits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  trait       text not null,
  description text,
  how_it_shows text,                         -- behavioural manifestation
  intensity   int,                           -- 1-10
  created_at  timestamptz not null default now()
);
comment on table public.personality_traits is 'Core personality traits + how they manifest. Shapes how the agent behaves, not just speaks.';

create table if not exists public.decision_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  situation     text not null,               -- the trigger/context
  heuristic     text not null,               -- the rule of thumb
  default_action text,
  rationale     text,
  priority      int default 5,               -- 1=highest. resolves conflicts between rules
  tags          text[],
  created_at    timestamptz not null default now()
);
comment on table public.decision_rules is 'Danny''s decision-making tree: situation → heuristic → default action. Query by situation/tag to decide like Danny.';

create table if not exists public.principles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  principle   text not null,
  statement   text,                          -- the full belief in Danny's words
  applies_to  text,                          -- life | business | content | sales | team
  created_at  timestamptz not null default now()
);
comment on table public.principles is 'Core values/operating beliefs. The "why" behind decisions.';

create table if not exists public.signature_phrases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  phrase        text not null,
  meaning       text,
  usage_context text,
  category      text,                         -- hook | transition | close | reframe | catchphrase
  created_at    timestamptz not null default now()
);
comment on table public.signature_phrases is 'Danny''s actual recurring phrasings. Sprinkle these so generated text sounds like him.';

create table if not exists public.stories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  summary     text,
  lesson      text,
  when_to_use text,
  characters  text[],
  created_at  timestamptz not null default now()
);
comment on table public.stories is 'Signature stories/anecdotes Danny tells. Query by lesson/when_to_use to illustrate a point in his voice.';

-- =========================================================================
-- D. CONTENT KNOWLEDGE
-- =========================================================================

create table if not exists public.content_pillars (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  pillar            text not null,
  description       text,
  angle             text,
  proof_points      text[],
  target_segment_id uuid references public.icp_segments(id) on delete set null,
  created_at        timestamptz not null default now()
);
comment on table public.content_pillars is 'Content themes Danny posts on + the angle + proof. Query to plan/score content.';

create table if not exists public.hooks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  hook             text not null,
  format           text,                      -- question | stat | story | contrarian | listicle | confession
  topic            text,
  performance_note text,
  post_id          uuid references public.content_posts(id) on delete set null,
  created_at       timestamptz not null default now()
);
comment on table public.hooks is 'Proven opening hooks + their format/topic. Query by topic/format when writing new content.';

-- =========================================================================
-- RLS — owner sees all; each user only their own. (Standard pattern.)
-- =========================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'offers','offer_objections','case_studies','icp_segments',
    'client_problems','solutions','common_issues','frameworks',
    'voice_rules','tone_profiles','personality_traits','decision_rules',
    'principles','signature_phrases','stories','content_pillars','hooks'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%s: read own" on public.%I;', t, t);
    execute format(
      'create policy "%1$s: read own" on public.%1$I for select using ' ||
      '(auth.uid() = user_id or exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = ''owner''));',
      t
    );
    execute format('drop trigger if exists %s_touch_ins on public.%I;', t, t);
  end loop;
end $$;

-- updated_at touch for offers (the main mutable one)
drop trigger if exists offers_touch on public.offers;
create trigger offers_touch before update on public.offers
  for each row execute function public.touch_updated_at();

-- =========================================================================
-- Extend describe_brain() to include ALL tables (0004 + 0005) so the agent
-- sees the full structured + identity schema in one call.
-- =========================================================================
create or replace function public.describe_brain()
returns table(table_name text, column_name text, data_type text, note text)
language sql stable security definer set search_path = public as $$
  select c.table_name::text,
         c.column_name::text,
         c.data_type::text,
         col_description(format('public.%I', c.table_name)::regclass::oid, c.ordinal_position)::text
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name in (
      -- operational (0004)
      'people','meetings','meeting_attendees','commitments','deals',
      'revenue_events','content_posts','tasks','metric_definitions','metrics',
      -- identity + knowledge (0005)
      'offers','offer_objections','case_studies','icp_segments',
      'client_problems','solutions','common_issues','frameworks',
      'voice_rules','tone_profiles','personality_traits','decision_rules',
      'principles','signature_phrases','stories','content_pillars','hooks'
    )
  order by c.table_name, c.ordinal_position;
$$;
