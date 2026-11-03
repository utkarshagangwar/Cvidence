-- Cvidence · AI credit ledger and platform-wide daily token cap
-- Credits are reserved BEFORE a model call and committed or refunded after it.
-- Only the service role can write; users can read their own ledger rows.
-- "Day" is the calendar day in India (credits reset at midnight IST).

create or replace function public.ist_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Kolkata')::date;
$$;

create table if not exists public.usage_ledger (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  day            date not null,
  task           text not null check (task in (
                   'extract', 'match', 'tailor_resume', 'cover_letter',
                   'outreach_email', 'refine', 'screen_batch')),
  credits        integer not null check (credits between 1 and 25),
  status         text not null default 'reserved'
                   check (status in ('reserved', 'committed', 'refunded')),
  provider       text,
  model          text,
  prompt_version text,
  tokens_in      integer not null default 0 check (tokens_in >= 0),
  tokens_out     integer not null default 0 check (tokens_out >= 0),
  error_code     text check (error_code is null or char_length(error_code) <= 64),
  created_at     timestamptz not null default now(),
  settled_at     timestamptz
);

create index if not exists usage_ledger_user_day_idx on public.usage_ledger (user_id, day);
create index if not exists usage_ledger_reserved_idx on public.usage_ledger (created_at) where status = 'reserved';

alter table public.usage_ledger enable row level security;
revoke all on table public.usage_ledger from anon;
revoke insert, update, delete on table public.usage_ledger from authenticated;
drop policy if exists usage_ledger_select_own on public.usage_ledger;
create policy usage_ledger_select_own on public.usage_ledger
  for select to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.platform_budget (
  day        date primary key,
  tokens     bigint not null default 0 check (tokens >= 0),
  cap        bigint not null check (cap > 0),
  paused     boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.platform_budget enable row level security;
revoke all on table public.platform_budget from anon, authenticated;

-- ---------------------------------------------------------------------------
-- reserve_credits: check the global pause, then the user's daily limit, then
-- insert a 'reserved' row. A per-user, per-day advisory lock makes parallel
-- requests queue, so two requests can never both pass the limit check.
-- Errors: 'AI_PAUSED', 'NO_CREDITS'.
-- ---------------------------------------------------------------------------
create or replace function public.reserve_credits(
  p_user_id     uuid,
  p_task        text,
  p_credits     integer,
  p_daily_limit integer,
  p_default_cap bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day    date := public.ist_today();
  v_budget public.platform_budget%rowtype;
  v_used   integer;
  v_id     uuid;
begin
  if p_credits < 1 or p_daily_limit < 1 or p_default_cap < 1 then
    raise exception 'INVALID_ARGUMENT';
  end if;

  insert into public.platform_budget (day, cap)
  values (v_day, p_default_cap)
  on conflict (day) do nothing;

  select * into v_budget from public.platform_budget where day = v_day;
  if v_budget.paused or v_budget.tokens >= v_budget.cap then
    raise exception 'AI_PAUSED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || v_day::text, 0));

  select coalesce(sum(credits), 0) into v_used
  from public.usage_ledger
  where user_id = p_user_id and day = v_day and status <> 'refunded';

  if v_used + p_credits > p_daily_limit then
    raise exception 'NO_CREDITS';
  end if;

  insert into public.usage_ledger (user_id, day, task, credits)
  values (p_user_id, v_day, p_task, p_credits)
  returning id into v_id;

  return v_id;
end;
$$;

-- Adds spent tokens to the day's platform budget and pauses AI at the cap.
create or replace function public.add_platform_tokens(p_day date, p_tokens bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.platform_budget
  set tokens = tokens + greatest(p_tokens, 0),
      paused = paused or (tokens + greatest(p_tokens, 0)) >= cap,
      updated_at = now()
  where day = p_day;
$$;

-- commit_usage: the call succeeded; keep the credits and record what ran.
create or replace function public.commit_usage(
  p_id             uuid,
  p_provider       text,
  p_model          text,
  p_prompt_version text,
  p_tokens_in      integer,
  p_tokens_out     integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date;
begin
  update public.usage_ledger
  set status = 'committed',
      provider = p_provider,
      model = p_model,
      prompt_version = p_prompt_version,
      tokens_in = greatest(p_tokens_in, 0),
      tokens_out = greatest(p_tokens_out, 0),
      settled_at = now()
  where id = p_id and status = 'reserved'
  returning day into v_day;

  if v_day is null then
    raise exception 'RESERVATION_NOT_FOUND';
  end if;

  perform public.add_platform_tokens(v_day, greatest(p_tokens_in, 0)::bigint + greatest(p_tokens_out, 0));
end;
$$;

-- refund_usage: the call failed; give the credits back, but still count any
-- tokens the provider used against the platform cap.
create or replace function public.refund_usage(
  p_id         uuid,
  p_error_code text,
  p_tokens_in  integer,
  p_tokens_out integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date;
begin
  update public.usage_ledger
  set status = 'refunded',
      error_code = left(p_error_code, 64),
      tokens_in = greatest(p_tokens_in, 0),
      tokens_out = greatest(p_tokens_out, 0),
      settled_at = now()
  where id = p_id and status = 'reserved'
  returning day into v_day;

  if v_day is not null then
    perform public.add_platform_tokens(v_day, greatest(p_tokens_in, 0)::bigint + greatest(p_tokens_out, 0));
  end if;
end;
$$;

-- Refunds reservations left behind by a crashed request (run from pg_cron).
create or replace function public.expire_stale_reservations(p_older_than interval default interval '15 minutes')
returns integer
language sql
security definer
set search_path = ''
as $$
  with expired as (
    update public.usage_ledger
    set status = 'refunded', error_code = 'STALE_RESERVATION', settled_at = now()
    where status = 'reserved' and created_at < now() - p_older_than
    returning 1
  )
  select count(*)::integer from expired;
$$;

revoke execute on function public.reserve_credits(uuid, text, integer, integer, bigint) from public, anon, authenticated;
revoke execute on function public.add_platform_tokens(date, bigint) from public, anon, authenticated;
revoke execute on function public.commit_usage(uuid, text, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.refund_usage(uuid, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.expire_stale_reservations(interval) from public, anon, authenticated;

grant execute on function public.reserve_credits(uuid, text, integer, integer, bigint) to service_role;
grant execute on function public.commit_usage(uuid, text, text, text, integer, integer) to service_role;
grant execute on function public.refund_usage(uuid, text, integer, integer) to service_role;
grant execute on function public.expire_stale_reservations(interval) to service_role;
