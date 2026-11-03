// Turns the tailor model's reply into a TailoredResume using only what the
// profile contains: unknown ids are dropped, unknown skills are rejected, and
// any role the model skipped keeps its original bullets.

import { sourceTags, type ProfileDoc } from "@/lib/profile/schema";
import type { TailoredResume, TailorModelOutput, Unit } from "./types";

const MAX_BULLETS_PER_ROLE = 6;
const MAX_BULLETS_PER_PROJECT = 3;
const MAX_PROJECTS = 4;
const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * For a finished role, swap a present-tense opening verb ("Execute") for the
 * past form the user wrote in that role's own lines ("Executed"). Only uses
 * words already in the profile, so it can never introduce new wording.
 */
export function pastTenseFromSource(text: string, sourceLines: string[]): string {
  const [first = "", ...rest] = text.split(" ");
  const w = first.toLowerCase();
  if (!w || /ed$/.test(w)) return text;
  const forms = new Set([`${w}d`, `${w}ed`, w.replace(/y$/, "ied"), `${w}${w.slice(-1)}ed`]);
  for (const line of sourceLines) {
    const verb = line.trim().split(/\s+/)[0] ?? "";
    if (forms.has(verb.toLowerCase())) return [verb, ...rest].join(" ");
  }
  return text;
}

export function sanitizeTailored(out: TailorModelOutput, doc: ProfileDoc): TailoredResume {
  const tags = sourceTags(doc);
  const tagToRole = new Map(doc.experiences.map((e) => [tags.get(e.id)!, e]));
  const tagToProject = new Map(doc.projects.map((p) => [tags.get(p.id)!, p]));

  const modelRoles = new Map<string, TailorModelOutput["roles"][number]>();
  for (const r of out.roles) if (tagToRole.has(r.id) && !modelRoles.has(r.id)) modelRoles.set(r.id, r);

  const roles = doc.experiences.map((e) => {
    const tag = tags.get(e.id)!;
    const fromModel = (modelRoles.get(tag)?.bullets ?? [])
      .map((b) => clean(b.text, 400))
      .filter(Boolean)
      .map((t) => (e.endDate ? pastTenseFromSource(t, e.bullets.map((b) => b.text)) : t))
      .slice(0, MAX_BULLETS_PER_ROLE);
    const texts = fromModel.length > 0 ? fromModel : e.bullets.map((b) => b.text).slice(0, MAX_BULLETS_PER_ROLE);
    const bullets: Unit[] = texts.map((text, i) => ({ id: `${tag}.${i + 1}`, text, src: [tag] }));
    return { experienceId: e.id, tag, bullets };
  });

  const seenProjects = new Set<string>();
  let projects = out.projects
    .filter((p) => tagToProject.has(p.id) && !seenProjects.has(p.id) && seenProjects.add(p.id))
    .slice(0, MAX_PROJECTS)
    .map((p) => {
      const proj = tagToProject.get(p.id)!;
      const texts = p.bullets.map((b) => clean(b.text, 400)).filter(Boolean).slice(0, MAX_BULLETS_PER_PROJECT);
      const fallback = proj.bullets.length ? proj.bullets.map((b) => b.text) : proj.description ? [proj.description] : [];
      const use = texts.length ? texts : fallback.slice(0, MAX_BULLETS_PER_PROJECT);
      return { projectId: proj.id, tag: p.id, bullets: use.map((text, i) => ({ id: `${p.id}.${i + 1}`, text, src: [p.id] })) };
    });
  if (projects.length === 0) {
    projects = doc.projects.slice(0, 3).map((proj) => {
      const tag = tags.get(proj.id)!;
      const texts = proj.bullets.length ? proj.bullets.map((b) => b.text) : proj.description ? [proj.description] : [];
      return { projectId: proj.id, tag, bullets: texts.slice(0, MAX_BULLETS_PER_PROJECT).map((text, i) => ({ id: `${tag}.${i + 1}`, text, src: [tag] })) };
    });
  }

  const byName = new Map(doc.skills.map((s) => [s.name.toLowerCase(), s.id]));
  const skillIds: string[] = [];
  for (const name of out.skills) {
    const sid = byName.get(name.toLowerCase());
    if (sid && !skillIds.includes(sid)) skillIds.push(sid);
  }

  const summaryText = clean(out.summary, 900) || doc.basics.summary;
  return {
    summary: { id: "summary", text: summaryText, src: [] },
    roles,
    projects,
    skillIds: skillIds.length ? skillIds : doc.skills.map((s) => s.id),
  };
}

/** Every editable unit in display order. */
export function allUnits(r: TailoredResume): Unit[] {
  return [r.summary, ...r.roles.flatMap((x) => x.bullets), ...r.projects.flatMap((x) => x.bullets)];
}

/** Returns a copy with one unit's text replaced. */
export function replaceUnit(r: TailoredResume, unitId: string, text: string): TailoredResume {
  const upd = (u: Unit): Unit => (u.id === unitId ? { ...u, text, edited: true } : u);
  return {
    ...r,
    summary: upd(r.summary),
    roles: r.roles.map((x) => ({ ...x, bullets: x.bullets.map(upd) })),
    projects: r.projects.map((x) => ({ ...x, bullets: x.bullets.map(upd) })),
  };
}
