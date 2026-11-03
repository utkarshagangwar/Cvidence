import "server-only";
// The daily agent, run by the worker with the service role. RLS is OFF here, so
// EVERY query on a user table filters on user_id explicitly, and the shared
// services get `ownerId` so their profile reads do the same.
//
// agent_run    search with the saved filters, score up to 16 unseen jobs,
//              queue one agent_draft per top match, then queue the digest
// agent_draft  posting -> application (read + match) -> tailored resume,
//              marked awaiting_review. Nothing is ever sent or applied.
// agent_digest waits for the drafts, then emails the summary and closes the run

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { QuotaError } from "@/lib/ai/run-task";
import { tailorResume } from "@/lib/applications/service";
import { emailConfigured, sendEmail } from "@/lib/email/resend";
import { prefilter } from "@/lib/jobs/prefilter";
import { scorePostings, startApplicationFromPosting } from "@/lib/jobs/service";
import { buildDigest } from "./digest";
import { parseAgentSettings, SCORE_PER_RUN } from "./settings";

export type JobOutcome = { kind: "done"; note?: string } | { kind: "defer"; minutes: number; note: string } | { kind: "failed"; note: string };

interface AgentJob {
  id: number;
  user_id: string;
  attempts: number;
  payload: { run_id?: string; posting_id?: string };
}

const asUser = (id: string) => ({ id }) as User;
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

async function loadSettings(admin: SupabaseClient, userId: string) {
  const { data } = await admin.from("agent_settings").select("*").eq("user_id", userId).maybeSingle();
  return parseAgentSettings(data);
}

async function setRun(admin: SupabaseClient, userId: string, runId: string, patch: Record<string, unknown>) {
  await admin.from("agent_runs").update(patch).eq("id", runId).eq("user_id", userId);
}

export async function runAgent(admin: SupabaseClient, job: AgentJob): Promise<JobOutcome> {
  const userId = job.user_id;
  const runId = job.payload.run_id;
  if (!isUuid(runId)) return { kind: "failed", note: "Missing run id" };

  const settings = await loadSettings(admin, userId);
  if (!settings.enabled) {
    await setRun(admin, userId, runId, { state: "skipped", note: "Agent is off", finished_at: new Date().toISOString() });
    return { kind: "done", note: "skipped" };
  }
  await setRun(admin, userId, runId, { state: "running" });

  // Search: same free filter as Find Jobs.
  const f = { ...settings.filters, view: "all" as const };
  const since = new Date(Date.now() - f.days * 86_400_000).toISOString();
  let q = admin
    .from("postings")
    .select("id, title, company, location, remote, posted_at, first_seen_at, adapter")
    .is("closed_at", null)
    .or(`posted_at.gte.${since},and(posted_at.is.null,first_seen_at.gte.${since})`)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(3000);
  if (f.source) q = q.eq("adapter", f.source);
  const [{ data: rows }, { data: mine }, { data: apps }] = await Promise.all([
    q,
    admin.from("user_postings").select("posting_id, score, dismissed_at").eq("user_id", userId).limit(10000),
    admin.from("applications").select("posting_id").eq("user_id", userId).not("posting_id", "is", null).limit(5000),
  ]);
  // Skip anything already scored, dismissed or turned into an application.
  const seen = new Set<string>([
    ...((mine ?? []) as Array<{ posting_id: string; score: number | null; dismissed_at: string | null }>).filter((m) => m.score !== null || m.dismissed_at).map((m) => m.posting_id),
    ...((apps ?? []) as Array<{ posting_id: string }>).map((a) => a.posting_id),
  ]);
  type Row = { id: string; title: string; location: string; remote: boolean | null; posted_at: string | null; first_seen_at: string };
  const kept = prefilter((rows ?? []) as Row[], f);
  const fresh = kept.filter((p) => !seen.has(p.id));
  const candidates = fresh.slice(0, SCORE_PER_RUN).map((p) => p.id);

  let scored = 0;
  let note: string | null = null;
  try {
    if (candidates.length) scored = await scorePostings(admin, asUser(userId), candidates, userId);
  } catch (err) {
    note = err instanceof QuotaError ? "You ran out of AI credits before the agent could score everything." : "Scoring failed today; it will try again tomorrow.";
  }

  // Top matches above the threshold become drafts.
  let top: Array<{ posting_id: string; score: number }> = [];
  if (scored > 0) {
    const { data } = await admin
      .from("user_postings")
      .select("posting_id, score")
      .eq("user_id", userId)
      .in("posting_id", candidates)
      .gte("score", settings.threshold)
      .order("score", { ascending: false })
      .limit(settings.max_drafts);
    top = (data ?? []) as typeof top;
  }
  if (top.length) {
    await admin.from("job_queue").insert(top.map((t) => ({ kind: "agent_draft", user_id: userId, payload: { run_id: runId, posting_id: t.posting_id } })));
  }
  await admin.from("job_queue").insert({ kind: "agent_digest", user_id: userId, payload: { run_id: runId }, run_after: new Date(Date.now() + 2 * 60_000).toISOString() });
  await setRun(admin, userId, runId, { found: fresh.length, scored, note });
  return { kind: "done" };
}

