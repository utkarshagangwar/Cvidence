// The free filter: plain code, no model, runs before anything costs a credit.
// Title words, location, remote, freshness and seniority.

import { z } from "zod";

export const SENIORITY = ["intern", "junior", "senior", "lead", "staff", "principal", "manager", "director", "vp"] as const;
export type Seniority = (typeof SENIORITY)[number];

const SENIORITY_PATTERNS: Record<Seniority, RegExp> = {
  intern: /\b(intern|internship|trainee|apprentice)\b/i,
  junior: /\b(junior|jr\.?|entry[- ]level|associate|graduate|fresher)\b/i,
  senior: /\b(senior|sr\.?)\b/i,
  lead: /\b(lead|tech lead|team lead)\b/i,
  staff: /\bstaff\b/i,
  principal: /\b(principal|distinguished|fellow)\b/i,
  manager: /\b(manager|mgr|head of)\b/i,
  director: /\b(director)\b/i,
  vp: /\b(vp|vice president|chief|cto|ceo|cfo)\b/i,
};

/** Words people type that mean the same job. Matched as whole words, both ways. */
const ALIASES: Array<[RegExp, string[]]> = [
  [/^sde$/i, ["sde", "software development engineer", "software engineer", "software developer"]],
  [/^sdet$/i, ["sdet", "software development engineer in test", "test automation", "qa automation", "automation engineer"]],
  [/^qa$/i, ["qa", "quality assurance", "quality engineer", "test engineer", "tester", "testing"]],
  [/^swe$/i, ["swe", "software engineer"]],
  [/^(fe|frontend|front-end)$/i, ["frontend", "front-end", "front end", "ui engineer"]],
  [/^(be|backend|back-end)$/i, ["backend", "back-end", "back end"]],
  [/^(ml|ai)$/i, ["ml", "machine learning", "ai", "artificial intelligence"]],
  [/^devops$/i, ["devops", "site reliability", "sre", "platform engineer"]],
  [/^pm$/i, ["pm", "product manager"]],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (phrase: string) => new RegExp(`(^|[^a-z0-9])${escape(phrase).replace(/\s+/g, "[\\s-]+")}($|[^a-z0-9])`, "i");

export const searchSchema = z.object({
  q: z.string().trim().max(120).default(""),
  location: z.string().trim().max(80).default(""),
  remote: z.enum(["any", "remote", "onsite"]).default("any"),
  days: z.coerce.number().int().refine((n) => [1, 3, 7, 14, 30, 60].includes(n)).default(30).catch(30),
  exclude: z
    .preprocess((v) => (Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",") : []), z.array(z.enum(SENIORITY)))
    .default([])
    .catch([]),
  /** "india" keeps jobs in India, and remote jobs open to India, APAC or anywhere. */
  where: z.enum(["india", "anywhere"]).default("india").catch("india"),
  source: z.string().trim().regex(/^[a-z0-9_]{0,40}$/).default("").catch(""),
  view: z.enum(["all", "saved", "dismissed"]).default("all").catch("all"),
});
export type SearchFilters = z.infer<typeof searchSchema>;

/** "qa automation, sdet" -> groups of alternatives; every group must match. */
export function titleMatcher(q: string): (title: string) => boolean {
  const groups = q
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const words = part.split(/\s+/).filter(Boolean);
      // One alias word ("sde") expands; a multi-word phrase must appear as a phrase.
      const one = words.length === 1 ? words[0]! : null;
      const alias = one ? ALIASES.find(([re]) => re.test(one)) : undefined;
      const phrases = alias ? alias[1] : [part];
      return phrases.map(wordRe);
    });
  if (groups.length === 0) return () => true;
  // Comma means OR between groups ("qa, sdet").
  return (title) => groups.some((alts) => alts.some((re) => re.test(title)));
}

export function seniorityOf(title: string): Seniority[] {
  return SENIORITY.filter((s) => SENIORITY_PATTERNS[s].test(title));
}

const INDIA =
  /\b(india|bengaluru|bangalore|mumbai|pune|hyderabad|gurgaon|gurugram|delhi|new delhi|noida|chennai|kolkata|ahmedabad|jaipur|kochi|cochin|coimbatore|indore|chandigarh|thiruvananthapuram|trivandrum|mysore|mysuru|vadodara|nagpur|bhubaneswar|lucknow|surat|goa|visakhapatnam)\b/i;
const OPEN_REMOTE = /\b(apac|asia|anywhere|worldwide|global|international)\b/i;

/** In India, or remote and open to people in India. */
export function availableInIndia(p: { location: string; remote: boolean | null }): boolean {
  if (INDIA.test(p.location)) return true;
  if (p.remote !== true) return false;
  const loc = p.location.replace(/\b(remote|work from home|wfh|hybrid)\b/gi, "").replace(/[\s,;/()|-]+/g, " ").trim();
  return loc === "" || OPEN_REMOTE.test(loc);
}

export interface FilterablePosting {
  title: string;
  location: string;
  remote: boolean | null;
  posted_at: string | null;
  first_seen_at: string;
}

export function prefilter<T extends FilterablePosting>(postings: T[], f: SearchFilters, now = Date.now()): T[] {
  const titleOk = titleMatcher(f.q);
  const minTime = now - f.days * 86_400_000;
  const loc = f.location ? wordRe(f.location) : null;
  // Common spellings of the same city.
  const locAlt = f.location && /^(bangalore|bengaluru)$/i.test(f.location) ? /bangalore|bengaluru/i : f.location && /^(gurgaon|gurugram)$/i.test(f.location) ? /gurgaon|gurugram/i : null;
  const excluded = new Set(f.exclude);

  return postings.filter((p) => {
    if (!titleOk(p.title)) return false;
    const when = Date.parse(p.posted_at ?? p.first_seen_at);
    if (Number.isFinite(when) && when < minTime) return false;
    if (f.where === "india" && !availableInIndia(p)) return false;
    if (f.remote === "remote" && p.remote !== true) return false;
    if (f.remote === "onsite" && p.remote === true) return false;
    // A remote job open to India passes a city filter: you can do it from that city.
    if (loc && !(loc.test(p.location) || locAlt?.test(p.location) || (p.remote === true && availableInIndia(p)))) return false;
    if (excluded.size && seniorityOf(p.title).some((s) => excluded.has(s))) return false;
    return true;
  });
}
