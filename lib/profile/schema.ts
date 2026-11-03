import { z } from "zod";

// The master profile as one document. Used by the editor, both importers,
// the ATS score, matching and tailoring. Dates are "YYYY-MM" (or "" = none;
// an empty endDate on a role means "present").

const id = z.uuid();
const month = z.union([z.literal(""), z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2024-04")]);
const text = (max: number) => z.string().trim().max(max);

export const bulletSchema = z.object({ id, text: text(500) });

export const experienceSchema = z.object({
  id,
  company: text(200).min(1, "Add the company"),
  title: text(200).min(1, "Add the job title"),
  location: text(200).default(""),
  startDate: month.default(""),
  endDate: month.default(""),
  bullets: z.array(bulletSchema).max(20).default([]),
  skillIds: z.array(id).max(60).default([]),
});

export const projectSchema = z.object({
  id,
  name: text(200).min(1, "Add the project name"),
  url: text(500).default(""),
  description: text(2000).default(""),
  startDate: month.default(""),
  endDate: month.default(""),
  bullets: z.array(bulletSchema).max(20).default([]),
  skillIds: z.array(id).max(60).default([]),
});

export const educationSchema = z.object({
  id,
  institution: text(200).min(1, "Add the school or university"),
  degree: text(200).default(""),
  field: text(200).default(""),
  grade: text(50).default(""),
  startDate: month.default(""),
  endDate: month.default(""),
});

export const certificationSchema = z.object({
  id,
  name: text(200).min(1, "Add the certification name"),
  issuer: text(200).default(""),
  issuedOn: month.default(""),
  url: text(500).default(""),
});

export const skillSchema = z.object({
  id,
  name: text(100).min(1),
  group: text(100).default(""),
});

export const profileDocSchema = z
  .object({
    basics: z.object({
      name: text(200),
      headline: text(300).default(""),
      city: text(200).default(""),
      phone: text(50).default(""),
      summary: text(5000).default(""),
      email: text(320).default(""),
      links: z.array(z.object({ label: text(60), url: text(500) })).max(10).default([]),
    }),
    languages: z.array(z.object({ name: text(60).min(1), level: text(60).default("") })).max(20).default([]),
    experiences: z.array(experienceSchema).max(30).default([]),
    projects: z.array(projectSchema).max(30).default([]),
    education: z.array(educationSchema).max(15).default([]),
    certifications: z.array(certificationSchema).max(40).default([]),
    skills: z.array(skillSchema).max(150).default([]),
  })
  .superRefine((doc, ctx) => {
    const skillIds = new Set(doc.skills.map((s) => s.id));
    const names = new Set<string>();
    doc.skills.forEach((s, i) => {
      const key = s.name.toLowerCase();
      if (names.has(key)) ctx.addIssue({ code: "custom", path: ["skills", i, "name"], message: `"${s.name}" is listed twice` });
      names.add(key);
    });
    for (const [section, list] of [["experiences", doc.experiences], ["projects", doc.projects]] as const) {
      list.forEach((entry, i) => {
        entry.skillIds.forEach((sid, j) => {
          if (!skillIds.has(sid)) ctx.addIssue({ code: "custom", path: [section, i, "skillIds", j], message: "Linked skill no longer exists" });
        });
      });
    }
  });

export type ProfileDoc = z.infer<typeof profileDocSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Skill = z.infer<typeof skillSchema>;

export function emptyProfile(email = ""): ProfileDoc {
  return {
    basics: { name: "", headline: "", city: "", phone: "", summary: "", email, links: [] },
    languages: [],
    experiences: [],
    projects: [],
    education: [],
    certifications: [],
    skills: [],
  };
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Source tags shown on resume lines: R1, R2 for roles; P1, P2 for projects (profile order). */
export function sourceTags(doc: Pick<ProfileDoc, "experiences" | "projects">) {
  const tags = new Map<string, string>();
  doc.experiences.forEach((e, i) => tags.set(e.id, `R${i + 1}`));
  doc.projects.forEach((p, i) => tags.set(p.id, `P${i + 1}`));
  return tags;
}

/** "2024-04" -> "Apr 2024"; "" -> "". */
export function formatMonth(m: string): string {
  if (!m) return "";
  const [y, mo] = m.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(mo) - 1] ?? ""} ${y}`.trim();
}

/** Years only ("2016 - 2020"), for education and certifications, where months are rarely known. */
export function formatYearRange(start: string, end: string): string {
  const s = start.slice(0, 4);
  const e = end.slice(0, 4);
  if (!s && !e) return "";
  if (!s || s === e) return e || s;
  return e ? `${s} - ${e}` : s;
}

export function formatRange(start: string, end: string, present = true): string {
  const s = formatMonth(start);
  const e = end ? formatMonth(end) : present ? "Present" : "";
  if (!s && !e) return "";
  if (!s) return e;
  return `${s} - ${e}`;
}
