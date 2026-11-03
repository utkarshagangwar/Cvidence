# Cvidence

Job search plus JD-tailored resumes, cover letters and outreach emails that use only facts from your own profile. Every line, backed.

This repo is mid-rebuild. The new app (Next.js + Supabase) lives at the root. The old single-page builder and its Express proxy are in [`legacy/`](legacy/) until the resume editor and exports are ported, then they get removed.

## Stack

| Layer | Choice |
| --- | --- |
| App + API | Next.js 16 (App Router, TypeScript) on Vercel |
| Styling | Tailwind CSS 4 with Cvidence "Casefile" tokens ([app/globals.css](app/globals.css)) |
| Data, auth, files | Supabase: Postgres with Row-Level Security, Auth (Google + email magic link) |
| AI | `LlmProvider` interface: Gemini first, OpenRouter fallback ([lib/ai/](lib/ai/)) |
| Validation | zod on every request body and every AI reply |
| Tests | Vitest (unit), pgTAP (RLS) |

## Layout

```
app/              routes: login, auth callback/signout, (app)/dashboard, jobs, applications, profile, settings
components/       brand (Footnote C logo), shell (sidebar, credits widget, empty states)
lib/ai/           provider adapters, run-task (reserve → call → validate → commit/refund), JSON repair, untrusted-data wrapper
lib/quota/        credit prices, IST day maths, Supabase ledger
lib/supabase/     server (RLS, as the user), browser, admin (service role, ledger only)
supabase/         migrations and RLS tests
tests/unit/       Vitest
legacy/           old index.html + Express API (retiring)
```

## Local setup

1. `npm install`
2. Create a Supabase project, then apply the migrations in `supabase/migrations/` (Supabase CLI: `supabase link` then `supabase db push`, or paste them into the SQL editor in order).
3. In Supabase → Authentication: turn on Email (magic link) and Google, and add `http://localhost:3000/auth/callback` to the redirect URLs.
4. `cp .env.example .env.local` and fill in the values (names only are listed there; never commit real values).
5. `npm run dev` → http://localhost:3000

## Checks

```
npm run typecheck
npm test
npm run build
supabase test db      # RLS tests, needs the Supabase CLI and a local stack
```

## Rules the code enforces

- AI credits are reserved in Postgres before a model call and refunded on any failure; users can read but never write the ledger.
- Job-description text is wrapped as untrusted data; model output is parsed as JSON and validated, never executed or rendered as HTML.
- Model ids are pinned in env; every ledger row records provider, model and prompt version.
- The service-role key is used only for the ledger; user data is always read and written as the signed-in user, through RLS.

## License

MIT

## Job boards

Jobs come from public company career boards (Greenhouse, Lever, Ashby, Workable), fetched every 6 hours by `/api/worker/ingest` and shared by all users.

**Add a company** on a board type that already exists: insert a row into `job_sources` in the Supabase table editor (`adapter`, `slug`, `company`). No deploy needed. It's picked up on the next run.

**Add a new board type** (for example a paid job API):

1. Create `lib/jobs/adapters/<name>.ts` exporting a `SourceAdapter` (see `lib/jobs/types.ts`):
   - `request(source, page, env)` builds the HTTPS request. Read API keys only from `env`.
   - `parse(body, source)` turns the JSON into postings. Return `more: true` to fetch the next page, and set `maxPages`.
   - List the key names in `requiredEnv`. Sources are skipped, with "Needs an API key" on Board Status, until they're set.
2. Add it to `ADAPTERS` in `lib/jobs/registry.ts`.
3. Add the key names to `.env.example`, and the values to Vercel (never to `job_sources`).
4. Add a parser test with a sample response in `tests/unit/jobs.test.ts`.
5. Insert `job_sources` rows with `adapter = '<name>'`. Put any search settings (a query, a country) in `config`.

The worker, filters, scoring and Find jobs screen need no changes.

Check every board live (network only): `$env:LIVE="1"; npx vitest run --config vitest.eval.config.mts tests/live`

## Migrations

Run each file in `supabase/migrations` once, in order, in the Supabase SQL editor. Every file is safe to run again: tables, indexes and columns use `if not exists`, and triggers, policies and constraints are dropped first and recreated. A second run changes nothing. Keep new migrations the same way; guard SDET-003 blocks a commit that isn't.
