import { describe, expect, it } from "vitest";
import { classifyMatch, yearsOfExperience } from "@/lib/match/classify";
import { extractedJdSchema, type ExtractedJd } from "@/lib/match/types";
import { riya, SKILL } from "./fixtures/profile";

const NOW = new Date("2026-11-02T00:00:00Z");

const jd: ExtractedJd = {
  title: "QA Automation Engineer II",
  company: "Kitebird Payments",
  location: "Bengaluru",
  remote: false,
  applyEmail: null,
  applyUrl: null,
  language: "en",
  requirements: [
    { id: "q1", text: "Selenium WebDriver with Python", kind: "skill", years: null, language: null, mustHave: true },
    { id: "q2", text: "REST API testing (Postman)", kind: "skill", years: null, language: null, mustHave: true },
    { id: "q3", text: "Payments domain", kind: "other", years: null, language: null, mustHave: false },
    { id: "q4", text: "3+ years in test automation", kind: "years", years: 3, language: null, mustHave: true },
    { id: "q5", text: "Fluent Hindi", kind: "language", years: null, language: "Hindi", mustHave: false },
    { id: "q6", text: "Kotlin", kind: "skill", years: null, language: null, mustHave: false },
  ],
};

describe("yearsOfExperience", () => {
  it("adds roles and runs an open role to today", () => {
    // Oct 2024 to Mar 2025 (6 months) + Apr 2025 to Nov 2026 (20 months) = 26 months
    expect(yearsOfExperience(riya(), NOW)).toBe(2.2);
  });

  it("merges overlapping roles instead of double counting", () => {
    const doc = riya();
    doc.experiences[1]!.startDate = "2025-01";
    doc.experiences[1]!.endDate = "2025-06"; // overlaps Northwind from Apr 2025
    // Jan 2025 to Nov 2026 = 23 months
    expect(yearsOfExperience(doc, NOW)).toBe(1.9);
  });

  it("ignores roles without a start date", () => {
    const doc = riya();
    doc.experiences.forEach((e) => (e.startDate = ""));
    expect(yearsOfExperience(doc, NOW)).toBe(0);
  });
});

describe("classifyMatch", () => {
  const mapping = {
    mappings: [
      { requirementId: "q1", skillName: "Selenium WebDriver" },
      { requirementId: "q2", skillName: "postman" },
      { requirementId: "q3", skillName: null },
      { requirementId: "q6", skillName: "Kotlin" }, // model invents a skill: must not count
    ],
  };
  const result = classifyMatch(jd, mapping, riya(), NOW);
  const by = (id: string) => result.items.find((i) => i.requirementId === id)!;

  it("covered = skill linked to a role or project, with sources", () => {
    expect(by("q1")).toMatchObject({ state: "covered", skillId: SKILL.selenium, sources: ["R1"] });
  });

  it("partial = skill listed but not linked", () => {
    expect(by("q2")).toMatchObject({ state: "partial", skillId: SKILL.postman });
  });

  it("gap when the model maps nothing", () => {
    expect(by("q3").state).toBe("gap");
  });

  it("gap when the model names a skill that isn't in the profile", () => {
    expect(by("q6")).toMatchObject({ state: "gap", skillId: null });
  });

  it("years are computed from dates, not taken from the model", () => {
    expect(by("q4")).toMatchObject({ state: "partial" }); // 2.2 vs 3 required
    expect(by("q4").note).toContain("2.2 years");
  });

  it("languages come from the profile", () => {
    expect(by("q5").state).toBe("covered");
  });

  it("counts add up", () => {
    expect(result.counts).toEqual({ covered: 2, partial: 2, gap: 2 });
  });
});

describe("language requirements", () => {
  const langJd = (text: string, language: string | null): ExtractedJd => ({
    ...jd,
    requirements: [{ id: "q1", text, kind: "language", years: null, language, mustHave: true }],
  });
  const state = (j: ExtractedJd, names: string[]) =>
    classifyMatch(j, { mappings: [] }, { ...riya(), languages: names.map((name) => ({ name, level: "" })) }, NOW).items[0]!.state;

  it("matches whole words only, so a code like 'hi' never matches Chinese", () => {
    expect(state(langJd("hi", "hi"), ["Chinese"])).toBe("gap");
    expect(state(langJd("hi", "hi"), ["Hindi"])).toBe("covered");
  });

  it("matches one of several languages named in the wording", () => {
    expect(state(langJd("Hindi or Kannada", null), ["Kannada"])).toBe("covered");
    expect(state(langJd("Hindi or Kannada", null), ["Tamil"])).toBe("gap");
  });
});

describe("requirement parsing", () => {
  it("fills missing wording and turns language codes into names", () => {
    const parsed = extractedJdSchema.parse({
      requirements: [
        { id: "q1", kind: "language", language: "kn", mustHave: false },
        { id: "q2", kind: "years", years: 4 },
      ],
    });
    expect(parsed.requirements[0]).toMatchObject({ text: "Kannada", language: "Kannada" });
    expect(parsed.requirements[1]).toMatchObject({ text: "4+ years of experience", years: 4 });
  });

  it("still rejects a skill with no wording at all", () => {
    expect(extractedJdSchema.safeParse({ requirements: [{ id: "q1", kind: "skill" }] }).success).toBe(false);
  });
});
