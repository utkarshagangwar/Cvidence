// Turns the model's letter or email into a LetterDoc using only what code trusts:
// source tags must exist in the profile, lengths are capped, the sign-off and
// recipient come from the profile and the posting, never from the model.

import { sourceTags, type ProfileDoc } from "@/lib/profile/schema";
import type { Unit } from "@/lib/tailor/types";
import type { LetterDoc, LetterKind } from "./types";

const clean = (s: string, max: number) => s.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim().slice(0, max);
const MAX_PARAGRAPHS: Record<LetterKind, number> = { cover: 5, email: 3 };
const EMAIL_RE = /^[^\s@<>()"',;]+@[^\s@<>()"',;]+\.[a-z]{2,}$/i;

export function signoffFor(doc: ProfileDoc): string {
  return ["Regards,", doc.basics.name.trim()].filter(Boolean).join("\n");
}

export function safeRecipient(email: string | null | undefined): string | null {
  const e = (email ?? "").trim();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

export function sanitizeLetter(
  kind: LetterKind,
  out: { subject?: string; greeting: string; paragraphs: Array<{ text: string; sources: string[] }> },
  doc: ProfileDoc,
  applyEmail: string | null,
): LetterDoc {
  const known = new Set(sourceTags(doc).values());
  const paragraphs: Unit[] = out.paragraphs
    .map((p) => ({ text: clean(p.text, kind === "cover" ? 1200 : 900), src: [...new Set(p.sources.map((s) => s.trim().toUpperCase()))].filter((s) => known.has(s)) }))
    .filter((p) => p.text)
    .slice(0, MAX_PARAGRAPHS[kind])
    .map((p, i) => ({ id: `p${i + 1}`, text: p.text, src: p.src }));
  const greeting = clean(out.greeting, 120) || "Dear Hiring Team,";
  return {
    kind,
    subject: kind === "email" ? { id: "subject", text: clean(out.subject ?? "", 160) || "Application", src: [] } : null,
    greeting: { id: "greeting", text: greeting, src: [] },
    paragraphs,
    signoff: signoffFor(doc),
    to: kind === "email" ? safeRecipient(applyEmail) : null,
  };
}

export function letterUnits(d: LetterDoc): Unit[] {
  return [...(d.subject ? [d.subject] : []), d.greeting, ...d.paragraphs];
}

export function replaceLetterUnit(d: LetterDoc, unitId: string, text: string): LetterDoc {
  const upd = (u: Unit): Unit => (u.id === unitId ? { ...u, text, edited: true } : u);
  return { ...d, subject: d.subject ? upd(d.subject) : null, greeting: upd(d.greeting), paragraphs: d.paragraphs.map(upd) };
}

/** Plain text for Copy and for the mailto: body. */
export function letterText(d: LetterDoc): string {
  return [d.greeting.text, ...d.paragraphs.map((p) => p.text), d.signoff].join("\n\n");
}

/** mailto: link with subject and body, or null when there's no recipient. */
export function mailtoHref(d: LetterDoc): string | null {
  if (!d.to) return null;
  const q = new URLSearchParams({ subject: d.subject?.text ?? "", body: letterText(d) }).toString().replace(/\+/g, "%20");
  return `mailto:${encodeURIComponent(d.to).replace("%40", "@")}?${q}`;
}
