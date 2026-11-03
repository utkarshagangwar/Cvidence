// Covered / partial / gap is decided here, by code, never by the model.
//  skill:    covered = skill linked to a role or project; partial = listed but
//            not linked; gap = not in the profile.
//  years:    computed from role dates (overlaps merged).
//  language: matched against the profile's languages.

import { sourceTags, type ProfileDoc } from "@/lib/profile/schema";
import { languageName, type ExtractedJd, type MatchItem, type MatchMapping, type MatchResult, type MatchState } from "./types";

const words = (s: string) => s.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);

/** Total years in roles, merging overlaps. Open-ended roles run to `now`. */
export function yearsOfExperience(doc: Pick<ProfileDoc, "experiences">, now: Date = new Date()): number {
  const toIdx = (m: string) => {
    const [y, mo] = m.split("-").map(Number);
    return (y ?? 0) * 12 + ((mo ?? 1) - 1);
  };
  const nowIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const spans = doc.experiences
    .filter((e) => e.startDate)
    .map((e) => [toIdx(e.startDate), e.endDate ? toIdx(e.endDate) + 1 : nowIdx + 1] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

  let months = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [s, e] of spans) {
    if (s > curEnd) {
      if (curEnd > curStart) months += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) {
      curEnd = e;
    }
  }
  if (curEnd > curStart) months += curEnd - curStart;
  return Math.round((months / 12) * 10) / 10;
}

export function classifyMatch(jd: ExtractedJd, mapping: MatchMapping, doc: ProfileDoc, now: Date = new Date()): MatchResult {
  const tags = sourceTags(doc);
  const byName = new Map(doc.skills.map((s) => [s.name.toLowerCase(), s]));
  const mapped = new Map(mapping.mappings.map((m) => [m.requirementId, m.skillName]));
  const years = yearsOfExperience(doc, now);

  const sourcesFor = (skillId: string) => {
    const out: string[] = [];
    for (const e of doc.experiences) if (e.skillIds.includes(skillId)) out.push(`${tags.get(e.id)} ${e.company}`);
    for (const p of doc.projects) if (p.skillIds.includes(skillId)) out.push(`${tags.get(p.id)} ${p.name}`);
    return out;
  };

  const items: MatchItem[] = jd.requirements.map((r) => {
    const base = { requirementId: r.id, text: r.text, kind: r.kind, mustHave: r.mustHave, sources: [] as string[], skillId: null as string | null };

    if (r.kind === "years") {
      const need = r.years ?? 0;
      const state: MatchState = years >= need ? "covered" : years >= need - 1 && need > 1 ? "partial" : "gap";
      const note = `About ${years} year${years === 1 ? "" : "s"} across ${doc.experiences.length} role${doc.experiences.length === 1 ? "" : "s"}`;
      return { ...base, state, note };
    }

    if (r.kind === "language") {
      // Whole-word match only: "hi" must never match "Chinese".
      const asked = words(languageName(r.language ?? r.text));
      const has = doc.languages.some((l) => {
        const name = words(languageName(l.name));
        return name.length > 0 && name.every((w) => asked.includes(w));
      });
      return { ...base, state: has ? "covered" : "gap", note: has ? "Listed in your languages" : "Not in your languages" };
    }

    // skill / other: the model may only point at a skill that exists in the profile.
    const name = mapped.get(r.id);
    const skill = name ? byName.get(name.toLowerCase()) : undefined;
    if (!skill) {
      return { ...base, state: "gap", note: "Not in your profile" };
    }
    const sources = sourcesFor(skill.id);
    if (sources.length > 0) {
      return { ...base, state: "covered", note: sources.join(" · "), sources: sources.map((s) => s.split(" ")[0]!), skillId: skill.id };
    }
    return { ...base, state: "partial", note: "In your skills; no role or project shows it yet", skillId: skill.id };
  });

  const counts = { covered: 0, partial: 0, gap: 0 } as Record<MatchState, number>;
  for (const i of items) counts[i.state]++;
  return { items, counts, yearsOfExperience: years };
}
