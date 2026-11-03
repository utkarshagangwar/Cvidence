import { describe, expect, it } from "vitest";
import { scoreProfile } from "@/lib/ats/score";
import { legacyToProfile, parseLegacyMonth, parseLegacyRange } from "@/lib/profile/legacy-import";
import { profileForModel } from "@/lib/ai/tasks";
import { emptyProfile, formatYearRange, profileDocSchema } from "@/lib/profile/schema";
import { riya } from "./fixtures/profile";

describe("legacy import", () => {
  it.each([
    ["Jan 2020", "2020-01"],
    ["September 2021", "2021-09"],
    ["Sept 2021", "2021-09"],
    ["03/2022", "2022-03"],
    ["2023-11", "2023-11"],
    ["2019", "2019-01"],
    ["sometime", ""],
    ["13/2022", ""],
  ])("parses %j as %j", (raw, out) => {
    expect(parseLegacyMonth(raw)).toBe(out);
  });

  it("parses ranges with Present", () => {
    expect(parseLegacyRange("Apr 2025 - Present")).toEqual({ start: "2025-04", end: "" });
    expect(parseLegacyRange("Oct 2024 – Mar 2025")).toEqual({ start: "2024-10", end: "2025-03" });
  });

  it("maps the old builder's data to a valid profile", () => {
    const doc = legacyToProfile(
      {
        contact: { name: "Riya Sharma", email: "old@example.com", phone: "98450 12345", location: "Bengaluru", linkedin: "linkedin.com/in/riya" },
        summary: "QA engineer.",
        targetRole: "QA Automation Engineer",
        experience: [{ title: "QA Engineer", company: "Northwind", dates: "Apr 2025 - Present", bullets: "• Built a suite\n- Wrote libraries\n\n" }],
        education: [{ degree: "B.E.", school: "RVCE", dates: "2020 - 2024" }],
        skills: { technical: "Python, Selenium", tools: "Jira, python", soft: "" },
        projects: [{ name: "CI pipeline", tech: "GitHub Actions, Python", description: "Ran suites on PRs." }],
        certifications: [{ name: "ISTQB Foundation", issuer: "ISTQB", date: "Jun 2024" }],
        languages: [{ language: "Hindi", proficiency: "Native" }],
      },
      "riya@example.com",
    );
    expect(profileDocSchema.safeParse(doc).success).toBe(true);
    expect(doc.basics.email).toBe("riya@example.com");
    expect(doc.experiences[0]!.bullets.map((b) => b.text)).toEqual(["Built a suite", "Wrote libraries"]);
    expect(doc.skills.map((s) => s.name)).toEqual(["Python", "Selenium", "Jira", "GitHub Actions"]);
    const python = doc.skills.find((s) => s.name === "Python")!.id;
    expect(doc.projects[0]!.skillIds).toContain(python);
    expect(doc.certifications[0]!.issuedOn).toBe("2024-06");
  });

  it("survives garbage input", () => {
    expect(profileDocSchema.safeParse(legacyToProfile("nope")).success).toBe(true);
    expect(profileDocSchema.safeParse(legacyToProfile({ experience: [{}], skills: null })).success).toBe(true);
  });
});

describe("profile schema", () => {
  it("rejects a link to a skill that doesn't exist", () => {
    const doc = riya();
    doc.experiences[0]!.skillIds.push("00000000-0000-4000-8000-000000000999");
    expect(profileDocSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects duplicate skill names", () => {
    const doc = riya();
    doc.skills.push({ id: "00000000-0000-4000-8000-000000000998", name: "python", group: "" });
    expect(profileDocSchema.safeParse(doc).success).toBe(false);
  });
});

describe("ATS score", () => {
  it("scores an empty profile low and lists what to fix", () => {
    const r = scoreProfile(emptyProfile());
    expect(r.score).toBeLessThan(30);
    expect(r.sections.find((s) => s.key === "experience")!.checks[0]!.passed).toBe(false);
  });

  it("scores a filled profile well", () => {
    const r = scoreProfile(riya());
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.sections.find((s) => s.key === "contact")!.score).toBe(100);
  });

  it("flags first-person words in the summary", () => {
    const doc = riya();
    doc.basics.summary = "I am a QA engineer and my focus is automation with Selenium, Python and Robot Framework across products.";
    const summary = scoreProfile(doc).sections.find((s) => s.key === "summary")!;
    expect(summary.checks.find((c) => c.message.includes("first-person"))!.passed).toBe(false);
  });
});

describe("formatYearRange", () => {
  it("shows years only, so year-only imports never gain a made-up month", () => {
    expect(formatYearRange("2016-01", "2020-01")).toBe("2016 - 2020");
    expect(formatYearRange("2021-03", "")).toBe("2021");
    expect(formatYearRange("2021-03", "2021-09")).toBe("2021");
    expect(formatYearRange("", "")).toBe("");
  });
});

describe("profileForModel", () => {
  it("tells the model each role's tense from its end date", () => {
    const roles = profileForModel(riya()).roles;
    expect(roles.map((r) => r.tense)).toEqual(riya().experiences.map((e) => (e.endDate ? "past" : "present")));
    expect(roles.some((r) => r.tense === "past")).toBe(true);
  });
});
