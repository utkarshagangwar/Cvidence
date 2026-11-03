-- Phase 4: the daily agent.
--
-- agent_settings  per user: on/off (off by default), saved search, score threshold,
--                 how many drafts at most, morning email on/off
-- agent_runs      one row per user per IST day (unique), so the agent can never
--                 run twice in a day. Written by the worker only.
-- job_queue       gains agent jobs: agent_run (search + score), agent_draft (one
--                 posting -> application + tailored resume), agent_digest (email)

create table if not exists public.agent_settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled     boolean not null default false,
  filters     jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object' and pg_column_size(filters) < 4000),
  threshold   integer not null default 70 check (threshold between 40 and 95),
  max_drafts  integer not null default 3 check (max_drafts between 1 and 5),
  digest      boolean not null default true,
  updated_at  timestamptz not null default now()
);
drop trigger if exists agent_settings_updated_at on public.agent_settings;
create trigger agent_settings_updated_at before update on public.agent_settings
  for each row execute function public.set_updated_at();

create table if not exists public.agent_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  day         date not null,
  state       text not null default 'queued' check (state in ('queued', 'running', 'done', 'failed', 'skipped')),
  found       integer not null default 0,
  scored      integer not null default 0,
  drafted     integer not null default 0,
  note        text check (char_length(note) <= 300),
  emailed_at  timestamptz,
  created_at  timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, day)
);

alter table public.agent_settings enable row level security;
alter table public.agent_runs enable row level security;
revoke all on table public.agent_settings, public.agent_runs from anon;
revoke insert, update, delete on table public.agent_runs from authenticated;
drop policy if exists agent_settings_owner on public.agent_settings;
create policy agent_settings_owner on public.agent_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists agent_runs_read_own on public.agent_runs;
create policy agent_runs_read_own on public.agent_runs for select to authenticated
  using (user_id = (select auth.uid()));

-- Queue: agent jobs carry a user and a small payload.
alter table public.job_queue add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.job_queue add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.job_queue drop constraint if exists job_queue_kind_check;
alter table public.job_queue add constraint job_queue_kind_check
  check (kind in ('ingest_source', 'agent_run', 'agent_draft', 'agent_digest'));
alter table public.job_queue drop constraint if exists job_queue_agent_user;
alter table public.job_queue add constraint job_queue_agent_user check (kind = 'ingest_source' or user_id is not null);

create index if not exists applications_review_idx on public.applications (user_id) where awaiting_review;

-- Daily (from pg_cron): one agent_run per enabled user for today (IST). The
-- unique (user_id, day) makes a second call the same day do nothing.
create or replace function public.enqueue_agent_runs()
returns integer
language sql
security definer
set search_path = ''
as $$
  with runs as (
    insert into public.agent_runs (user_id, day)
    select s.user_id, public.ist_today() from public.agent_settings s where s.enabled
    on conflict (user_id, day) do nothing
    returning id, user_id
  ),
  jobs as (
    insert into public.job_queue (kind, user_id, payload)
    select 'agent_run', r.user_id, jsonb_build_object('run_id', r.id) from runs r
    returning 1
  )
  select count(*)::integer from jobs;
$$;
revoke all on function public.enqueue_agent_runs() from public, anon, authenticated;
grant execute on function public.enqueue_agent_runs() to service_role;
