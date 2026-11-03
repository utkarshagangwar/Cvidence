-- Cvidence · Phase 0 (profile editor, import) and Phase 1 (applications)

-- ---------------------------------------------------------------------------
-- Profile extras
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists languages jsonb not null default '[]'::jsonb
  check (jsonb_typeof(languages) = 'array');

-- Resume import is an AI task too.
alter table public.usage_ledger drop constraint if exists usage_ledger_task_check;
alter table public.usage_ledger add constraint usage_ledger_task_check check (task in (
  'extract', 'match', 'tailor_resume', 'cover_letter', 'outreach_email',
  'refine', 'screen_batch', 'import_resume'));

-- ---------------------------------------------------------------------------
-- save_profile: replace the signed-in user's whole profile in one transaction.
-- SECURITY INVOKER, so every statement runs under the caller's RLS policies.
-- doc shape: see lib/profile/schema.ts (ProfileDoc).
-- ---------------------------------------------------------------------------
create or replace function public.save_profile(doc jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if pg_column_size(doc) > 600000 then
    raise exception 'PROFILE_TOO_LARGE';
  end if;

  update public.profiles set
    name      = coalesce(doc #>> '{basics,name}', ''),
    headline  = coalesce(doc #>> '{basics,headline}', ''),
    city      = coalesce(doc #>> '{basics,city}', ''),
    phone     = coalesce(doc #>> '{basics,phone}', ''),
    summary   = coalesce(doc #>> '{basics,summary}', ''),
    links     = coalesce(doc #> '{basics,links}', '[]'::jsonb),
    languages = coalesce(doc -> 'languages', '[]'::jsonb)
  where user_id = v_uid;

  -- Remove rows that are no longer in the document (links cascade).
  delete from public.experiences where user_id = v_uid
    and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(coalesce(doc -> 'experiences', '[]')) e);
  delete from public.projects where user_id = v_uid
    and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(coalesce(doc -> 'projects', '[]')) e);
  delete from public.education where user_id = v_uid
    and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(coalesce(doc -> 'education', '[]')) e);
  delete from public.certifications where user_id = v_uid
    and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(coalesce(doc -> 'certifications', '[]')) e);
  delete from public.skills where user_id = v_uid
    and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(coalesce(doc -> 'skills', '[]')) e);

  insert into public.skills (id, user_id, name, "group", sort)
  select (e ->> 'id')::uuid, v_uid, e ->> 'name', coalesce(e ->> 'group', ''), (o - 1)::int
  from jsonb_array_elements(coalesce(doc -> 'skills', '[]')) with ordinality as t(e, o)
  on conflict (id) do update set name = excluded.name, "group" = excluded."group", sort = excluded.sort;

  insert into public.experiences (id, user_id, company, title, location, start_date, end_date, bullets, sort)
  select (e ->> 'id')::uuid, v_uid, e ->> 'company', e ->> 'title', coalesce(e ->> 'location', ''),
         nullif(e ->> 'startDate', '')::date, nullif(e ->> 'endDate', '')::date,
         coalesce(e -> 'bullets', '[]'), (o - 1)::int
  from jsonb_array_elements(coalesce(doc -> 'experiences', '[]')) with ordinality as t(e, o)
  on conflict (id) do update set company = excluded.company, title = excluded.title, location = excluded.location,
    start_date = excluded.start_date, end_date = excluded.end_date, bullets = excluded.bullets, sort = excluded.sort;

  insert into public.projects (id, user_id, name, url, description, bullets, start_date, end_date, sort)
  select (e ->> 'id')::uuid, v_uid, e ->> 'name', coalesce(e ->> 'url', ''), coalesce(e ->> 'description', ''),
         coalesce(e -> 'bullets', '[]'), nullif(e ->> 'startDate', '')::date, nullif(e ->> 'endDate', '')::date, (o - 1)::int
  from jsonb_array_elements(coalesce(doc -> 'projects', '[]')) with ordinality as t(e, o)
  on conflict (id) do update set name = excluded.name, url = excluded.url, description = excluded.description,
    bullets = excluded.bullets, start_date = excluded.start_date, end_date = excluded.end_date, sort = excluded.sort;

  insert into public.education (id, user_id, institution, degree, field, grade, start_date, end_date, sort)
  select (e ->> 'id')::uuid, v_uid, e ->> 'institution', coalesce(e ->> 'degree', ''), coalesce(e ->> 'field', ''),
         coalesce(e ->> 'grade', ''), nullif(e ->> 'startDate', '')::date, nullif(e ->> 'endDate', '')::date, (o - 1)::int
  from jsonb_array_elements(coalesce(doc -> 'education', '[]')) with ordinality as t(e, o)
  on conflict (id) do update set institution = excluded.institution, degree = excluded.degree, field = excluded.field,
    grade = excluded.grade, start_date = excluded.start_date, end_date = excluded.end_date, sort = excluded.sort;

  insert into public.certifications (id, user_id, name, issuer, issued_on, url, sort)
  select (e ->> 'id')::uuid, v_uid, e ->> 'name', coalesce(e ->> 'issuer', ''),
         nullif(e ->> 'issuedOn', '')::date, coalesce(e ->> 'url', ''), (o - 1)::int
  from jsonb_array_elements(coalesce(doc -> 'certifications', '[]')) with ordinality as t(e, o)
  on conflict (id) do update set name = excluded.name, issuer = excluded.issuer, issued_on = excluded.issued_on,
    url = excluded.url, sort = excluded.sort;

  -- Skill links: rebuild from the document.
  delete from public.experience_skills where user_id = v_uid;
  insert into public.experience_skills (experience_id, skill_id, user_id)
  select distinct (e ->> 'id')::uuid, s::uuid, v_uid
  from jsonb_array_elements(coalesce(doc -> 'experiences', '[]')) e,
       jsonb_array_elements_text(coalesce(e -> 'skillIds', '[]')) s;

  delete from public.project_skills where user_id = v_uid;
  insert into public.project_skills (project_id, skill_id, user_id)
  select distinct (e ->> 'id')::uuid, s::uuid, v_uid
  from jsonb_array_elements(coalesce(doc -> 'projects', '[]')) e,
       jsonb_array_elements_text(coalesce(e -> 'skillIds', '[]')) s;
end;
$$;

revoke execute on function public.save_profile(jsonb) from public, anon;
grant execute on function public.save_profile(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Applications, documents and their versions
-- ---------------------------------------------------------------------------
create table if not exists public.applications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status          text not null default 'draft'
                    check (status in ('draft', 'applied', 'interview', 'offer', 'closed')),
  title           text not null default '' check (char_length(title) <= 300),
  company         text not null default '' check (char_length(company) <= 300),
  location        text not null default '' check (char_length(location) <= 300),
  jd_text         text not null check (char_length(jd_text) between 50 and 50000),
  extracted       jsonb,
  match           jsonb,
  prompt_versions jsonb not null default '{}'::jsonb,
  posting_id      uuid,
  agent_score     integer check (agent_score between 0 and 100),
  awaiting_review boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists applications_user_idx on public.applications (user_id, updated_at desc);

create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('resume', 'cover', 'email')),
  units           jsonb not null,
  flags           jsonb not null default '[]'::jsonb,
  written_with    jsonb not null default '{}'::jsonb,
  current_version integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (application_id, kind),
  unique (id, user_id),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade
);

-- Append-only history: rows are never updated; undo writes a new 'restored' row.
create table if not exists public.document_versions (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  version     integer not null check (version >= 1),
  cause       text not null check (cause in ('generated', 'edited', 'regenerated', 'refined', 'restored')),
  units       jsonb not null,
  flags       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  unique (document_id, version),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade
);
create index if not exists document_versions_doc_idx on public.document_versions (document_id, version desc);

create table if not exists public.status_events (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_status    text,
  to_status      text not null,
  created_at     timestamptz not null default now(),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade
);

drop trigger if exists applications_updated_at on public.applications;
create trigger applications_updated_at before update on public.applications
  for each row execute function public.set_updated_at();
drop trigger if exists documents_updated_at on public.documents;
create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['applications', 'documents', 'document_versions', 'status_events']
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

-- History and status events are append-only for users.
revoke update, delete on table public.document_versions from authenticated;
revoke update, delete on table public.status_events from authenticated;
