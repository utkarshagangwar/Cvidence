-- Phase 2: job ingestion and search.
--
-- job_sources   the catalog of boards. `adapter` names code in lib/jobs/adapters
--               (plain text, not an enum, so a new board type needs no migration).
--               Edit rows in the Supabase table editor: no deploy needed.
-- postings      every job fetched, shared by all users. Written by the worker only.
-- user_postings each user's saved / dismissed / score for a posting.
-- job_queue     work for the worker (one ingest job per source).

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------- job_sources
create table if not exists public.job_sources (
  id           uuid primary key default gen_random_uuid(),
  adapter      text not null check (adapter ~ '^[a-z0-9_]{2,40}$'),
  slug         text not null check (slug ~ '^[A-Za-z0-9._-]{1,80}$'),
  company      text not null check (char_length(company) between 1 and 200),
  -- Extra settings for adapters that need them (for example a search query for a
  -- paid search API). Never put API keys here: keys live in server env vars.
  config       jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  enabled      boolean not null default true,
  last_run_at  timestamptz,
  last_ok_at   timestamptz,
  last_count   integer,
  zero_streak  integer not null default 0,
  flagged_at   timestamptz,
  last_error   text check (char_length(last_error) <= 300),
  created_at   timestamptz not null default now(),
  unique (adapter, slug)
);

-- ------------------------------------------------------------------- postings
create table if not exists public.postings (
  id               uuid primary key default gen_random_uuid(),
  source_id        uuid not null references public.job_sources (id) on delete cascade,
  adapter          text not null,
  external_id      text not null check (char_length(external_id) between 1 and 200),
  title            text not null check (char_length(title) between 1 and 300),
  company          text not null check (char_length(company) <= 200),
  location         text not null default '' check (char_length(location) <= 300),
  remote           boolean,
  employment_type  text not null default '' check (char_length(employment_type) <= 60),
  salary           text not null default '' check (char_length(salary) <= 200),
  url              text not null check (url ~ '^https://' and char_length(url) <= 1000),
  description      text not null default '' check (char_length(description) <= 20000),
  posted_at        timestamptz,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  closed_at        timestamptz,
  unique (source_id, external_id)
);
create index if not exists postings_open_recent_idx on public.postings ((coalesce(posted_at, first_seen_at)) desc) where closed_at is null;
create index if not exists postings_title_trgm_idx on public.postings using gin (title extensions.gin_trgm_ops);

-- -------------------------------------------------------------- user_postings
create table if not exists public.user_postings (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  posting_id   uuid not null references public.postings (id) on delete cascade,
  saved_at     timestamptz,
  dismissed_at timestamptz,
  score        integer check (score between 0 and 100),
  reasons      jsonb not null default '[]'::jsonb,
  red_flags    jsonb not null default '[]'::jsonb,
  scored_with  text check (char_length(scored_with) <= 60),
  scored_at    timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (user_id, posting_id)
);
drop trigger if exists user_postings_updated_at on public.user_postings;
create trigger user_postings_updated_at before update on public.user_postings
  for each row execute function public.set_updated_at();

-- An application can point at the posting it came from.
alter table public.applications drop constraint if exists applications_posting_fk;
alter table public.applications add constraint applications_posting_fk foreign key (posting_id) references public.postings (id) on delete set null;

-- ------------------------------------------------------------------ job_queue
create table if not exists public.job_queue (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('ingest_source')),
  source_id   uuid references public.job_sources (id) on delete cascade,
  state       text not null default 'queued' check (state in ('queued', 'running', 'done', 'failed')),
  attempts    integer not null default 0,
  run_after   timestamptz not null default now(),
  locked_at   timestamptz,
  error       text check (char_length(error) <= 300),
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists job_queue_ready_idx on public.job_queue (run_after) where state = 'queued';
-- At most one open ingest job per source, so overlapping cron runs can't pile up.
create unique index if not exists job_queue_one_open_per_source on public.job_queue (source_id) where state in ('queued', 'running');

-- ------------------------------------------------------------------------ RLS
alter table public.job_sources enable row level security;
alter table public.postings enable row level security;
alter table public.user_postings enable row level security;
alter table public.job_queue enable row level security;

revoke all on table public.job_sources, public.postings, public.user_postings, public.job_queue from anon;
revoke all on table public.job_queue from authenticated;
revoke insert, update, delete on table public.job_sources, public.postings from authenticated;

