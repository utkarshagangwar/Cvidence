import "server-only";
// The ingest worker: claims queued jobs, fetches each source, upserts postings,
// closes postings that disappeared, and records board health. Runs with the
// service role because postings and the queue are system tables.

import type { SupabaseClient } from "@supabase/supabase-js";
import { runAgent, runAgentDigest, runAgentDraft, type JobOutcome } from "@/lib/agent/run";
import { fetchSource, SourceError } from "./fetch";
import { getAdapter, missingEnv } from "./registry";
import type { SourceConfig } from "./types";

const UPSERT_CHUNK = 200;
const MAX_ATTEMPTS = 3;

interface QueueRow {
  id: number;
  kind: "ingest_source" | "agent_run" | "agent_draft" | "agent_digest";
  source_id: string | null;
  user_id: string | null;
  payload: { run_id?: string; posting_id?: string } | null;
  attempts: number;
}

export interface SourceOutcome {
  sourceId: string;
  ok: boolean;
  count: number;
  error?: string;
}

function envSnapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (typeof v === "string") out[k] = v;
  return out;
}

export async function ingestSource(admin: SupabaseClient, sourceId: string, fetchImpl: typeof fetch = fetch): Promise<SourceOutcome> {
  const { data: row, error } = await admin.from("job_sources").select("*").eq("id", sourceId).maybeSingle();
  if (error || !row) return { sourceId, ok: false, count: 0, error: "Source not found" };
  if (!row.enabled) return { sourceId, ok: true, count: 0, error: "Source disabled" };

  const source: SourceConfig = { id: row.id, adapter: row.adapter, slug: row.slug, company: row.company, config: row.config ?? {} };
  const startedAt = new Date().toISOString();
  const adapter = getAdapter(source.adapter);
  const env = envSnapshot();

  if (!adapter) return recordFailure(admin, row, startedAt, `No adapter called "${source.adapter}"`, false);
  const missing = missingEnv(adapter, env);
  // Names only, never values.
  if (missing.length) return recordFailure(admin, row, startedAt, `Missing env: ${missing.join(", ")}`, false);

  try {
    const { postings, complete } = await fetchSource(adapter, source, env, fetchImpl);
    for (let i = 0; i < postings.length; i += UPSERT_CHUNK) {
      const chunk = postings.slice(i, i + UPSERT_CHUNK).map((p) => ({
        source_id: source.id,
        adapter: source.adapter,
        external_id: p.externalId,
        title: p.title,
        company: p.company,
        location: p.location,
        remote: p.remote,
        employment_type: p.employmentType,
        salary: p.salary,
        url: p.url,
        description: p.description,
        posted_at: p.postedAt,
        last_seen_at: startedAt,
        closed_at: null,
      }));
      const { error: upErr } = await admin.from("postings").upsert(chunk, { onConflict: "source_id,external_id" });
      if (upErr) throw new Error("Could not save postings");
    }
    // Only a full fetch can prove a job is gone.
    if (complete) {
      await admin.from("postings").update({ closed_at: startedAt }).eq("source_id", source.id).is("closed_at", null).lt("last_seen_at", startedAt);
    }
    await admin
      .from("job_sources")
      .update({
        last_run_at: startedAt,
        last_ok_at: startedAt,
        last_count: postings.length,
        zero_streak: postings.length === 0 ? row.zero_streak + 1 : 0,
        last_error: null,
        ...(postings.length > 0 ? { flagged_at: null } : {}),
      })
      .eq("id", source.id);
    return { sourceId, ok: true, count: postings.length };
  } catch (err) {
    if (err instanceof SourceError) {
      // A missing board counts towards the health check like an empty one.
      const outcome = await recordFailure(admin, row, startedAt, `${err.code}: ${err.message}`, err.code === "NOT_FOUND");
      if (err.retryable) throw err;
      return outcome;
    }
    return recordFailure(admin, row, startedAt, "Unexpected error while saving", false);
  }
}

