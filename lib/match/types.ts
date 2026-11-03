import { z } from "zod";

// Models sometimes answer with ISO codes ("hi") instead of names ("Hindi").
const LANGUAGE_CODES: Record<string, string> = {
  en: "English", hi: "Hindi", kn: "Kannada", ta: "Tamil", te: "Telugu", ml: "Malayalam", mr: "Marathi",
  bn: "Bengali", gu: "Gujarati", pa: "Punjabi", ur: "Urdu", or: "Odia", as: "Assamese", fr: "French",
  de: "German", es: "Spanish", ja: "Japanese", zh: "Chinese", ar: "Arabic", ko: "Korean", pt: "Portuguese",
};

/** "hi" -> "Hindi"; names pass through unchanged. */
export function languageName(value: string): string {
  const v = value.trim();
  return LANGUAGE_CODES[v.toLowerCase()] ?? v;
}

// Fill in what the model left out instead of failing the whole reply:
// "years" and "language" entries often come back without their wording.
function normaliseRequirement(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = { ...(raw as Record<string, unknown>) };
  if (typeof r.language === "string") r.language = languageName(r.language);
  const text = typeof r.text === "string" ? r.text.trim() : "";
  if (text.length < 2) {
    if (typeof r.language === "string" && r.language) r.text = r.language;
    else if (typeof r.years === "number") r.text = `${r.years}+ years of experience`;
  }
  return r;
}

// What the extract step returns for a job description.
const requirementObject = z.object({
  id: z.string().regex(/^q\d{1,2}$/),
  text: z.string().trim().min(2).max(300),
  kind: z.enum(["skill", "years", "language", "other"]),
  /** For kind=years: the minimum years asked for. */
  years: z.number().min(0).max(40).nullable().default(null),
  /** For kind=language: the spoken language, e.g. "Hindi". */
  language: z.string().trim().max(60).nullable().default(null),
  mustHave: z.boolean().default(true),
});
export const requirementSchema = z.preprocess(normaliseRequirement, requirementObject);

export const extractedJdSchema = z.object({
  title: z.string().trim().max(200).default(""),
  company: z.string().trim().max(200).default(""),
  location: z.string().trim().max(200).default(""),
  remote: z.boolean().nullable().default(null),
  applyEmail: z.string().trim().max(320).nullable().default(null),
  applyUrl: z.string().trim().max(500).nullable().default(null),
  language: z.string().trim().max(20).default("en"),
  requirements: z.array(requirementSchema).min(1).max(30),
});

export type Requirement = z.infer<typeof requirementSchema>;
export type ExtractedJd = z.infer<typeof extractedJdSchema>;

// What the match step's model returns: requirement -> one existing skill name, or null.
export const matchMappingSchema = z.object({
  mappings: z
    .array(
      z.object({
        requirementId: z.string().regex(/^q\d{1,2}$/),
        skillName: z.string().trim().max(100).nullable(),
      }),
    )
    .max(30),
});
export type MatchMapping = z.infer<typeof matchMappingSchema>;

export type MatchState = "covered" | "partial" | "gap";

export interface MatchItem {
  requirementId: string;
  text: string;
  kind: Requirement["kind"];
  mustHave: boolean;
  state: MatchState;
  /** Plain-language reason shown under the requirement. */
  note: string;
  /** Source tags (R1, P2) that back a covered skill. */
  sources: string[];
  skillId: string | null;
}

export interface MatchResult {
  items: MatchItem[];
  counts: Record<MatchState, number>;
  yearsOfExperience: number;
}
