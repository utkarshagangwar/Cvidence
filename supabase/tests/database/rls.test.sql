-- RLS tests: user B can never read or change user A's rows.
-- Run with: supabase test db   (needs the Supabase CLI and a local stack)
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Two users. The signup trigger creates their profile rows.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');

select is(
  (select count(*)::int from public.profiles where user_id in (
    '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')),
  2, 'signup trigger creates one profile per user');

-- Seed rows for A as the service owner.
insert into public.experiences (id, user_id, company, title) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Northwind', 'QA Engineer');
insert into public.skills (id, user_id, name) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Selenium');
insert into public.usage_ledger (user_id, day, task, credits) values
  ('00000000-0000-0000-0000-00000000000a', public.ist_today(), 'extract', 1);

-- Act as user B.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select is((select count(*)::int from public.experiences), 0, 'B cannot see A''s experiences');
select is((select count(*)::int from public.skills), 0, 'B cannot see A''s skills');
select is((select count(*)::int from public.profiles), 1, 'B sees only their own profile');
select is((select count(*)::int from public.usage_ledger), 0, 'B cannot see A''s ledger rows');

update public.experiences set title = 'hacked' where id = '10000000-0000-0000-0000-00000000000a';
delete from public.skills where id = '20000000-0000-0000-0000-00000000000a';

select throws_ok(
  $$ insert into public.experiences (user_id, company, title)
     values ('00000000-0000-0000-0000-00000000000a', 'X', 'Y') $$,
  '42501', null, 'B cannot insert a row owned by A');

-- B creates own skill, then tries to link it to A's experience.
insert into public.skills (id, name) values ('20000000-0000-0000-0000-00000000000b', 'Python');
select throws_ok(
  $$ insert into public.experience_skills (experience_id, skill_id)
     values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000b') $$,
  null, null, 'B cannot link a skill to A''s experience');

select throws_ok(
  $$ insert into public.usage_ledger (user_id, day, task, credits)
     values ('00000000-0000-0000-0000-00000000000b', public.ist_today(), 'extract', 1) $$,
  '42501', null, 'users cannot write ledger rows');

select throws_ok(
  $$ select public.reserve_credits('00000000-0000-0000-0000-00000000000b', 'extract', 1, 25, 1000000) $$,
  '42501', null, 'users cannot call reserve_credits');

select throws_ok(
  $$ select * from public.platform_budget $$,
  '42501', null, 'users cannot read platform_budget');

-- Back to the owner to check A's rows survived.
reset role;
select is(
  (select title from public.experiences where id = '10000000-0000-0000-0000-00000000000a'),
  'QA Engineer', 'A''s experience was not changed by B');
select is(
  (select count(*)::int from public.skills where id = '20000000-0000-0000-0000-00000000000a'),
  1, 'A''s skill was not deleted by B');

-- Ledger: the limit holds and refunds give credits back.
select lives_ok(
  $$ select public.reserve_credits('00000000-0000-0000-0000-00000000000b', 'tailor_resume', 3, 3, 1000000) $$,
  'reserve within the limit works');
select throws_ok(
  $$ select public.reserve_credits('00000000-0000-0000-0000-00000000000b', 'extract', 1, 3, 1000000) $$,
  'P0001', 'NO_CREDITS', 'reserve past the limit is refused');

-- Phase 1 tables: B can't read or write A's applications or history.
insert into public.applications (id, user_id, jd_text) values
  ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', repeat('Selenium QA role. ', 5));
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from public.applications), 0, 'B cannot see A''s applications');
select throws_ok(
  $$ insert into public.documents (application_id, kind, units)
     values ('30000000-0000-0000-0000-00000000000a', 'resume', '{}') $$,
  null, null, 'B cannot attach a document to A''s application');
select lives_ok($$ select public.save_profile('{"basics":{"name":"B"},"skills":[],"experiences":[]}'::jsonb) $$, 'B can save their own profile');
select is((select name from public.profiles), 'B', 'save_profile only touched B''s row');
reset role;

-- Phase 2: postings are shared and read-only; per-user rows stay private.
insert into public.job_sources (id, adapter, slug, company) values
  ('40000000-0000-0000-0000-000000000001', 'greenhouse', 'rls-test', 'RLS Test');
insert into public.postings (id, source_id, adapter, external_id, title, company, url) values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'greenhouse', 'x1', 'QA Engineer', 'RLS Test', 'https://example.test/x1');
insert into public.user_postings (user_id, posting_id, saved_at) values
  ('00000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from public.postings where id = '50000000-0000-0000-0000-000000000001'), 1, 'signed-in users can read postings');
select is((select count(*)::int from public.user_postings), 0, 'B cannot see A''s saved jobs');
select throws_ok(
  $$ insert into public.postings (source_id, adapter, external_id, title, company, url)
     values ('40000000-0000-0000-0000-000000000001', 'greenhouse', 'x2', 'Fake', 'X', 'https://example.test/x2') $$,
  '42501', null, 'users cannot write postings');
select throws_ok($$ select * from public.job_queue $$, '42501', null, 'users cannot read the job queue');
select throws_ok($$ select public.claim_jobs(1) $$, '42501', null, 'users cannot claim queue jobs');
select lives_ok(
  $$ insert into public.user_postings (posting_id, saved_at) values ('50000000-0000-0000-0000-000000000001', now()) $$,
  'B can save a job for themselves');
reset role;

-- Phase 3: notes, chat and status history stay private; status changes are recorded.
insert into public.notes (application_id, user_id, body) values
  ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'A private note');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from public.notes), 0, 'B cannot read A''s notes');
select throws_ok(
  $$ insert into public.notes (application_id, body) values ('30000000-0000-0000-0000-00000000000a', 'x') $$,
  null, null, 'B cannot add a note to A''s application');
select throws_ok(
  $$ select public.set_application_status('30000000-0000-0000-0000-00000000000a', 'applied') $$,
  'P0002', null, 'B cannot change the status of A''s application');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is(public.set_application_status('30000000-0000-0000-0000-00000000000a', 'applied'), 'applied', 'A can change their own status');
select is((select count(*)::int from public.status_events where to_status = 'applied'), 1, 'the change is recorded once in status_events');
reset role;

select * from finish();
rollback;
