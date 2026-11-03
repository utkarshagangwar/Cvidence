import { formatRange, formatYearRange, sourceTags, type ProfileDoc } from "@/lib/profile/schema";
import type { Flag, TailoredResume } from "./types";

/**
 * The fixed facts around the tailored lines (contact, role headers, education),
 * snapshotted from the profile when the resume is written so each saved
 * version stays exactly as it was.
 */
export interface ResumeFrame {
  basics: ProfileDoc["basics"];
  roles: Record<string, { tag: string; title: string; company: string; location: string; dates: string }>;
  projects: Record<string, { tag: string; name: string; url: string }>;
  education: Array<{ institution: string; degree: string; field: string; grade: string; dates: string }>;
  certifications: Array<{ name: string; issuer: string; dates: string }>;
  skills: Record<string, string>;
  sources: Array<{ tag: string; label: string }>;
  /** Only set for the master-profile export; tailored versions don't carry it. */
  languages?: Array<{ name: string; level: string }>;
  /** Skill id -> group (Technical, Tools, ...). Missing on versions saved before it existed. */
  skillGroups?: Record<string, string>;
}

export interface ResumeUnits {
  resume: TailoredResume;
  frame: ResumeFrame;
}

export interface ResumeDocumentData extends ResumeUnits {
  flags: Flag[];
}

export function buildFrame(doc: ProfileDoc): ResumeFrame {
  const tags = sourceTags(doc);
  return {
    basics: doc.basics,
    roles: Object.fromEntries(
      doc.experiences.map((e) => [e.id, { tag: tags.get(e.id)!, title: e.title, company: e.company, location: e.location, dates: formatRange(e.startDate, e.endDate) }]),
    ),
    projects: Object.fromEntries(doc.projects.map((p) => [p.id, { tag: tags.get(p.id)!, name: p.name, url: p.url }])),
    education: doc.education.map((e) => ({ institution: e.institution, degree: e.degree, field: e.field, grade: e.grade, dates: formatYearRange(e.startDate, e.endDate) })),
    certifications: doc.certifications.map((c) => ({ name: c.name, issuer: c.issuer, dates: formatYearRange(c.issuedOn, "") })),
    skills: Object.fromEntries(doc.skills.map((s) => [s.id, s.name])),
    skillGroups: Object.fromEntries(doc.skills.map((s) => [s.id, s.group])),
    sources: [
      ...doc.experiences.map((e) => ({ tag: tags.get(e.id)!, label: `${e.title}, ${e.company}` })),
      ...doc.projects.map((p) => ({ tag: tags.get(p.id)!, label: p.name })),
    ],
  };
}
