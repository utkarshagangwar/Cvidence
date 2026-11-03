// Small formatting rules shared by the resume sheet (screen, print/PDF) and the
// DOCX, Markdown and text exports, so every format reads the same way.

import type { ResumeDocumentData } from "@/lib/tailor/frame";

/** "7.8" -> "CGPA 7.8", "54" -> "54%"; anything already labelled stays as written. */
export function gradeLabel(grade: string): string {
  const g = grade.trim();
  if (!/^\d+(?:\.\d+)?$/.test(g)) return g;
  const n = Number(g);
  if (n <= 10) return `CGPA ${g}`;
  if (n <= 100) return `${g}%`;
  return g;
}

/**
 * Skills as lines. When the profile sorts skills into two or more groups
 * (Technical, Tools, ...), one line per group in first-seen order; otherwise one line.
 */
export function skillLines(data: ResumeDocumentData): Array<{ group: string; names: string[] }> {
  const { resume, frame } = data;
  const ids = resume.skillIds.filter((id) => frame.skills[id]);
  const groupOf = (id: string) => frame.skillGroups?.[id]?.trim() ?? "";
  const groups = [...new Set(ids.map(groupOf))];
  if (groups.length < 2 || groups.every((g) => !g)) return ids.length ? [{ group: "", names: ids.map((id) => frame.skills[id]!) }] : [];
  return groups.map((g) => ({ group: g || "Other", names: ids.filter((id) => groupOf(id) === g).map((id) => frame.skills[id]!) }));
}

/** The contact line under the name: city, phone, email, links. */
export function contactParts(data: ResumeDocumentData): string[] {
  const b = data.frame.basics;
  return [b.city, b.phone, b.email, ...b.links.map((l) => l.url)].filter((s) => s && s.trim());
}
