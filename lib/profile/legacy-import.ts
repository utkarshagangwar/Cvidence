// Maps what the old single-page builder saved in localStorage ("resumeData")
// to a ProfileDoc. Pure: runs in the browser, tested in Node.

import { emptyProfile, newId, type ProfileDoc } from "./schema";

export const LEGACY_STORAGE_KEY = "resumeData";

interface LegacyData {
  contact?: { name?: string; email?: string; phone?: string; location?: string; linkedin?: string; portfolio?: string };
  summary?: string;
  targetRole?: string;
  experience?: Array<{ title?: string; company?: string; dates?: string; location?: string; bullets?: string }>;
  education?: Array<{ degree?: string; school?: string; dates?: string; details?: string }>;
  skills?: { technical?: string; soft?: string; tools?: string };
  projects?: Array<{ name?: string; tech?: string; description?: string }>;
  certifications?: Array<{ name?: string; issuer?: string; date?: string }>;
  languages?: Array<{ language?: string; proficiency?: string }>;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
};

/** "Jan 2020", "January 2020", "01/2020", "2020-01", "2020" -> "YYYY-MM"; anything else -> "". */
export function parseLegacyMonth(raw: string): string {
  const s = raw.trim().toLowerCase();
  let m = /^([a-z]{3,9})\.?\s+(\d{4})$/.exec(s);
  if (m) {
    const mo = MONTHS[m[1]!.slice(0, m[1]!.startsWith("sept") ? 4 : 3)];
    return mo ? `${m[2]}-${mo}` : "";
  }
  m = /^(\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return `${m[2]}-${m[1]!.padStart(2, "0")}`;
  m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${m[2]}`;
  m = /^(\d{4})$/.exec(s);
  if (m) return `${m[1]}-01`;
  return "";
}

/** "Jan 2020 - Present" -> { start: "2020-01", end: "" }. Unknown parts become "". */
export function parseLegacyRange(raw: string | undefined): { start: string; end: string } {
  if (!raw) return { start: "", end: "" };
  const parts = raw.split(/\s+(?:-|–|—|to)\s+|\s*[–—]\s*/i).map((p) => p.trim()).filter(Boolean);
  const start = parseLegacyMonth(parts[0] ?? "");
  const endRaw = parts[1] ?? "";
  const end = /present|current|now|ongoing/i.test(endRaw) ? "" : parseLegacyMonth(endRaw);
  return { start, end };
}

const splitList = (s: string | undefined) =>
  (s ?? "")
    .split(/[,\n;|•]/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && x.length <= 100);

const splitBullets = (s: string | undefined) =>
  (s ?? "")
    .split(/\n+/)
    .map((x) => x.replace(/^\s*(?:[-*•▪◦]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((text) => ({ id: newId(), text: text.slice(0, 500) }));

export function legacyToProfile(raw: unknown, fallbackEmail = ""): ProfileDoc {
  const data = (raw && typeof raw === "object" ? raw : {}) as LegacyData;
  const doc = emptyProfile(fallbackEmail);
  const c = data.contact ?? {};

  doc.basics = {
    name: (c.name ?? "").trim().slice(0, 200),
    headline: (data.targetRole ?? "").trim().slice(0, 300),
    city: (c.location ?? "").trim().slice(0, 200),
    phone: (c.phone ?? "").trim().slice(0, 50),
    summary: (data.summary ?? "").trim().slice(0, 5000),
    email: fallbackEmail || (c.email ?? "").trim(),
    links: [
      ...(c.linkedin ? [{ label: "LinkedIn", url: c.linkedin.trim().slice(0, 500) }] : []),
      ...(c.portfolio ? [{ label: "Portfolio", url: c.portfolio.trim().slice(0, 500) }] : []),
    ],
  };

  // Skills first, so roles and projects can link to them by name.
  const groups: Array<[string, string | undefined]> = [
    ["Technical", data.skills?.technical],
    ["Tools", data.skills?.tools],
    ["Soft skills", data.skills?.soft],
  ];
  const byName = new Map<string, string>();
  for (const [group, list] of groups) {
    for (const name of splitList(list)) {
      const key = name.toLowerCase();
      if (byName.has(key)) continue;
      const sid = newId();
      byName.set(key, sid);
      doc.skills.push({ id: sid, name, group });
    }
  }

  doc.experiences = (data.experience ?? [])
    .filter((e) => (e.company ?? "").trim() || (e.title ?? "").trim())
    .map((e) => {
      const { start, end } = parseLegacyRange(e.dates);
      return {
        id: newId(),
        company: (e.company ?? "").trim().slice(0, 200) || "Company",
        title: (e.title ?? "").trim().slice(0, 200) || "Role",
        location: (e.location ?? "").trim().slice(0, 200),
        startDate: start,
        endDate: end,
        bullets: splitBullets(e.bullets),
        skillIds: [],
      };
    });

  doc.projects = (data.projects ?? [])
    .filter((p) => (p.name ?? "").trim())
    .map((p) => {
      const tech = splitList(p.tech);
      const skillIds: string[] = [];
      for (const t of tech) {
        const key = t.toLowerCase();
        let sid = byName.get(key);
        if (!sid) {
          sid = newId();
          byName.set(key, sid);
          doc.skills.push({ id: sid, name: t, group: "Technical" });
        }
        skillIds.push(sid);
      }
      return {
        id: newId(),
        name: (p.name ?? "").trim().slice(0, 200),
        url: "",
        description: (p.description ?? "").trim().slice(0, 2000),
        startDate: "",
        endDate: "",
        bullets: [],
        skillIds,
      };
    });

  doc.education = (data.education ?? [])
    .filter((e) => (e.school ?? "").trim())
    .map((e) => {
      const { start, end } = parseLegacyRange(e.dates);
      return {
        id: newId(),
        institution: (e.school ?? "").trim().slice(0, 200),
        degree: (e.degree ?? "").trim().slice(0, 200),
        field: "",
        grade: (e.details ?? "").trim().slice(0, 50),
        startDate: start,
        endDate: end,
      };
    });

  doc.certifications = (data.certifications ?? [])
    .filter((c2) => (c2.name ?? "").trim())
    .map((c2) => ({
      id: newId(),
      name: (c2.name ?? "").trim().slice(0, 200),
      issuer: (c2.issuer ?? "").trim().slice(0, 200),
      issuedOn: parseLegacyMonth(c2.date ?? ""),
      url: "",
    }));

  doc.languages = (data.languages ?? [])
    .filter((l) => (l.language ?? "").trim())
    .map((l) => ({ name: (l.language ?? "").trim().slice(0, 60), level: (l.proficiency ?? "").trim().slice(0, 60) }));

  return doc;
}
