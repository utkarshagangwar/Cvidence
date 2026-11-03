-- Phase 5: launch hardening.
--
-- consent        profiles.consented_at / consent_version: no AI step runs before it
-- rate limits    fixed-window counters in Postgres (memory doesn't survive serverless)
-- ai_status()    lets signed-in users see whether AI is paused today (nothing else)
-- usage report   one JSON summary per IST day for the operator email

alter table public.profiles add column if not exists consented_at timestamptz;
alter table public.profiles add column if not exists consent_version text check (char_length(consent_version) <= 20);

-- --------------------------------------------------------------- rate limits
create table if not exists public.rate_hits (
  key          text not null check (char_length(key) <= 120),
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_hits enable row level security;
revoke all on table public.rate_hits from anon, authenticated;

-- True while `key` is within `p_max` hits in the current window. One atomic upsert.
create or replace function public.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language sql
security definer
set search_path = ''
as $$
  insert into public.rate_hits as r (key, window_start, hits)
  values (p_key, to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds), 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits <= p_max;
$$;

create or replace function public.prune_rate_hits()
returns integer
language sql
security definer
set search_path = ''
as $$
  with d as (delete from public.rate_hits where window_start < now() - interval '1 hour' returning 1)
  select count(*)::integer from d;
$$;

-- --------------------------------------------------------------- AI status
create or replace function public.ai_status()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select paused from public.platform_budget where day = public.ist_today()), false);
$$;

-- --------------------------------------------------------------- usage report
create or replace function public.daily_usage_report(p_day date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'day', p_day,
    'active_users', (select count(distinct user_id) from public.usage_ledger where day = p_day and status = 'committed'),
    'credits', (select coalesce(sum(credits), 0) from public.usage_ledger where day = p_day and status = 'committed'),
    'refunded', (select count(*) from public.usage_ledger where day = p_day and status = 'refunded'),
    'tokens', (select coalesce(sum(tokens_in + tokens_out), 0) from public.usage_ledger where day = p_day),
    'by_task', (select coalesce(jsonb_object_agg(task, n), '{}'::jsonb) from (select task, count(*) n from public.usage_ledger where day = p_day and status = 'committed' group by task) t),
    'errors', (select coalesce(jsonb_object_agg(error_code, n), '{}'::jsonb) from (select error_code, count(*) n from public.usage_ledger where day = p_day and error_code is not null group by error_code) e),
    'paused', coalesce((select paused from public.platform_budget where day = p_day), false),
    'cap', (select cap from public.platform_budget where day = p_day),
    'signups', (select count(*) from auth.users where created_at >= p_day::timestamp - interval '5 hours 30 minutes' and created_at < p_day::timestamp + interval '18 hours 30 minutes'),
    'postings_open', (select count(*) from public.postings where closed_at is null),
    'boards_flagged', (select count(*) from public.job_sources where flagged_at is not null),
    'agent_runs', (select count(*) from public.agent_runs where day = p_day),
    'queue_failed', (select count(*) from public.job_queue where state = 'failed' and created_at > now() - interval '1 day')
  );
$$;

revoke all on function public.hit_rate_limit(text, integer, integer), public.prune_rate_hits(), public.daily_usage_report(date) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer), public.prune_rate_hits(), public.daily_usage_report(date) to service_role;
revoke all on function public.ai_status() from public, anon;
grant execute on function public.ai_status() to authenticated, service_role;
