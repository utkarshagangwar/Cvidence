import "server-only";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_RESUME_CHARS = 50_000;

export type FileKind = "pdf" | "docx" | "text";

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

/** Decide the type from the file's first bytes, not its name or the browser's claim. */
export function sniffKind(bytes: Uint8Array, filename: string): FileKind {
  const head = (n: number) => Array.from(bytes.slice(0, n));
  if (head(5).join(",") === [0x25, 0x50, 0x44, 0x46, 0x2d].join(",")) return "pdf"; // %PDF-
  if (head(4).join(",") === [0x50, 0x4b, 0x03, 0x04].join(",") && /\.docx$/i.test(filename)) return "docx"; // ZIP
  if (/\.(md|markdown|txt)$/i.test(filename) && !bytes.slice(0, 4096).includes(0)) return "text";
  throw new UploadError("Upload a PDF, DOCX or Markdown file.");
}

export async function extractResumeText(bytes: Uint8Array, kind: FileKind): Promise<string> {
  let text = "";
  if (kind === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    if (pdf.numPages > 15) throw new UploadError("That PDF has more than 15 pages. Upload just your resume.");
    const out = await extractText(pdf, { mergePages: true });
    text = Array.isArray(out.text) ? out.text.join("\n") : out.text;
  } else if (kind === "docx") {
    const mammoth = await import("mammoth");
    const out = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    text = out.value;
  } else {
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }

  text = text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 150) {
    throw new UploadError("We couldn't read text from that file. If it's a scanned PDF, export it again as a text PDF or DOCX.");
  }
  if (text.length > MAX_RESUME_CHARS) {
    throw new UploadError("That file has more text than a resume usually does (over 50,000 characters).");
  }
  return text;
}
