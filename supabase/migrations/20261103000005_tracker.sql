-- Phase 3: tracker, notes and refine chat.
--
-- notes          private notes on an application (only the owner can read them)
-- chat_messages  the refine chat for each document; append-only
-- set_application_status()  changes status and records the change in
--                status_events in one transaction, so the dashboard funnel and
--                weekly chart can never drift from the board.

create table if not exists public.notes (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body           text not null check (char_length(body) between 1 and 5000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade
);
create index if not exists notes_app_idx on public.notes (application_id, created_at desc);
drop trigger if exists notes_updated_at on public.notes;
create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

create table if not exists public.chat_messages (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('resume', 'cover', 'email')),
  role           text not null check (role in ('user', 'assistant')),
  body           text not null check (char_length(body) between 1 and 2000),
  -- The document version this message produced (assistant) or was sent against (user).
  version        integer,
  created_at     timestamptz not null default now(),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade
);
create index if not exists chat_messages_app_idx on public.chat_messages (application_id, kind, created_at);

do $$
declare
  t text;
begin
  foreach t in array array['notes', 'chat_messages']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t || '_owner', t
    );
  end loop;
end;
$$;
revoke update, delete on table public.chat_messages from authenticated;

create index if not exists status_events_user_idx on public.status_events (user_id, created_at desc);

-- Runs as the caller, so RLS still decides which application they can touch.
create or replace function public.set_application_status(p_application_id uuid, p_status text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_from text;
begin
  if p_status not in ('draft', 'applied', 'interview', 'offer', 'closed') then
    raise exception 'BAD_STATUS' using errcode = '22023';
  end if;
  select status into v_from from public.applications where id = p_application_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_from = p_status then
    return p_status;
  end if;
  update public.applications set status = p_status where id = p_application_id;
  insert into public.status_events (application_id, user_id, from_status, to_status)
  values (p_application_id, (select auth.uid()), v_from, p_status);
  return p_status;
end;
$$;
revoke all on function public.set_application_status(uuid, text) from public, anon;
grant execute on function public.set_application_status(uuid, text) to authenticated;
