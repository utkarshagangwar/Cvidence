// Markdown and plain-text resumes: one column, standard section names, one
// fact per line. Plain text is what many ATS forms ask you to paste.

import type { ResumeDocumentData } from "@/lib/tailor/frame";
import { contactParts, gradeLabel, skillLines } from "./format";

interface Line {
  kind: "title" | "bullet" | "line";
  text: string;
  /** Dates, shown after the title. */
  when?: string;
  /** Company, location, institution or grade, on the line under the title. */
  where?: string;
}

interface Block {
  heading: string;
  lines: Line[];
}

const join = (parts: Array<string | undefined>, sep: string) => parts.filter((p) => p && p.trim()).join(sep);

function blocks(data: ResumeDocumentData): { name: string; headline: string; contact: string; sections: Block[] } {
  const { resume, frame } = data;
  const sections: Block[] = [];

  if (resume.summary.text) sections.push({ heading: "Summary", lines: [{ kind: "line", text: resume.summary.text }] });

  const exp: Block = { heading: "Experience", lines: [] };
  for (const r of resume.roles) {
    const m = frame.roles[r.experienceId];
    if (!m) continue;
    exp.lines.push({ kind: "title", text: m.title, when: m.dates, where: join([m.company, m.location], ", ") });
    for (const u of r.bullets) exp.lines.push({ kind: "bullet", text: u.text });
  }
  if (exp.lines.length) sections.push(exp);

  const proj: Block = { heading: "Projects", lines: [] };
  for (const p of resume.projects) {
    const m = frame.projects[p.projectId];
    if (!m) continue;
    proj.lines.push({ kind: "title", text: m.name, where: m.url });
    for (const u of p.bullets) proj.lines.push({ kind: "bullet", text: u.text });
  }
  if (proj.lines.length) sections.push(proj);

  const skills = skillLines(data);
  if (skills.length) sections.push({ heading: "Skills", lines: skills.map((g) => ({ kind: "line" as const, text: g.group ? `${g.group}: ${g.names.join(", ")}` : g.names.join(", ") })) });

  if (frame.education.length) {
    sections.push({
      heading: "Education",
      lines: frame.education.map((e) => {
        const degree = join([e.degree, e.field], ", ");
        return { kind: "title" as const, text: degree || e.institution, when: e.dates, where: join([degree ? e.institution : "", gradeLabel(e.grade)], ", ") };
      }),
    });
  }
  if (frame.certifications.length) {
    sections.push({ heading: "Certifications", lines: frame.certifications.map((c) => ({ kind: "title" as const, text: c.name, when: c.dates, where: c.issuer })) });
  }
  if (frame.languages?.length) {
    sections.push({ heading: "Languages", lines: [{ kind: "line", text: frame.languages.map((l) => (l.level ? `${l.name} (${l.level})` : l.name)).join(", ") }] });
  }

  return { name: frame.basics.name || "Your name", headline: frame.basics.headline, contact: contactParts(data).join(" | "), sections };
}

// Stops resume text being read as Markdown syntax (headings, lists, links).
const md = (s: string) => s.replace(/([\\`*_[\]<>#|])/g, "\\$1").replace(/^(\d+)\./, "$1\\.").replace(/^([-+])\s/, "\\$1 ");

export function resumeToMarkdown(data: ResumeDocumentData): string {
  const r = blocks(data);
  const out = [`# ${md(r.name)}`, ""];
  if (r.headline) out.push(`**${md(r.headline)}**`, "");
  if (r.contact) out.push(md(r.contact), "");
  for (const s of r.sections) {
    out.push(`## ${s.heading}`, "");
    for (const l of s.lines) {
      if (l.kind === "title") {
        out.push(`### ${md(l.text)}${l.when ? ` (${md(l.when)})` : ""}`);
        out.push(...(l.where ? [md(l.where), ""] : [""]));
      } else if (l.kind === "bullet") out.push(`- ${md(l.text)}`);
      else out.push(md(l.text), "");
    }
    if (out[out.length - 1] !== "") out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export function resumeToText(data: ResumeDocumentData): string {
  const r = blocks(data);
  const out = [r.name.toUpperCase()];
  if (r.headline) out.push(r.headline);
  if (r.contact) out.push(r.contact);
  out.push("");
  for (const s of r.sections) {
    out.push(s.heading.toUpperCase(), "-".repeat(s.heading.length));
    s.lines.forEach((l, i) => {
      if (l.kind === "title") {
        if (i > 0) out.push("");
        out.push(l.when ? `${l.text} | ${l.when}` : l.text);
        if (l.where) out.push(l.where);
      } else if (l.kind === "bullet") out.push(`  • ${l.text}`);
      else out.push(l.text);
    });
    out.push("");
  }
  return out.join("\n").trimEnd() + "\n";
}
