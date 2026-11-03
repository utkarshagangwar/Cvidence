// Cover letters and outreach emails, stored in documents.units with the same
// version history, source tags and "Check this" flags as the resume.

import { z } from "zod";
import type { Flag, Unit } from "@/lib/tailor/types";

export type LetterKind = "cover" | "email";

export interface LetterDoc {
  kind: LetterKind;
  /** Email only. */
  subject: Unit | null;
  greeting: Unit;
  paragraphs: Unit[];
  /** Added by code from the profile name, never by the model. */
  signoff: string;
  /** Email only: the posting's apply address, if it gave one. */
  to: string | null;
}

export interface LetterDocumentData extends LetterDoc {
  flags: Flag[];
}

const sourced = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? { text: v } : v),
    z.object({ text: z.string().trim().min(1).max(max), sources: z.array(z.string().max(12)).max(8).default([]) }),
  );

export const coverModelSchema = z.object({
  greeting: z.string().trim().max(120).default(""),
  paragraphs: z.array(sourced(1200)).min(2).max(6),
});

export const emailModelSchema = z.object({
  subject: z.string().trim().min(1).max(160),
  greeting: z.string().trim().max(120).default(""),
  paragraphs: z.array(sourced(900)).min(1).max(4),
});

export const refineModelSchema = z.object({
  changes: z.array(z.object({ id: z.string().max(16), text: z.string().trim().min(1).max(1200) })).max(16).default([]),
  reply: z.string().trim().min(1).max(600),
});
