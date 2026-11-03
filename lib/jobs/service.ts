import "server-only";
// Find jobs: search, save, dismiss, score, start an application. Every query
// runs as the signed-in user, so RLS limits user_postings to their own rows.

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { runAiTask } from "@/lib/ai/runner";
import { SCREEN_BATCH_SIZE, SCREEN_JOBS, screenPrompt } from "@/lib/ai/tasks";
import { AppError, createApplication } from "@/lib/applications/service";
import { yearsOfExperience } from "@/lib/match/classify";
import { loadProfile } from "@/lib/profile/load";
import { prefilter, type SearchFilters } from "./prefilter";
import { applySeniorityRules } from "./score-rules";

const CANDIDATE_LIMIT = 3000; // newest open postings considered per search
const SHOW_LIMIT = 60;
export const MAX_SCORE_PER_CLICK = 24; // 3 batches, 3 credits

const LIST_COLUMNS = "id, title, company, location, remote, employment_type, salary, url, posted_at, first_seen_at, adapter, source_id";

export interface PostingListItem {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean | null;
  employment_type: string;
  salary: string;
  url: string;
  posted_at: string | null;
  first_seen_at: string;
  adapter: string;
  source_id: string;
  saved: boolean;
  score: number | null;
  reasons: string[];
  redFlags: string[];
}

interface UserPostingRow {
  posting_id: string;
  saved_at: string | null;
  dismissed_at: string | null;
  score: number | null;
  reasons: string[];
  red_flags: string[];
}

export interface SearchResult {
  items: PostingListItem[];
  funnel: { found: number; afterFilters: number; scored: number };
  /** Ids after filters that have no score yet, newest first (for "Score these"). */
  unscoredIds: string[];
  truncated: boolean;
}

async function userRows(supabase: SupabaseClient): Promise<Map<string, UserPostingRow>> {
  const { data } = await supabase.from("user_postings").select("posting_id, saved_at, dismissed_at, score, reasons, red_flags").limit(5000);
  return new Map(((data ?? []) as UserPostingRow[]).map((r) => [r.posting_id, r]));
}

function withUser(p: Omit<PostingListItem, "saved" | "score" | "reasons" | "redFlags">, u?: UserPostingRow): PostingListItem {
  return { ...p, saved: Boolean(u?.saved_at), score: u?.score ?? null, reasons: u?.reasons ?? [], redFlags: u?.red_flags ?? [] };
}

const byScoreThenDate = (a: PostingListItem, b: PostingListItem) =>
  (b.score ?? -1) - (a.score ?? -1) || Date.parse(b.posted_at ?? b.first_seen_at) - Date.parse(a.posted_at ?? a.first_seen_at);

export async function searchPostings(supabase: SupabaseClient, f: SearchFilters): Promise<SearchResult> {
  const mine = await userRows(supabase);

  // Saved and dismissed views ignore the search filters: they're your lists.
  if (f.view !== "all") {
    const ids = [...mine.values()].filter((r) => (f.view === "saved" ? r.saved_at : r.dismissed_at)).map((r) => r.posting_id);
    if (ids.length === 0) return { items: [], funnel: { found: 0, afterFilters: 0, scored: 0 }, unscoredIds: [], truncated: false };
    const { data } = await supabase.from("postings").select(LIST_COLUMNS).in("id", ids.slice(0, 500));
    const items = ((data ?? []) as Parameters<typeof withUser>[0][]).map((p) => withUser(p, mine.get(p.id))).sort(byScoreThenDate);
    return { items, funnel: { found: items.length, afterFilters: items.length, scored: items.filter((i) => i.score !== null).length }, unscoredIds: [], truncated: false };
  }

  const since = new Date(Date.now() - f.days * 86_400_000).toISOString();
  let q = supabase
    .from("postings")
    .select(LIST_COLUMNS, { count: "exact" })
    .is("closed_at", null)
    .or(`posted_at.gte.${since},and(posted_at.is.null,first_seen_at.gte.${since})`)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(CANDIDATE_LIMIT);
  if (f.source) q = q.eq("adapter", f.source);
  const { data, count, error } = await q;
  if (error) throw new AppError("Couldn't load jobs. Try again.");

  const rows = (data ?? []) as Parameters<typeof withUser>[0][];
  const kept = prefilter(rows, f).filter((p) => !mine.get(p.id)?.dismissed_at);
  const items = kept.map((p) => withUser(p, mine.get(p.id))).sort(byScoreThenDate);
  const unscoredIds = items.filter((i) => i.score === null).map((i) => i.id);

  return {
    items: items.slice(0, SHOW_LIMIT),
    funnel: { found: count ?? rows.length, afterFilters: items.length, scored: items.length - unscoredIds.length },
    unscoredIds,
    truncated: (count ?? 0) > CANDIDATE_LIMIT,
  };
}

