// ATS readiness score for the master profile, ported from the old builder's
// calculateATSScore (legacy/index.html) as pure, deterministic checks.

import type { ProfileDoc } from "@/lib/profile/schema";

export interface AtsCheck {
  passed: boolean;
  message: string;
  /** Warnings don't lower the score; they're advice. */
  warning?: boolean;
}

export interface AtsSection {
  key: "contact" | "summary" | "experience" | "skills" | "education" | "projects";
  name: string;
  checks: AtsCheck[];
  score: number;
}

export interface AtsResult {
  score: number;
  sections: AtsSection[];
}

const ACTION_VERBS = new Set(
  (
    "achieved analysed analyzed automated built championed coached collaborated configured created cut debugged decreased " +
    "defined delivered deployed designed developed drove enabled engineered established executed expanded generated grew " +
    "handled implemented improved increased integrated introduced launched led maintained managed mentored migrated " +
    "monitored optimised optimized organised organized owned piloted planned produced profiled raised reduced refactored " +
    "resolved reviewed rewrote ran scaled set shipped simplified spearheaded standardised standardized streamlined " +
    "supported tested trained triaged upgraded validated verified wrote"
  ).split(" "),
);

const PRONOUNS = /\b(i|me|my|mine|we|our)\b/i;
const FILLER = /\b(results[- ]driven|dynamic professional|team player|go[- ]getter|synergy|hard[- ]working|detail[- ]oriented)\b/i;

const words = (s: string) => s.split(/\s+/).filter(Boolean);

function sectionScore(checks: AtsCheck[]) {
  const scored = checks.filter((c) => !c.warning);
  if (scored.length === 0) return 100;
  return Math.round((scored.filter((c) => c.passed).length / scored.length) * 100);
}

export function scoreProfile(doc: ProfileDoc): AtsResult {
  const b = doc.basics;
  const sections: AtsSection[] = [];

  const contact: AtsCheck[] = [
    { passed: b.name.trim().length > 2, message: b.name.trim().length > 2 ? "Full name is present" : "Add your full name" },
    { passed: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email), message: "A valid email address is on file" },
    {
      passed: b.phone.replace(/\D/g, "").length >= 10,
      message: b.phone.replace(/\D/g, "").length >= 10 ? "Phone number is present" : "Add a phone number with at least 10 digits",
    },
    { passed: b.city.trim().length > 0, message: b.city ? "City is present" : "Add your city: many ATS filters by location" },
    {
      passed: b.links.some((l) => /linkedin\.com/i.test(l.url)),
      message: b.links.some((l) => /linkedin\.com/i.test(l.url)) ? "LinkedIn URL included" : "A LinkedIn URL is recommended",
      warning: true,
    },
  ];
  sections.push({ key: "contact", name: "Contact", checks: contact, score: sectionScore(contact) });

  const sw = words(b.summary).length;
  const summary: AtsCheck[] = [
    { passed: sw > 0, message: sw > 0 ? "Summary is present" : "Add a short summary" },
    { passed: sw >= 25 && sw <= 90, message: sw >= 25 && sw <= 90 ? `Summary length is good (${sw} words)` : `Aim for 25 to 90 words (now ${sw})` },
    { passed: sw > 0 && !PRONOUNS.test(b.summary), message: PRONOUNS.test(b.summary) ? "Drop first-person words (I, my, we)" : "No first-person words" },
    { passed: sw > 0 && !FILLER.test(b.summary), message: FILLER.test(b.summary) ? "Replace filler phrases like \"results-driven\"" : "No filler phrases" },
  ];
  sections.push({ key: "summary", name: "Summary", checks: summary, score: sectionScore(summary) });

  const bullets = doc.experiences.flatMap((e) => e.bullets.map((x) => x.text));
  const verbStart = bullets.filter((t) => ACTION_VERBS.has(words(t)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "")).length;
  const tooLong = bullets.filter((t) => words(t).length > 30).length;
  const withNumbers = bullets.filter((t) => /\d/.test(t)).length;
  const experience: AtsCheck[] = [
    { passed: doc.experiences.length > 0, message: doc.experiences.length ? `${doc.experiences.length} role(s) listed` : "Add at least one role" },
    {
      passed: doc.experiences.length > 0 && doc.experiences.every((e) => e.startDate),
      message: doc.experiences.every((e) => e.startDate) ? "Every role has a start date" : "Add start dates to every role (years of experience are worked out from them)",
    },
    {
      passed: doc.experiences.length > 0 && doc.experiences.every((e) => e.bullets.length >= 2),
      message: "Each role has at least two bullets",
    },
    {
      passed: bullets.length > 0 && verbStart / bullets.length >= 0.7,
      message: bullets.length ? `${verbStart} of ${bullets.length} bullets start with an action verb` : "Bullets should start with an action verb",
    },
    { passed: bullets.length > 0 && tooLong === 0, message: tooLong ? `${tooLong} bullet(s) are over 30 words` : "Bullets are a readable length" },
    {
      passed: withNumbers > 0,
      message: withNumbers ? `${withNumbers} bullet(s) include a real number` : "Add real numbers where you have them (team size, users, time saved)",
      warning: true,
    },
    {
      passed: bullets.length > 0 && !bullets.some((t) => PRONOUNS.test(t)),
      message: bullets.some((t) => PRONOUNS.test(t)) ? "Drop first-person words from bullets" : "No first-person words in bullets",
    },
  ];
  sections.push({ key: "experience", name: "Experience", checks: experience, score: sectionScore(experience) });

  const linked = new Set([...doc.experiences, ...doc.projects].flatMap((e) => e.skillIds));
  const skills: AtsCheck[] = [
    { passed: doc.skills.length >= 5, message: doc.skills.length >= 5 ? `${doc.skills.length} skills listed` : `List at least 5 skills (now ${doc.skills.length})` },
    {
      passed: doc.skills.length > 0 && linked.size / doc.skills.length >= 0.5,
      message: doc.skills.length
        ? `${linked.size} of ${doc.skills.length} skills are linked to a role or project`
        : "Link skills to the roles and projects where you used them",
    },
  ];
  sections.push({ key: "skills", name: "Skills", checks: skills, score: sectionScore(skills) });

  const education: AtsCheck[] = [
    { passed: doc.education.length > 0, message: doc.education.length ? "Education is listed" : "Add your education" },
    {
      passed: doc.education.length > 0 && doc.education.every((e) => e.degree),
      message: doc.education.every((e) => e.degree) ? "Degrees are named" : "Name the degree for each entry",
    },
  ];
  sections.push({ key: "education", name: "Education", checks: education, score: sectionScore(education) });

  const projects: AtsCheck[] = [
    {
      passed: doc.projects.length > 0,
      message: doc.projects.length ? `${doc.projects.length} project(s) listed` : "Projects help when your experience is short",
    },
  ];
  sections.push({ key: "projects", name: "Projects", checks: projects, score: sectionScore(projects) });

  const weights: Record<AtsSection["key"], number> = { contact: 15, summary: 15, experience: 35, skills: 20, education: 10, projects: 5 };
  const score = Math.round(sections.reduce((sum, s) => sum + s.score * weights[s.key], 0) / 100);
  return { score, sections };
}
