import "server-only";
// Dashboard numbers, all read as the signed-in user (RLS). Weeks start on
// Monday in IST, because that's the week our users live in.

import type { SupabaseClient } from "@supabase/supabase-js";

const STAGES = ["draft", "applied", "interview", "offer"] as const;
export type Stage = (typeof STAGES)[number];
const IST_MS = (5 * 60 + 30) * 60_000;

export interface Funnel {
  reached: Record<Stage, number>;
  closed: number;
}

/** Monday 00:00 IST of the week containing `t`, as a UTC timestamp. */
export function istWeekStart(t: number): number {
  const ist = new Date(t + IST_MS);
  const day = (ist.getUTCDay() + 6) % 7; // Monday = 0
  const mondayIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - day);
  return mondayIst - IST_MS;
}

export function weeklyCounts(eventTimes: number[], weeks: number, now = Date.now()): Array<{ weekStart: number; count: number }> {
  const thisWeek = istWeekStart(now);
  const out = Array.from({ length: weeks }, (_, i) => ({ weekStart: thisWeek - (weeks - 1 - i) * 7 * 86_400_000, count: 0 }));
  for (const t of eventTimes) {
    const w = istWeekStart(t);
    const slot = out.find((o) => o.weekStart === w);
    if (slot) slot.count++;
  }
  return out;
}

/** How many applications ever reached each stage (a later stage implies the earlier ones). */
export function funnelFrom(apps: Array<{ id: string; status: string }>, events: Array<{ application_id: string; to_status: string }>): Funnel {
  const rank = (s: string) => STAGES.indexOf(s as Stage);
  const best = new Map<string, number>();
  for (const a of apps) best.set(a.id, Math.max(best.get(a.id) ?? 0, rank(a.status)));
  for (const e of events) if (best.has(e.application_id)) best.set(e.application_id, Math.max(best.get(e.application_id)!, rank(e.to_status)));
  const reached = { draft: 0, applied: 0, interview: 0, offer: 0 } as Record<Stage, number>;
  for (const r of best.values()) STAGES.forEach((s, i) => {
    if (r >= i) reached[s]++;
  });
  return { reached, closed: apps.filter((a) => a.status === "closed").length };
}

export interface WorthALook {
  postingId: string;
  title: string;
  company: string;
  location: string;
  score: number;
  reason: string | null;
}

export async function loadDashboard(supabase: SupabaseClient) {
  const since = new Date(istWeekStart(Date.now()) - 7 * 7 * 86_400_000).toISOString();
  const [apps, events, recentApplied, scored] = await Promise.all([
    supabase.from("applications").select("id, status, posting_id").limit(2000),
    supabase.from("status_events").select("application_id, to_status").limit(5000),
    supabase.from("status_events").select("created_at").eq("to_status", "applied").gte("created_at", since).limit(2000),
    supabase
      .from("user_postings")
      .select("posting_id, score, reasons, postings!inner(title, company, location, closed_at)")
      .is("dismissed_at", null)
      .is("postings.closed_at", null)
      .gte("score", 60)
      .order("score", { ascending: false })
      .limit(15),
  ]);

  const appRows = (apps.data ?? []) as Array<{ id: string; status: string; posting_id: string | null }>;
  const used = new Set(appRows.map((a) => a.posting_id).filter(Boolean));
  type Scored = { posting_id: string; score: number; reasons: string[]; postings: { title: string; company: string; location: string } | Array<{ title: string; company: string; location: string }> };
  const worth: WorthALook[] = ((scored.data ?? []) as unknown as Scored[])
    .filter((r) => !used.has(r.posting_id))
    .slice(0, 5)
    .map((r) => {
      const p = Array.isArray(r.postings) ? r.postings[0]! : r.postings;
      return { postingId: r.posting_id, title: p.title, company: p.company, location: p.location, score: r.score, reason: r.reasons?.[0] ?? null };
    });

  return {
    funnel: funnelFrom(appRows, (events.data ?? []) as Array<{ application_id: string; to_status: string }>),
    weekly: weeklyCounts(((recentApplied.data ?? []) as Array<{ created_at: string }>).map((e) => Date.parse(e.created_at)), 8),
    worth,
    total: appRows.length,
  };
}
