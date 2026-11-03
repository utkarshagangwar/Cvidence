// AI import output -> ProfileDoc. Code assigns every id and skill link; the
// model only copied text. Invalid months become "" instead of failing.

import type { ImportModelOutput } from "@/lib/ai/tasks";
import { emptyProfile, newId, type ProfileDoc } from "./schema";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const month = (s: string) => {
  const t = s.trim();
  if (MONTH.test(t)) return t;
  if (/^\d{4}$/.test(t)) return `${t}-01`;
  return "";
};

export function importToProfile(out: ImportModelOutput, email: string): ProfileDoc {
  const doc = emptyProfile(email);
  doc.basics = {
    name: out.name,
    headline: out.headline,
    city: out.city,
    phone: out.phone.replace(/[^0-9+()\-\s]/g, ""),
    summary: out.summary,
    email,
    links: out.links.filter((l) => l.url),
  };
  doc.languages = out.languages.filter((l) => l.name);

  const byName = new Map<string, string>();
  const skillId = (name: string, group = "") => {
    const clean = name.trim().slice(0, 100);
    if (!clean) return null;
    const key = clean.toLowerCase();
    const found = byName.get(key);
    if (found) return found;
    const id = newId();
    byName.set(key, id);
    doc.skills.push({ id, name: clean, group });
    return id;
  };
  for (const s of out.skills) skillId(s.name, s.group);
  const link = (names: string[]) => [...new Set(names.map((n) => skillId(n, "Technical")).filter((x): x is string => !!x))];
  const bullets = (list: string[]) => list.filter(Boolean).map((text) => ({ id: newId(), text }));

  doc.experiences = out.experiences
    .filter((e) => e.company || e.title)
    .map((e) => {
      let startDate = month(e.start);
      let endDate = month(e.end);
      if (startDate && endDate && endDate < startDate) [startDate, endDate] = [endDate, startDate];
      return {
        id: newId(),
        company: e.company || "Company",
        title: e.title || "Role",
        location: e.location,
        startDate,
        endDate,
        bullets: bullets(e.bullets),
        skillIds: link(e.skills),
      };
    });

  doc.projects = out.projects
    .filter((p) => p.name)
    .map((p) => ({
      id: newId(),
      name: p.name,
      url: p.url,
      description: p.description,
      startDate: "",
      endDate: "",
      bullets: bullets(p.bullets),
      skillIds: link(p.skills),
    }));

  doc.education = out.education
    .filter((e) => e.institution)
    .map((e) => ({ id: newId(), institution: e.institution, degree: e.degree, field: e.field, grade: e.grade, startDate: month(e.start), endDate: month(e.end) }));

  doc.certifications = out.certifications
    .filter((c) => c.name)
    .map((c) => ({ id: newId(), name: c.name, issuer: c.issuer, issuedOn: month(c.issued), url: "" }));

  return doc;
}
