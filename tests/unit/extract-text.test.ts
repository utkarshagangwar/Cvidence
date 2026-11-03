import { describe, expect, it } from "vitest";
import { extractResumeText, sniffKind, UploadError } from "@/lib/profile/extract-text";

const LINE = "Riya Sharma QA Automation Engineer Bengaluru. Built a Selenium and Python suite on the Page Object Model.";

/** A minimal valid one-page PDF with real text, built by hand. */
function tinyPdf(text: string): Uint8Array {
  // One short line per sentence, like a real page (text past the page edge is clipped).
  const lines = text.replace(/[()\\]/g, "").split(/(?<=\.)\s+/);
  const stream = `BT /F1 10 Tf 14 TL 40 760 Td ${lines.map((l) => `(${l}) Tj T*`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

async function tinyDocx(text: string): Promise<Uint8Array> {
  const { Document, Packer, Paragraph } = await import("docx");
  const doc = new Document({ sections: [{ children: [new Paragraph(text), new Paragraph(text)] }] });
  return new Uint8Array(await Packer.toBuffer(doc));
}

describe("sniffKind", () => {
  it("detects PDF by its bytes even with a wrong name", () => {
    expect(sniffKind(tinyPdf("x"), "resume.docx")).toBe("pdf");
  });

  it("rejects an executable renamed to .pdf", () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]);
    expect(() => sniffKind(exe, "resume.pdf")).toThrow(UploadError);
  });

  it("only treats zip files as DOCX when named .docx", () => {
    expect(() => sniffKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]), "archive.zip")).toThrow(UploadError);
  });

  it("accepts markdown without NUL bytes", () => {
    expect(sniffKind(new TextEncoder().encode("# Riya"), "cv.md")).toBe("text");
  });
});

describe("extractResumeText", () => {
  it("reads text from a PDF", async () => {
    const text = await extractResumeText(tinyPdf(`${LINE} ${LINE}`), "pdf");
    expect(text).toContain("Selenium and Python");
  });

  it("reads text from a DOCX", async () => {
    const text = await extractResumeText(await tinyDocx(LINE), "docx");
    expect(text).toContain("Page Object Model");
  });

  it("refuses a file with almost no text (scanned PDF)", async () => {
    await expect(extractResumeText(tinyPdf("hi"), "pdf")).rejects.toThrow(/couldn't read text/);
  });
});
