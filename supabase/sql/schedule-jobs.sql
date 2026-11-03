-- Run ONCE in the Supabase SQL editor after the app is deployed (not a migration:
-- it needs your deployed URL and the worker secret).
--
-- Before running:
--   1. Database -> Extensions: enable pg_cron and pg_net.
--   2. The deployed address below is https://cvidence.vercel.app.
--   3. Store the worker secret in Vault (same value as WORKER_SECRET in Vercel):
--        select vault.create_secret('<paste the secret>', 'worker_secret');
--      Never paste the secret anywhere else in this file.

-- Every 6 hours: queue every enabled board, then drain the queue.
select cron.schedule('ingest-enqueue', '5 */6 * * *', $$
  select net.http_post(
    url := 'https://cvidence.vercel.app/api/worker/ingest?enqueue=1',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret'),
      'Content-Type', 'application/json'),
    timeout_milliseconds := 300000)
$$);

-- Every 15 minutes: finish whatever the last run couldn't fit, and retries.
select cron.schedule('ingest-drain', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://cvidence.vercel.app/api/worker/ingest',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret'),
      'Content-Type', 'application/json'),
    timeout_milliseconds := 300000)
  where exists (select 1 from public.job_queue where state = 'queued' and run_after <= now())
$$);

-- 06:30 IST (01:00 UTC) daily: the daily agent, after the 05:35 IST board fetch.
select cron.schedule('agent-daily', '0 1 * * *', $$
  select net.http_post(
    url := 'https://cvidence.vercel.app/api/worker/ingest?agent=1',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret'),
      'Content-Type', 'application/json'),
    timeout_milliseconds := 300000)
$$);

-- 08:00 IST (02:30 UTC) daily: yesterday's usage report to OPERATOR_EMAIL.
select cron.schedule('usage-report', '30 2 * * *', $$
  select net.http_post(
    url := 'https://cvidence.vercel.app/api/worker/ingest?report=1',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret'),
      'Content-Type', 'application/json'),
    timeout_milliseconds := 60000)
$$);

-- Every 30 minutes: drop old rate-limit counters.
select cron.schedule('prune-rate-hits', '*/30 * * * *', $$ select public.prune_rate_hits() $$);

-- Mondays 03:30 IST (22:00 UTC Sunday): flag boards with no jobs three runs in a row.
select cron.schedule('board-health', '0 22 * * 0', $$ select public.flag_dead_sources() $$);

-- Hourly: refund AI credit reservations left behind by a crashed request.
select cron.schedule('expire-reservations', '20 * * * *', $$ select public.expire_stale_reservations() $$);

-- Daily: keep the queue table small.
select cron.schedule('queue-cleanup', '40 21 * * *', $$
  delete from public.job_queue where state in ('done', 'failed') and created_at < now() - interval '14 days'
$$);

-- To check:   select jobname, schedule, active from cron.job;
-- To undo:    select cron.unschedule('ingest-enqueue');  (and so on)
