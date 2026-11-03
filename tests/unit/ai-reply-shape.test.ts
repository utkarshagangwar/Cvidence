import { describe, expect, it } from "vitest";
import { dropNulls } from "@/lib/ai/json-repair";
import { extractedJdSchema, matchMappingSchema } from "@/lib/match/types";
import { importModelSchema } from "@/lib/ai/tasks";

// Replies shaped like the ones models really send for a posting with no title,
// company or location. Each used to fail the whole task ("wasn't in the shape").
const parse = (raw: unknown) => extractedJdSchema.safeParse(dropNulls(raw));

describe("AI replies with empty fields", () => {
  it("accepts null title, company and location from the extract step", () => {
    const r = parse({
      title: null, company: null, location: null, remote: null, applyEmail: null, applyUrl: null, language: null,
      requirements: [{ id: "q1", text: "Selenium", kind: "skill", years: null, language: null, mustHave: true }],
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data).toMatchObject({ title: "", company: "", location: "", remote: null, language: "en" });
  });

  it("fixes loose requirement fields instead of failing", () => {
    const r = parse({
      requirements: [
        { id: "q1", text: "3+ years in QA", kind: "experience", years: "3+", mustHave: "true" },
        { id: "q2", text: "JIRA", kind: "tool" },
        { id: "q3", text: "Exposure to performance testing", kind: "skill", mustHave: "nice to have" },
      ],
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.requirements.map((q) => [q.kind, q.years, q.mustHave])).toEqual([
      ["years", 3, true],
      ["skill", null, true],
      ["skill", null, false],
    ]);
  });

  it("drops a broken requirement and stops at 30", () => {
    const many = Array.from({ length: 36 }, (_, i) => ({ id: `q${i + 1}`, text: `Requirement ${i + 1}`, kind: "other" }));
    many[2] = { id: "bad", text: "", kind: "other" };
    const r = parse({ requirements: many });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.requirements).toHaveLength(30);
    expect(r.data.requirements.some((q) => q.id === "bad")).toBe(false);
  });

  it("accepts null in other task replies too", () => {
    expect(matchMappingSchema.safeParse(dropNulls({ mappings: [{ requirementId: "q1", skillName: null }] })).success).toBe(true);
    const imp = importModelSchema.safeParse(dropNulls({ name: "Riya", phone: null, links: null, experiences: [{ company: "X", title: "QA", location: null, bullets: [null, "Built suites"] }] }));
    expect(imp.success).toBe(true);
    expect(imp.success && imp.data.experiences[0]!.bullets).toEqual(["Built suites"]);
  });
});