async function upsertMine(supabase: SupabaseClient, user: User, postingId: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("user_postings").upsert({ user_id: user.id, posting_id: postingId, ...patch }, { onConflict: "user_id,posting_id" });
  if (error) throw new AppError("Couldn't save that. Try again.");
}

export const setSaved = (s: SupabaseClient, u: User, id: string, saved: boolean) => upsertMine(s, u, id, { saved_at: saved ? new Date().toISOString() : null });
export const setDismissed = (s: SupabaseClient, u: User, id: string, dismissed: boolean) =>
  upsertMine(s, u, id, { dismissed_at: dismissed ? new Date().toISOString() : null });

/** Scores up to 24 postings in batches of 8 (1 credit per batch). Returns how many were scored. */
/** `ownerId`: daily agent only (service role), see createApplication. */
export async function scorePostings(supabase: SupabaseClient, user: User, ids: string[], ownerId?: string): Promise<number> {
  const unique = [...new Set(ids)].slice(0, MAX_SCORE_PER_CLICK);
  if (unique.length === 0) return 0;
  const profile = await loadProfile(supabase, ownerId);
  if (profile.experiences.length === 0 && profile.skills.length === 0) throw new AppError("Add your roles and skills to your profile first, so there's something to score against.");

  const { data, error } = await supabase.from("postings").select("id, title, company, location, description").in("id", unique);
  if (error) throw new AppError("Couldn't load those jobs. Try again.");
  const postings = (data ?? []) as Array<{ id: string; title: string; company: string; location: string; description: string }>;
  const years = yearsOfExperience(profile);

  let scored = 0;
  for (let i = 0; i < postings.length; i += SCREEN_BATCH_SIZE) {
    const batch = postings.slice(i, i + SCREEN_BATCH_SIZE);
    // Short local ids keep real ids out of the prompt and let code map answers back.
    const local = new Map(batch.map((p, k) => [`J${k + 1}`, p]));
    const out = await runAiTask(
      user.id,
      SCREEN_JOBS,
      screenPrompt([...local].map(([id, p]) => ({ id, title: p.title, company: p.company, location: p.location, description: p.description })), profile, years),
    );
    const now = new Date().toISOString();
    const rows = out.data.results
      .filter((r) => local.has(r.id))
      .map((r) => {
        const p = local.get(r.id)!;
        const s = applySeniorityRules(p.title, years, { score: r.score, reasons: r.reasons, redFlags: r.redFlags });
        return { user_id: user.id, posting_id: p.id, score: s.score, reasons: s.reasons, red_flags: s.redFlags, scored_with: out.promptVersion, scored_at: now };
      });
    if (rows.length) {
      const { error: upErr } = await supabase.from("user_postings").upsert(rows, { onConflict: "user_id,posting_id" });
      if (upErr) throw new AppError("Scored, but couldn't save the scores. Try again.");
      scored += rows.length;
    }
  }
  return scored;
}

/** Turns a posting into an application (extract + match, 2 credits). */
export async function startApplicationFromPosting(supabase: SupabaseClient, user: User, postingId: string, ownerId?: string): Promise<string> {
  const { data, error } = await supabase.from("postings").select("id, title, company, location, url, description").eq("id", postingId).maybeSingle();
  if (error || !data) throw new AppError("That job wasn't found. It may have closed.");
  const jd = [`${data.title} at ${data.company}`, data.location, data.description, `Posting: ${data.url}`].filter(Boolean).join("\n\n");
  if (data.description.trim().length < 50) throw new AppError("This posting has no description to read. Open it, copy the text and paste it instead.");
  return createApplication(supabase, user, jd, data.id as string, ownerId);
}
