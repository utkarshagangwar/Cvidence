import { describe, expect, it } from "vitest";
import { factGuard } from "@/lib/tailor/fact-guard";
import { allUnits, pastTenseFromSource, replaceUnit, sanitizeTailored } from "@/lib/tailor/sanitize";
import { tailorModelSchema } from "@/lib/tailor/types";
import { riya, SKILL } from "./fixtures/profile";

const JD = "We need Selenium, Postman and 3+ years. Payments experience is a plus. Bengaluru, hybrid.";

describe("sanitizeTailored", () => {
  const doc = riya();

  it("drops unknown role ids and keeps original bullets for skipped roles", () => {
    const out = sanitizeTailored(
      {
        summary: "QA engineer focused on Selenium and Python.",
        roles: [
          { id: "R1", bullets: [{ text: "Built a Selenium and Python suite for shipment tracking." }] },
          { id: "R9", bullets: [{ text: "Led QA at a company that isn't in the profile." }] },
        ],
        projects: [],
        skills: [],
      },
      doc,
    );
    expect(out.roles.map((r) => r.tag)).toEqual(["R1", "R2"]);
    expect(out.roles[0]!.bullets[0]!.text).toContain("shipment tracking");
    expect(out.roles[1]!.bullets[0]!.text).toBe(doc.experiences[1]!.bullets[0]!.text);
    expect(JSON.stringify(out)).not.toContain("isn't in the profile");
  });

  it("rejects skills that aren't in the profile and keeps the model's order", () => {
    const out = sanitizeTailored({ summary: "", roles: [], projects: [], skills: ["Python", "Kubernetes", "selenium webdriver"] }, doc);
    expect(out.skillIds).toEqual([SKILL.python, SKILL.selenium]);
  });

  it("falls back to the profile summary and all skills when the model leaves them empty", () => {
    const out = sanitizeTailored({ summary: "", roles: [], projects: [], skills: [] }, doc);
    expect(out.summary.text).toBe(doc.basics.summary);
    expect(out.skillIds).toHaveLength(doc.skills.length);
  });

  it("uses project descriptions when the model returns no projects", () => {
    const out = sanitizeTailored({ summary: "", roles: [], projects: [], skills: [] }, doc);
    expect(out.projects.map((p) => p.tag)).toEqual(["P1", "P2"]);
    expect(out.projects[0]!.bullets[0]!.src).toEqual(["P1"]);
  });

  it("caps bullets per role", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ text: `Ran test pass ${i}.` }));
    const out = sanitizeTailored({ summary: "", roles: [{ id: "R1", bullets: many }], projects: [], skills: [] }, doc);
    expect(out.roles[0]!.bullets).toHaveLength(6);
  });

  it("replaceUnit edits one line and marks it edited", () => {
    const base = sanitizeTailored({ summary: "S", roles: [], projects: [], skills: [] }, doc);
    const next = replaceUnit(base, "R1.2", "New text");
    expect(allUnits(next).find((u) => u.id === "R1.2")).toMatchObject({ text: "New text", edited: true });
    expect(allUnits(base).find((u) => u.id === "R1.2")!.text).not.toBe("New text");
  });
});

describe("factGuard", () => {
  const doc = riya();
  const flagsFor = (text: string) => factGuard([{ id: "u1", text, src: [] }], doc, JD);

  it("flags a percentage that is in neither the profile nor the JD", () => {
    expect(flagsFor("Cut regression cycle time by 40% by running in parallel.")).toEqual([
      { unitId: "u1", token: "40%", kind: "number" },
    ]);
  });

  it("does not flag numbers that are in the profile or JD", () => {
    expect(flagsFor("Wrote keyword libraries reused by 3 product teams and a 30-test smoke pack.")).toEqual([]);
  });

  it("flags an employer name that isn't in the profile", () => {
    expect(flagsFor("Built suites for Razorpay checkout flows.")).toEqual([{ unitId: "u1", token: "Razorpay", kind: "name" }]);
  });

  it("allows names from the profile and the JD", () => {
    expect(flagsFor("Built Selenium suites at Northwind Logistics, ready for Payments work in Bengaluru.")).toEqual([]);
  });

  it("accepts known names with a -based style suffix, but not unknown ones", () => {
    expect(flagsFor("Wrote a suite in a Python-based stack.")).toEqual([]);
    expect(flagsFor("Wrote a suite in a Kotlin-based stack.")).toEqual([{ unitId: "u1", token: "Kotlin-based", kind: "name" }]);
  });

  it("doesn't flag the app's own greeting", () => {
    expect(flagsFor("Dear Hiring Team,")).toEqual([]);
  });

  it("flags credential words the profile doesn't support", () => {
    expect(flagsFor("ISTQB certified tester.")).toEqual(
      expect.arrayContaining([{ unitId: "u1", token: "certified", kind: "credential" }]),
    );
  });

  it("ignores the first word of each sentence", () => {
    expect(flagsFor("Automated checks. Reduced flaky runs.")).toEqual([]);
  });
});

describe("tailor reply shape", () => {
  it("accepts bullets as plain strings or objects, and ignores extra keys", () => {
    const parsed = tailorModelSchema.parse({
      roles: [{ id: "R1", bullets: ["Built a suite.", { text: "Ran smoke tests.", from: ["a very long made-up source label"] }] }],
    });
    expect(parsed.roles[0]!.bullets).toEqual([{ text: "Built a suite." }, { text: "Ran smoke tests." }]);
  });
});

describe("pastTenseFromSource", () => {
  const src = ["Executed manual test cases.", "Carried out audits.", "Planned releases.", "Built a suite."];
  it("restores the user's own past-tense verb", () => {
    expect(pastTenseFromSource("Execute manual and UI tests.", src)).toBe("Executed manual and UI tests.");
    expect(pastTenseFromSource("Carry out audits.", src)).toBe("Carried out audits.");
    expect(pastTenseFromSource("Plan releases.", src)).toBe("Planned releases.");
  });
  it("leaves lines alone when there is no matching verb in the profile", () => {
    expect(pastTenseFromSource("Build a suite.", src)).toBe("Build a suite.");
    expect(pastTenseFromSource("Automated checks.", src)).toBe("Automated checks.");
  });
  it("is applied to finished roles by sanitizeTailored", () => {
    const doc = riya();
    const past = doc.experiences.find((e) => e.endDate)!;
    const tag = `R${doc.experiences.indexOf(past) + 1}`;
    const out = sanitizeTailored({ summary: "", roles: [{ id: tag, bullets: [{ text: "Execute manual functional and UI test cases." }] }], projects: [], skills: [] }, doc);
    expect(out.roles.find((r) => r.tag === tag)!.bullets[0]!.text).toMatch(/^Executed /);
  });
});
