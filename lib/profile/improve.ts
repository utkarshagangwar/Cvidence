// AI fixes for low ATS sections on the master profile. The model only rewords
// the person's own text; code checks every reply and keeps the original line
// whenever the new one adds a number, name or credential that isn't there.

import { z } from "zod";
import { bulletNeedsWork, FILLER, PAST_VERBS, PRESENT_VERBS, PRONOUNS } from "@/lib/ats/score";
import { IMPROVE_BULLETS_MAX } from "@/lib/ai/tasks";
import { factGuard } from "@/lib/tailor/fact-guard";
import { emptyProfile, type ProfileDoc } from "./schema";

export type ImproveSection = "summary" | "experience";

// The editor sends its unsaved draft, which may still have empty required
// fields, so this is looser than profileDocSchema but keeps the same limits.
const t = (max: number) => z.string().trim().max(max).default("");
const uuid = z.uuid();
const draftSchema = z.object({
  basics: z.object({ headline: t(300), summary: t(5000) }),
  experiences: z
    .array(
      z.object({
        id: uuid,
        title: t(200),
        company: t(200),
        startDate: t(7),
        endDate: t(7),
        bullets: z.array(z.object({ id: uuid, text: t(500) })).max(20).default([]),
        skillIds: z.array(uuid).max(60).default([]),
      }),
    )
    .max(30)
    .default([]),
  projects: z
    .array(z.object({ id: uuid, name: t(200), description: t(2000), bullets: z.array(z.object({ id: uuid, text: t(500) })).max(20).default([]) }))
    .max(30)
    .default([]),
  skills: z.array(z.object({ id: uuid, name: t(100) })).max(150).default([]),
});

/** Parses the editor's draft into a profile with only the parts the rewrite needs. */
export function parseDraft(input: unknown): ProfileDoc | null {
  const r = draftSchema.safeParse(input);
  if (!r.success) return null;
  const d = r.data;
  const doc = emptyProfile();
  doc.basics.headline = d.basics.headline;
  doc.basics.summary = d.basics.summary;
  doc.experiences = d.experiences.map((e) => ({ ...e, location: "" }));
  doc.projects = d.projects.map((p) => ({ ...p, url: "", startDate: "", endDate: "", skillIds: [] }));
  doc.skills = d.skills.map((s) => ({ ...s, group: "" }));
  return doc;
}

export interface BulletItem {
  /** Short id sent to the model. */
  id: string;
  bulletId: string;
  text: string;
  tense: "past" | "present";
  role: string;
}

/** The bullets that fail a scored check, in profile order, capped per request. */
export function bulletsToImprove(doc: ProfileDoc): { items: BulletItem[]; more: number } {
  const all: Omit<BulletItem, "id">[] = [];
  for (const e of doc.experiences) {
    for (const b of e.bullets) {
      if (bulletNeedsWork(b.text)) all.push({ bulletId: b.id, text: b.text, tense: e.endDate ? "past" : "present", role: [e.title, e.company].filter(Boolean).join(", ") });
    }
  }
  const items = all.slice(0, IMPROVE_BULLETS_MAX).map((x, i) => ({ ...x, id: `b${i + 1}` }));
  return { items, more: Math.max(0, all.length - items.length) };
}

export const verbsFor = () => ({ past: cap(PAST_VERBS), present: cap(PRESENT_VERBS) });
function cap(list: string[]) {
  return list.map((v) => v[0]!.toUpperCase() + v.slice(1));
}

const numbers = (s: string) => new Set([...s.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, "")));
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Keeps a rewritten bullet only if it adds no fact: every number must be in the
 * original bullet, and every name or credential must be somewhere in the profile.
 * `kept`: rewrites dropped because they changed a fact. `same`: bullets the
 * model left as they were (or skipped).
 */
export function acceptBullets(doc: ProfileDoc, items: BulletItem[], reply: Array<{ id: string; text: string }>) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const changes: Array<{ bulletId: string; text: string }> = [];
  let kept = 0;
  let same = 0;
  const seen = new Set<string>();
  for (const r of reply) {
    const item = byId.get(r.id);
    if (!item || seen.has(r.id)) continue;
    seen.add(r.id);
    const text = clean(r.text).slice(0, 500);
    const orig = numbers(item.text);
    const addsNumber = [...numbers(text)].some((n) => !orig.has(n));
    const flagged = factGuard([{ id: item.id, text, src: [] }], doc, "").length > 0;
    if (text === clean(item.text)) {
      same++;
      continue;
    }
    if (!text || addsNumber || flagged || PRONOUNS.test(text)) {
      kept++;
      continue;
    }
    changes.push({ bulletId: item.bulletId, text });
  }
  same += items.length - seen.size;
  return { changes, kept, same };
}

/** Accepts a rewritten summary only when it is clean and adds no fact. */
export function acceptSummary(doc: ProfileDoc, summary: string): string | null {
  const text = clean(summary).slice(0, 1200);
  if (!text || PRONOUNS.test(text) || FILLER.test(text)) return null;
  if (factGuard([{ id: "summary", text, src: [] }], doc, "").length > 0) return null;
  return text;
}
