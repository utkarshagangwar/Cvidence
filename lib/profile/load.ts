import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyProfile, type ProfileDoc } from "./schema";

const toMonth = (d: string | null) => (d ? d.slice(0, 7) : "");

type Row = Record<string, unknown>;
const s = (r: Row, k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");

/**
 * Reads one user's whole profile and returns it as a ProfileDoc.
 * In the app, RLS limits it to the signed-in user. The daily agent runs with the
 * service role (RLS off), so it MUST pass `ownerId`: every query then filters
 * on user_id explicitly.
 */
export async function loadProfile(supabase: SupabaseClient, ownerId?: string): Promise<ProfileDoc> {
  const sel = (table: string, cols = "*") => {
    const q = supabase.from(table).select(cols as "*"); // columns are fixed strings below
    return ownerId ? q.eq("user_id", ownerId) : q;
  };
  const [profile, exps, projs, edu, certs, skills, expSkills, projSkills] = await Promise.all([
    sel("profiles").maybeSingle(),
    sel("experiences").order("sort"),
    sel("projects").order("sort"),
    sel("education").order("sort"),
    sel("certifications").order("sort"),
    sel("skills").order("sort"),
    sel("experience_skills", "experience_id, skill_id"),
    sel("project_skills", "project_id, skill_id"),
  ]);

  for (const r of [profile, exps, projs, edu, certs, skills, expSkills, projSkills]) {
    if (r.error) throw new Error("Could not load your profile");
  }

  const p = (profile.data ?? {}) as Row;
  const doc = emptyProfile(s(p, "email"));
  const linksFor = (rows: Row[] | null, key: string) => {
    const m = new Map<string, string[]>();
    for (const r of rows ?? []) {
      const k = r[key] as string;
      m.set(k, [...(m.get(k) ?? []), r.skill_id as string]);
    }
    return m;
  };
  const expLinks = linksFor(expSkills.data as Row[], "experience_id");
  const projLinks = linksFor(projSkills.data as Row[], "project_id");

  doc.basics = {
    name: s(p, "name"),
    headline: s(p, "headline"),
    city: s(p, "city"),
    phone: s(p, "phone"),
    summary: s(p, "summary"),
    email: s(p, "email"),
    links: Array.isArray(p.links) ? (p.links as ProfileDoc["basics"]["links"]) : [],
  };
  doc.languages = Array.isArray(p.languages) ? (p.languages as ProfileDoc["languages"]) : [];

  doc.experiences = ((exps.data ?? []) as Row[]).map((r) => ({
    id: r.id as string,
    company: s(r, "company"),
    title: s(r, "title"),
    location: s(r, "location"),
    startDate: toMonth(r.start_date as string | null),
    endDate: toMonth(r.end_date as string | null),
    bullets: (r.bullets as ProfileDoc["experiences"][number]["bullets"]) ?? [],
    skillIds: expLinks.get(r.id as string) ?? [],
  }));
  doc.projects = ((projs.data ?? []) as Row[]).map((r) => ({
    id: r.id as string,
    name: s(r, "name"),
    url: s(r, "url"),
    description: s(r, "description"),
    startDate: toMonth(r.start_date as string | null),
    endDate: toMonth(r.end_date as string | null),
    bullets: (r.bullets as ProfileDoc["projects"][number]["bullets"]) ?? [],
    skillIds: projLinks.get(r.id as string) ?? [],
  }));
  doc.education = ((edu.data ?? []) as Row[]).map((r) => ({
    id: r.id as string,
    institution: s(r, "institution"),
    degree: s(r, "degree"),
    field: s(r, "field"),
    grade: s(r, "grade"),
    startDate: toMonth(r.start_date as string | null),
    endDate: toMonth(r.end_date as string | null),
  }));
  doc.certifications = ((certs.data ?? []) as Row[]).map((r) => ({
    id: r.id as string,
    name: s(r, "name"),
    issuer: s(r, "issuer"),
    issuedOn: toMonth(r.issued_on as string | null),
    url: s(r, "url"),
  }));
  doc.skills = ((skills.data ?? []) as Row[]).map((r) => ({ id: r.id as string, name: s(r, "name"), group: s(r, "group") }));

  return doc;
}

/** ProfileDoc -> the jsonb shape public.save_profile expects (months become first-of-month dates). */
export function toSavePayload(doc: ProfileDoc) {
  const d = (m: string) => (m ? `${m}-01` : "");
  return {
    ...doc,
    experiences: doc.experiences.map((e) => ({ ...e, startDate: d(e.startDate), endDate: d(e.endDate) })),
    projects: doc.projects.map((e) => ({ ...e, startDate: d(e.startDate), endDate: d(e.endDate) })),
    education: doc.education.map((e) => ({ ...e, startDate: d(e.startDate), endDate: d(e.endDate) })),
    certifications: doc.certifications.map((e) => ({ ...e, issuedOn: d(e.issuedOn) })),
  };
}
