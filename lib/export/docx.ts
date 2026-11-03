// Builds an ATS-friendly DOCX in the browser: one column, real headings,
// real bullets, no tables or text boxes. Loaded only when someone exports.

import type { ResumeDocumentData } from "@/lib/tailor/frame";

export async function downloadResumeDocx(data: ResumeDocumentData, filename: string) {
  const { AlignmentType, Document, HeadingLevel, LevelFormat, Packer, Paragraph, TextRun } = await import("docx");
  const { resume, frame } = data;
  const b = frame.basics;
  const children: InstanceType<typeof Paragraph>[] = [];

  const heading = (text: string) =>
    new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 20 })] });
  const bullet = (text: string) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 40 }, children: [new TextRun({ text, size: 21 })] });

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: b.name || "Your name", bold: true, size: 36 })] }));
  const contact = [b.headline, b.city, b.phone, b.email, ...b.links.map((l) => l.url)].filter(Boolean).join(" | ");
  if (contact) children.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: contact, size: 19 })] }));
  if (resume.summary.text) children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: resume.summary.text, size: 21 })] }));

  if (resume.roles.length) {
    children.push(heading("Experience"));
    for (const r of resume.roles) {
      const m = frame.roles[r.experienceId];
      if (!m) continue;
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 40 },
          children: [
            new TextRun({ text: `${m.title}, ${m.company}`, bold: true, size: 22 }),
            new TextRun({ text: [m.location, m.dates].filter(Boolean).length ? `  |  ${[m.location, m.dates].filter(Boolean).join(" | ")}` : "", size: 19 }),
          ],
        }),
      );
      for (const u of r.bullets) children.push(bullet(u.text));
    }
  }

  if (resume.projects.length) {
    children.push(heading("Projects"));
    for (const p of resume.projects) {
      const m = frame.projects[p.projectId];
      if (!m) continue;
      children.push(new Paragraph({ spacing: { before: 100, after: 40 }, children: [new TextRun({ text: m.name, bold: true, size: 22 })] }));
      for (const u of p.bullets) children.push(bullet(u.text));
    }
  }

  const skills = resume.skillIds.map((id) => frame.skills[id]).filter(Boolean);
  if (skills.length) {
    children.push(heading("Skills"));
    children.push(new Paragraph({ children: [new TextRun({ text: skills.join(", "), size: 21 })] }));
  }

  if (frame.education.length) {
    children.push(heading("Education"));
    for (const e of frame.education) {
      const title = [e.degree, e.field].filter(Boolean).join(", ");
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: [title, e.institution, e.grade].filter(Boolean).join(", "), size: 21 }), new TextRun({ text: e.dates ? `  |  ${e.dates}` : "", size: 19 })],
        }),
      );
    }
  }

  if (frame.certifications.length) {
    children.push(heading("Certifications"));
    for (const c of frame.certifications) {
      children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: [c.name, c.issuer, c.dates].filter(Boolean).join(", "), size: 21 })] }));
    }
  }

  const doc = new Document({
    creator: "Cvidence",
    title: `${b.name} resume`,
    styles: { default: { document: { run: { font: "Calibri" } } } },
    numbering: {
      config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] }],
    },
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } }, children }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
