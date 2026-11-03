// Builds an ATS-friendly DOCX in the browser: one column, real headings,
// real bullets, no tables or text boxes. Loaded only when someone exports.
// Layout matches the resume sheet: what (bold) with dates on a right tab,
// then where on the next line.

import type { ResumeDocumentData } from "@/lib/tailor/frame";
import { saveBlob } from "./download";
import { contactParts, gradeLabel, skillLines } from "./format";

// A4 with 0.625" side margins, in twips.
const PAGE = { width: 11906, height: 16838, side: 900, top: 720 };
const TEXT_WIDTH = PAGE.width - PAGE.side * 2;
const GREY = "555555";

export async function downloadResumeDocx(data: ResumeDocumentData, filename: string) {
  const { AlignmentType, BorderStyle, Document, HeadingLevel, LevelFormat, Packer, Paragraph, TabStopType, TextRun } = await import("docx");
  const { resume, frame } = data;
  const b = frame.basics;
  const children: InstanceType<typeof Paragraph>[] = [];

  const heading = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      keepNext: true,
      spacing: { before: 240, after: 100 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999", space: 2 } },
      children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 20, color: "222222" })],
    });
  const bullet = (text: string) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 40 }, children: [new TextRun({ text, size: 21 })] });
  const body = (text: string, after = 60) => new Paragraph({ spacing: { after }, children: [new TextRun({ text, size: 21 })] });
  // "Title ............ dates" then "Company, location" in grey.
  const entry = (title: string, when: string, where: string, before = 120) => {
    children.push(
      new Paragraph({
        keepNext: true,
        spacing: { before, after: where ? 0 : 40 },
        tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH }],
        children: [new TextRun({ text: title, bold: true, size: 22 }), ...(when ? [new TextRun({ text: `\t${when}`, size: 19, color: GREY })] : [])],
      }),
    );
    if (where) children.push(new Paragraph({ keepNext: true, spacing: { after: 40 }, children: [new TextRun({ text: where, size: 19, color: GREY })] }));
  };

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 40 }, children: [new TextRun({ text: b.name || "Your name", bold: true, size: 36 })] }));
  if (b.headline) children.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: b.headline, size: 22, color: "333333" })] }));
  const contact = contactParts(data).join("  |  ");
  if (contact) children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: contact, size: 19, color: GREY })] }));

  if (resume.summary.text) {
    children.push(heading("Summary"));
    children.push(body(resume.summary.text, 80));
  }

  if (resume.roles.length) {
    children.push(heading("Experience"));
    resume.roles.forEach((r, i) => {
      const m = frame.roles[r.experienceId];
      if (!m) return;
      entry(m.title, m.dates, [m.company, m.location].filter(Boolean).join(", "), i === 0 ? 40 : 160);
      for (const u of r.bullets) children.push(bullet(u.text));
    });
  }

  if (resume.projects.length) {
    children.push(heading("Projects"));
    resume.projects.forEach((p, i) => {
      const m = frame.projects[p.projectId];
      if (!m) return;
      entry(m.name, "", m.url, i === 0 ? 40 : 140);
      for (const u of p.bullets) children.push(bullet(u.text));
    });
  }

  const skills = skillLines(data);
  if (skills.length) {
    children.push(heading("Skills"));
    for (const g of skills) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [...(g.group ? [new TextRun({ text: `${g.group}: `, bold: true, size: 21 })] : []), new TextRun({ text: g.names.join(", "), size: 21 })],
        }),
      );
    }
  }

  if (frame.education.length) {
    children.push(heading("Education"));
    frame.education.forEach((e, i) => {
      const degree = [e.degree, e.field].filter(Boolean).join(", ");
      entry(degree || e.institution, e.dates, [degree ? e.institution : "", gradeLabel(e.grade)].filter(Boolean).join(", "), i === 0 ? 40 : 100);
    });
  }

  if (frame.certifications.length) {
    children.push(heading("Certifications"));
    frame.certifications.forEach((c, i) => entry(c.name, c.dates, c.issuer, i === 0 ? 40 : 80));
  }

  if (frame.languages?.length) {
    children.push(heading("Languages"));
    children.push(body(frame.languages.map((l) => (l.level ? `${l.name} (${l.level})` : l.name)).join(", ")));
  }

  const doc = new Document({
    creator: "Cvidence",
    title: `${b.name} resume`,
    styles: { default: { document: { run: { font: "Calibri" } } } },
    numbering: {
      config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] }],
    },
    sections: [
      {
        properties: { page: { size: { width: PAGE.width, height: PAGE.height }, margin: { top: PAGE.top, bottom: PAGE.top, left: PAGE.side, right: PAGE.side } } },
        children,
      },
    ],
  });

  saveBlob(await Packer.toBlob(doc), filename);
}
