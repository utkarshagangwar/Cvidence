// Checks and cleans whatever an adapter returns, so one odd board can't put bad
// rows in the shared postings table. Anything that fails is dropped, not saved.

import type { Posting, RawPosting } from "./types";

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function toIsoDate(v: RawPosting["postedAt"]): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(typeof v === "number" ? v : String(v));
  const t = d.getTime();
  // Reject nonsense: before 2000 or more than a day in the future.
  if (!Number.isFinite(t) || t < Date.UTC(2000, 0, 1) || t > Date.now() + 86_400_000) return null;
  return d.toISOString();
}

export function safeUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" && u.href.length <= 1000 ? u.href : null;
  } catch {
    return null;
  }
}

export function normalisePosting(raw: RawPosting, fallbackCompany: string): Posting | null {
  const externalId = clip(String(raw.externalId ?? ""), 200);
  const title = clip(raw.title, 300);
  const url = safeUrl(raw.url);
  if (!externalId || !title || !url) return null;
  const description = typeof raw.description === "string" ? raw.description.trim().slice(0, 20_000) : "";
  return {
    externalId,
    title,
    company: clip(raw.company, 200) || fallbackCompany.slice(0, 200),
    location: clip(raw.location, 300),
    remote: typeof raw.remote === "boolean" ? raw.remote : null,
    employmentType: clip(raw.employmentType, 60),
    salary: clip(raw.salary, 200),
    url,
    description,
    postedAt: toIsoDate(raw.postedAt),
  };
}

/** Normalises a whole page, dropping bad items and duplicate ids. */
export function normaliseAll(raws: RawPosting[], fallbackCompany: string): Posting[] {
  const seen = new Set<string>();
  const out: Posting[] = [];
  for (const r of raws) {
    const p = normalisePosting(r, fallbackCompany);
    if (!p || seen.has(p.externalId)) continue;
    seen.add(p.externalId);
    out.push(p);
  }
  return out;
}