-- Signed-in users can read the catalog and postings; only the worker (service role) writes them.
drop policy if exists job_sources_read on public.job_sources;
create policy job_sources_read on public.job_sources for select to authenticated using (true);
drop policy if exists postings_read on public.postings;
create policy postings_read on public.postings for select to authenticated using (true);
drop policy if exists user_postings_owner on public.user_postings;
create policy user_postings_owner on public.user_postings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ------------------------------------------------------------- queue functions
-- One ingest job per enabled source (skips sources that already have one open).
create or replace function public.enqueue_ingest()
returns integer
language sql
security definer
set search_path = ''
as $$
  with ins as (
    insert into public.job_queue (kind, source_id)
    select 'ingest_source', s.id from public.job_sources s where s.enabled
    on conflict do nothing
    returning 1
  )
  select count(*)::integer from ins;
$$;

-- Claims up to n ready jobs for one worker. SKIP LOCKED lets two workers run safely.
-- Jobs stuck in 'running' for 10 minutes (a crashed worker) are claimable again.
create or replace function public.claim_jobs(n integer)
returns setof public.job_queue
language sql
security definer
set search_path = ''
as $$
  update public.job_queue q
     set state = 'running', locked_at = now(), attempts = q.attempts + 1
   where q.id in (
     select id from public.job_queue
      where (state = 'queued' and run_after <= now())
         or (state = 'running' and locked_at < now() - interval '10 minutes')
      order by run_after
      limit least(greatest(n, 1), 50)
      for update skip locked
   )
  returning q.*;
$$;

-- Weekly health check: flag boards that returned zero jobs three runs in a row.
create or replace function public.flag_dead_sources()
returns integer
language sql
security definer
set search_path = ''
as $$
  with f as (
    update public.job_sources set flagged_at = now()
     where zero_streak >= 3 and flagged_at is null
    returning 1
  )
  select count(*)::integer from f;
$$;

revoke all on function public.enqueue_ingest(), public.claim_jobs(integer), public.flag_dead_sources() from public, anon, authenticated;
grant execute on function public.enqueue_ingest(), public.claim_jobs(integer), public.flag_dead_sources() to service_role;

-- --------------------------------------------------------------- seed catalog
-- Every slug below was checked live on 2026-11-03 and had India-based or remote jobs.
insert into public.job_sources (adapter, slug, company) values
  ('greenhouse', 'airbnb', 'Airbnb'),
  ('greenhouse', 'chargepoint', 'ChargePoint'),
  ('greenhouse', 'coinbase', 'Coinbase'),
  ('greenhouse', 'databricks', 'Databricks'),
  ('greenhouse', 'datadog', 'Datadog'),
  ('greenhouse', 'druva', 'Druva'),
  ('greenhouse', 'elastic', 'Elastic'),
  ('greenhouse', 'figma', 'Figma'),
  ('greenhouse', 'gitlab', 'GitLab'),
  ('greenhouse', 'glance', 'Glance'),
  ('greenhouse', 'groww', 'Groww'),
  ('greenhouse', 'hackerrank', 'HackerRank'),
  ('greenhouse', 'highradius', 'HighRadius'),
  ('greenhouse', 'inmobi', 'InMobi'),
  ('greenhouse', 'mongodb', 'MongoDB'),
  ('greenhouse', 'newrelic', 'New Relic'),
  ('greenhouse', 'observeai', 'Observe.AI'),
  ('greenhouse', 'okta', 'Okta'),
  ('greenhouse', 'rubrik', 'Rubrik'),
  ('greenhouse', 'sigmoid', 'Sigmoid'),
  ('greenhouse', 'stripe', 'Stripe'),
  ('greenhouse', 'sumologic', 'Sumo Logic'),
  ('greenhouse', 'twilio', 'Twilio'),
  ('greenhouse', 'zscaler', 'Zscaler'),
  ('lever', 'cred', 'CRED'),
  ('lever', 'fampay', 'FamPay'),
  ('lever', 'hevodata', 'Hevo Data'),
  ('lever', 'meesho', 'Meesho'),
  ('lever', 'mindtickle', 'Mindtickle'),
  ('lever', 'paytm', 'Paytm'),
  ('lever', 'zeta', 'Zeta'),
  ('ashby', 'atlan', 'Atlan'),
  ('ashby', 'snowflake', 'Snowflake'),
  ('ashby', 'spotdraft', 'SpotDraft'),
  ('ashby', 'tekion', 'Tekion'),
  ('workable', 'apna', 'apna')
on conflict (adapter, slug) do nothing;