export async function runAgentDraft(admin: SupabaseClient, job: AgentJob): Promise<JobOutcome> {
  const userId = job.user_id;
  const { run_id: runId, posting_id: postingId } = job.payload;
  if (!isUuid(runId) || !isUuid(postingId)) return { kind: "failed", note: "Bad payload" };

  const { data: up } = await admin.from("user_postings").select("score").eq("user_id", userId).eq("posting_id", postingId).maybeSingle();
  try {
    const appId = await startApplicationFromPosting(admin, asUser(userId), postingId, userId);
    await admin.from("applications").update({ awaiting_review: true, agent_score: up?.score ?? null }).eq("id", appId).eq("user_id", userId);
    await tailorResume(admin, asUser(userId), appId, userId);
    const { data: run } = await admin.from("agent_runs").select("drafted").eq("id", runId).eq("user_id", userId).maybeSingle();
    await setRun(admin, userId, runId, { drafted: (run?.drafted ?? 0) + 1 });
    return { kind: "done" };
  } catch (err) {
    if (err instanceof QuotaError) {
      await setRun(admin, userId, runId, { note: "You ran out of AI credits, so some drafts weren't written." });
      return { kind: "done", note: "out of credits" };
    }
    return { kind: "failed", note: err instanceof Error ? err.name : "error" };
  }
}

export async function runAgentDigest(admin: SupabaseClient, job: AgentJob): Promise<JobOutcome> {
  const userId = job.user_id;
  const runId = job.payload.run_id;
  if (!isUuid(runId)) return { kind: "failed", note: "Missing run id" };

  // Wait (up to about an hour) for this run's drafts to finish.
  const { count: open } = await admin
    .from("job_queue")
    .select("id", { count: "exact", head: true })
    .eq("kind", "agent_draft")
    .eq("user_id", userId)
    .eq("payload->>run_id", runId)
    .in("state", ["queued", "running"]);
  if ((open ?? 0) > 0 && job.attempts < 6) return { kind: "defer", minutes: 10, note: "drafts still running" };

  const { data: run } = await admin.from("agent_runs").select("*").eq("id", runId).eq("user_id", userId).maybeSingle();
  if (!run) return { kind: "failed", note: "Run not found" };
  const settings = await loadSettings(admin, userId);

  const [{ data: drafts }, { data: matches }, { data: profile }] = await Promise.all([
    admin.from("applications").select("id, title, company, agent_score").eq("user_id", userId).eq("awaiting_review", true).gte("created_at", run.created_at).order("agent_score", { ascending: false }).limit(5),
    admin
      .from("user_postings")
      .select("score, postings!inner(title, company)")
      .eq("user_id", userId)
      .gte("scored_at", run.created_at)
      .gte("score", Math.max(40, settings.threshold - 10))
      .order("score", { ascending: false })
      .limit(8),
    admin.from("profiles").select("name").eq("user_id", userId).maybeSingle(),
  ]);

  let emailedAt: string | null = null;
  let note = run.note as string | null;
  const draftList = (drafts ?? []) as Array<{ id: string; title: string; company: string; agent_score: number | null }>;
  if (settings.digest && emailConfigured() && (draftList.length > 0 || (matches ?? []).length > 0)) {
    const { data: userData } = await admin.auth.admin.getUserById(userId);
    const to = userData.user?.email;
    if (to) {
      const draftedTitles = new Set(draftList.map((d) => `${d.title}|${d.company}`));
      type M = { score: number; postings: { title: string; company: string } | Array<{ title: string; company: string }> };
      const others = ((matches ?? []) as unknown as M[])
        .map((m) => ({ score: m.score, ...(Array.isArray(m.postings) ? m.postings[0]! : m.postings) }))
        .filter((m) => !draftedTitles.has(`${m.title}|${m.company}`))
        .slice(0, 5);
      const mail = buildDigest({
        name: (profile?.name as string) ?? "",
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        drafts: draftList.map((d) => ({ applicationId: d.id, title: d.title || "Untitled role", company: d.company, score: d.agent_score })),
        matches: others,
        found: run.found as number,
        note,
      });
      try {
        await sendEmail({ to, ...mail });
        emailedAt = new Date().toISOString();
      } catch {
        note = [note, "The morning email couldn't be sent."].filter(Boolean).join(" ");
      }
    }
  }
  await setRun(admin, userId, runId, { state: "done", emailed_at: emailedAt, note, finished_at: new Date().toISOString() });
  return { kind: "done" };
}
