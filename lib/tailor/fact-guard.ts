// Fact guard (no model): any number, proper noun or credential word in a
// generated line that appears in neither the profile nor the job description
// becomes a "Check this" flag. It never blocks; the person decides.

import type { ProfileDoc } from "@/lib/profile/schema";
import type { Flag, Unit } from "./types";

const CREDENTIAL_WORDS = [
  "certified", "certification", "certificate", "phd", "ph.d", "mba", "masters", "master's", "bachelor", "bachelor's",
  "degree", "licensed", "license", "award", "awarded", "patent", "patented", "published", "publication", "scholarship",
];

// Capitalised words that are ordinary at the start of a clause or are common in resumes.
const COMMON_CAPS = new Set([
  "i", "a", "an", "the", "and", "or", "for", "with", "in", "on", "at", "to", "of", "by", "from",
  // Letter and email openings (the app's own default greeting is "Dear Hiring Team,").
  "dear", "hi", "hello", "hiring", "team", "manager", "recruiter", "regards", "thanks", "thank",
]);

export function profileCorpus(doc: ProfileDoc): string {
  const parts: string[] = [
    doc.basics.name, doc.basics.headline, doc.basics.city, doc.basics.summary,
    ...doc.languages.map((l) => `${l.name} ${l.level}`),
    ...doc.experiences.flatMap((e) => [e.company, e.title, e.location, e.startDate, e.endDate, ...e.bullets.map((b) => b.text)]),
    ...doc.projects.flatMap((p) => [p.name, p.description, p.url, ...p.bullets.map((b) => b.text)]),
    ...doc.education.flatMap((e) => [e.institution, e.degree, e.field, e.grade, e.startDate, e.endDate]),
    ...doc.certifications.flatMap((c) => [c.name, c.issuer, c.issuedOn]),
    ...doc.skills.map((s) => s.name),
  ];
  return parts.join("\n");
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'");
const digitsOnly = (s: string) => s.replace(/[^\d.]/g, "").replace(/\.$/, "");

/** Numbers as they appear in the source, normalised ("1,200" -> "1200"). */
function numbersIn(s: string): Set<string> {
  const out = new Set<string>();
  for (const m of s.matchAll(/\d[\d,]*(?:\.\d+)?/g)) out.add(m[0].replace(/,/g, ""));
  return out;
}

export function factGuard(units: Unit[], doc: ProfileDoc, jdText: string): Flag[] {
  const corpus = `${profileCorpus(doc)}\n${jdText}`;
  const lower = norm(corpus);
  const nums = numbersIn(corpus);
  const flags: Flag[] = [];
  const add = (f: Flag) => {
    if (!flags.some((x) => x.unitId === f.unitId && x.token.toLowerCase() === f.token.toLowerCase())) flags.push(f);
  };

  for (const u of units) {
    const text = u.text;

    // Numbers, percentages, years, multipliers.
    for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?\s?(?:%|percent|x\b|×|k\b|m\b|\+|lpa|lakh|crore)?/gi)) {
      const raw = m[0].trim();
      const n = digitsOnly(raw.replace(/,/g, ""));
      if (n && !nums.has(n)) add({ unitId: u.id, token: raw, kind: "number" });
    }

    // Credential words.
    for (const w of CREDENTIAL_WORDS) {
      const re = new RegExp(`\\b${w.replace(/[.'*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(text) && !re.test(corpus)) add({ unitId: u.id, token: w, kind: "credential" });
    }

    // Proper nouns: capitalised words not at the start of a sentence.
    const sentences = text.split(/(?<=[.!?;:])\s+/);
    for (const sentence of sentences) {
      const tokens = sentence.split(/\s+/);
      tokens.forEach((tok, i) => {
        if (i === 0) return;
        const word = tok.replace(/^[("'“‘]+|[)"'”’.,;:!?]+$/g, "");
        if (!/^[A-Z][A-Za-z0-9+#./-]*$/.test(word)) return;
        if (COMMON_CAPS.has(word.toLowerCase())) return;
        if (lower.includes(norm(word))) return;
        // "Python-based", "Selenium-driven": fine when the name part is known.
        const stem = word.replace(/-(based|driven|focused|first|heavy|led|powered|backed|centric)$/i, "");
        if (stem !== word && lower.includes(norm(stem))) return;
        add({ unitId: u.id, token: word, kind: "name" });
      });
    }
  }
  return flags;
}
