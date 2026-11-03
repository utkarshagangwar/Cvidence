-- Cvidence · master profile tables
-- Every row belongs to one user; RLS limits each user to their own rows.
-- Link tables carry user_id and use composite foreign keys, so a user can
-- never link their skill to someone else's experience (or the reverse).

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (one per user, created on signup)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null default '' check (char_length(name) <= 200),
  headline   text not null default '' check (char_length(headline) <= 300),
  city       text not null default '' check (char_length(city) <= 200),
  email      text not null default '' check (char_length(email) <= 320),
  phone      text not null default '' check (char_length(phone) <= 50),
  summary    text not null default '' check (char_length(summary) <= 5000),
  links      jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create the empty profile row when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- experiences, projects, education, certifications
-- bullets: [{ "id": "<stable id>", "text": "..." }]
-- ---------------------------------------------------------------------------
create table if not exists public.experiences (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company    text not null check (char_length(company) between 1 and 200),
  title      text not null check (char_length(title) between 1 and 200),
  location   text not null default '' check (char_length(location) <= 200),
  start_date date,
  end_date   date,
  bullets    jsonb not null default '[]'::jsonb check (jsonb_typeof(bullets) = 'array'),
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  url         text not null default '' check (char_length(url) <= 500),
  description text not null default '' check (char_length(description) <= 2000),
  bullets     jsonb not null default '[]'::jsonb check (jsonb_typeof(bullets) = 'array'),
  start_date  date,
  end_date    date,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists public.education (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  institution text not null check (char_length(institution) between 1 and 200),
  degree      text not null default '' check (char_length(degree) <= 200),
  field       text not null default '' check (char_length(field) <= 200),
  grade       text not null default '' check (char_length(grade) <= 50),
  start_date  date,
  end_date    date,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.certifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  issuer     text not null default '' check (char_length(issuer) <= 200),
  issued_on  date,
  url        text not null default '' check (char_length(url) <= 500),
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.skills (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 100),
  "group"    text not null default '' check (char_length("group") <= 100),
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index if not exists skills_user_name_unique on public.skills (user_id, lower(name));

create table if not exists public.experience_skills (
  experience_id uuid not null,
  skill_id      uuid not null,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (experience_id, skill_id),
  foreign key (experience_id, user_id) references public.experiences (id, user_id) on delete cascade,
  foreign key (skill_id, user_id) references public.skills (id, user_id) on delete cascade
);

create table if not exists public.project_skills (
  project_id uuid not null,
  skill_id   uuid not null,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (project_id, skill_id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade,
  foreign key (skill_id, user_id) references public.skills (id, user_id) on delete cascade
);

create index if not exists experiences_user_idx on public.experiences (user_id, sort);
create index if not exists projects_user_idx on public.projects (user_id, sort);
create index if not exists education_user_idx on public.education (user_id, sort);
create index if not exists certifications_user_idx on public.certifications (user_id, sort);
create index if not exists experience_skills_user_idx on public.experience_skills (user_id);
create index if not exists experience_skills_skill_idx on public.experience_skills (skill_id);
create index if not exists project_skills_user_idx on public.project_skills (user_id);
create index if not exists project_skills_skill_idx on public.project_skills (skill_id);

drop trigger if exists experiences_updated_at on public.experiences;
create trigger experiences_updated_at before update on public.experiences
  for each row execute function public.set_updated_at();
drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
drop trigger if exists education_updated_at on public.education;
create trigger education_updated_at before update on public.education
  for each row execute function public.set_updated_at();
drop trigger if exists certifications_updated_at on public.certifications;
create trigger certifications_updated_at before update on public.certifications
  for each row execute function public.set_updated_at();
drop trigger if exists skills_updated_at on public.skills;
create trigger skills_updated_at before update on public.skills
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security: owner only, every table, every command
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'experiences', 'projects', 'education', 'certifications',
    'skills', 'experience_skills', 'project_skills'
  ]
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

-- The profile row is created by the signup trigger and removed with the account.
revoke insert, delete on table public.profiles from authenticated;