async function recordFailure(
  admin: SupabaseClient,
  row: { id: string; zero_streak: number },
  at: string,
  message: string,
  countsAsZero: boolean,
): Promise<SourceOutcome> {
  await admin
    .from("job_sources")
    .update({ last_run_at: at, last_error: message.slice(0, 300), ...(countsAsZero ? { zero_streak: row.zero_streak + 1 } : {}) })
    .eq("id", row.id);
  return { sourceId: row.id, ok: false, count: 0, error: message };
}

export interface WorkerResult {
  processed: number;
  ok: number;
  failed: number;
  retried: number;
  postings: number;
  timedOut: boolean;
}

async function runAgentJob(admin: SupabaseClient, job: QueueRow, result: WorkerResult) {
  const agentJob = { id: job.id, user_id: job.user_id ?? "", attempts: job.attempts, payload: job.payload ?? {} };
  let out: JobOutcome;
  try {
    if (!job.user_id) out = { kind: "failed", note: "No user" };
    else if (job.kind === "agent_run") out = await runAgent(admin, agentJob);
    else if (job.kind === "agent_draft") out = await runAgentDraft(admin, agentJob);
    else if (job.kind === "agent_digest") out = await runAgentDigest(admin, agentJob);
    else out = { kind: "failed", note: `Unknown job kind` };
  } catch {
    out = job.attempts < MAX_ATTEMPTS ? { kind: "defer", minutes: 15 * job.attempts, note: "Unexpected error" } : { kind: "failed", note: "Unexpected error" };
  }
  if (out.kind === "done") result.ok++;
  else if (out.kind === "defer") result.retried++;
  else result.failed++;
  await admin
    .from("job_queue")
    .update(
      out.kind === "defer"
        ? { state: "queued", locked_at: null, error: out.note, run_after: new Date(Date.now() + out.minutes * 60_000).toISOString() }
        : { state: out.kind === "done" ? "done" : "failed", error: out.note?.slice(0, 300) ?? null, finished_at: new Date().toISOString() },
    )
    .eq("id", job.id);
}

/** Drains the queue until it's empty or the deadline is near. */
export async function runWorker(admin: SupabaseClient, opts: { deadlineMs: number; fetchImpl?: typeof fetch }): Promise<WorkerResult> {
  const stopAt = Date.now() + opts.deadlineMs;
  const result: WorkerResult = { processed: 0, ok: 0, failed: 0, retried: 0, postings: 0, timedOut: false };

  while (Date.now() < stopAt) {
    const { data: jobs, error } = await admin.rpc("claim_jobs", { n: 3 });
    if (error) throw new Error("Could not claim queue jobs");
    const list = (jobs ?? []) as QueueRow[];
    if (list.length === 0) return result;

    for (const job of list) {
      // Give back anything we can't start before the deadline.
      if (Date.now() >= stopAt) {
        await admin.from("job_queue").update({ state: "queued", locked_at: null, attempts: job.attempts - 1 }).eq("id", job.id);
        continue;
      }
      result.processed++;
      if (job.kind !== "ingest_source") {
        await runAgentJob(admin, job, result);
        continue;
      }
      try {
        const out = job.source_id ? await ingestSource(admin, job.source_id, opts.fetchImpl) : { sourceId: "", ok: false, count: 0, error: "No source" };
        result.postings += out.count;
        if (out.ok) result.ok++;
        else result.failed++;
        await admin
          .from("job_queue")
          .update({ state: out.ok ? "done" : "failed", error: out.error?.slice(0, 300) ?? null, finished_at: new Date().toISOString() })
          .eq("id", job.id);
      } catch (err) {
        const message = err instanceof SourceError ? `${err.code}: ${err.message}` : "Unexpected error";
        const retry = err instanceof SourceError && err.retryable && job.attempts < MAX_ATTEMPTS;
        if (retry) result.retried++;
        else result.failed++;
        await admin
          .from("job_queue")
          .update(
            retry
              ? { state: "queued", locked_at: null, error: message, run_after: new Date(Date.now() + 15 * 60_000 * job.attempts).toISOString() }
              : { state: "failed", error: message, finished_at: new Date().toISOString() },
          )
          .eq("id", job.id);
      }
    }
  }
  result.timedOut = true;
  return result;
}
