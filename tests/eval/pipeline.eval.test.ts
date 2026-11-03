// AI eval for the steps before tailoring: read a job post, map skills, read a resume.
// Real model, real prompts. Opt-in: EVAL=1 (see tailor.eval.test.ts).

import { describe, expect, it } from "vitest";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createOpenRouterProvider } from "@/lib/ai/providers/openrouter";
import { runTask, type Ledger } from "@/lib/ai/run-task";
import { EXTRACT_JD, extractPrompt, IMPORT_RESUME, importResumePrompt, MATCH, matchPrompt } from "@/lib/ai/tasks";
import type { LlmProvider } from "@/lib/ai/types";
import { importToProfile } from "@/lib/profile/from-import";
import { riya } from "../unit/fixtures/profile";

const enabled = process.env.EVAL === "1";

function providers(): LlmProvider[] {
  const out: LlmProvider[] = [];
  const e = process.env;
  if (e.GEMINI_API_KEY && e.GEMINI_MODEL_CHEAP && e.GEMINI_MODEL_STRONG)
    out.push(createGeminiProvider({ apiKey: e.GEMINI_API_KEY, models: { cheap: e.GEMINI_MODEL_CHEAP, strong: e.GEMINI_MODEL_STRONG } }));
  if (e.OPENROUTER_API_KEY && e.OPENROUTER_MODEL_CHEAP && e.OPENROUTER_MODEL_STRONG)
    out.push(createOpenRouterProvider({ apiKey: e.OPENROUTER_API_KEY, models: { cheap: e.OPENROUTER_MODEL_CHEAP, strong: e.OPENROUTER_MODEL_STRONG } }));
  return out;
}

const ledger: Ledger = { reserve: async () => "eval", commit: async () => {}, refund: async () => {} };

async function run<T>(input: Parameters<typeof runTask<T>>[1]) {
  const events: unknown[] = [];
  return runTask({ ledger, providers: providers(), log: (e) => events.push(e) }, input).catch((err: Error) => {
    throw new Error(`${err.message}\nrunner events: ${JSON.stringify(events)}`);
  });
}

// A long, realistic Indian job post with more asks than most.
const LONG_JD = `Senior QA Automation Engineer - Kitebird Payments (Bengaluru, hybrid)
About us: Kitebird builds UPI and card rails for 4,000 merchants.
What you'll do: own the regression suite, mentor two juniors, work with product on release quality.
Must have:
- 4+ years in test automation
- Selenium WebDriver with Python
- Pytest and fixtures
- REST API testing with Postman or requests
- SQL (PostgreSQL)
- CI pipelines in GitHub Actions or Jenkins
- Git
- Agile / Scrum
Nice to have:
- Appium for Android
- Performance testing with JMeter or k6
- Docker
- Payments or fintech domain
- Hindi or Kannada
- ISTQB Foundation
Apply: careers@kitebird.example or https://kitebird.example/jobs/qa-42`;

const RESUME_TEXT = `Riya Sharma
QA Automation Engineer | Bengaluru | +91 98450 00000 | riya@example.com
linkedin.com/in/riya-example

Summary
QA engineer with 4 years of manual and automated testing across logistics and edtech.

Experience
QA Automation Engineer, Northwind Logistics - Bengaluru            Mar 2022 – Present
• Built a Selenium WebDriver and Python suite on the Page Object Model covering 320 regression cases.
• Cut regression time from 2 days to 5 hours by running tests in parallel in GitHub Actions.
QA Engineer, Learnly Edtech - Pune                                  07/2020 - 02/2022
• Wrote 600 manual test cases for the parent app and logged defects in Jira.
• Automated smoke tests with Robot Framework.

Projects
API contract checker - a Pytest plugin that compares OpenAPI specs between releases.

Education
B.E. Computer Science, PES University, 2016 – 2020, CGPA 8.1

Skills: Selenium, Python, Pytest, Robot Framework, Postman, SQL, Git, Jira, GitHub Actions
Languages: English (fluent), Hindi (native), Kannada (conversational)
Certifications: ISTQB Foundation Level, 2021`;

describe.skipIf(!enabled)("pipeline evaluation, real model", () => {
  it("reads a long job post into requirements without dropping asks", { timeout: 120_000 }, async () => {
    const out = await run({ userId: "eval", task: EXTRACT_JD, ...extractPrompt(LONG_JD) });
    const jd = out.data;
    expect(jd.company.toLowerCase()).toContain("kitebird");
    expect(jd.requirements.length).toBeGreaterThanOrEqual(10);
    const years = jd.requirements.find((r) => r.kind === "years");
    expect(years?.years).toBe(4);
    const texts = jd.requirements.map((r) => r.text.toLowerCase()).join(" | ");
    expect(texts).toMatch(/selenium/);
    expect(texts).toMatch(/appium/);
    expect(jd.requirements.find((r) => /appium/i.test(r.text))?.mustHave).toBe(false);
    expect(jd.applyEmail).toBe("careers@kitebird.example");
  });

  it("maps requirements only to skills that exist in the profile", { timeout: 120_000 }, async () => {
    const extracted = await run({ userId: "eval", task: EXTRACT_JD, ...extractPrompt(LONG_JD) });
    const doc = riya();
    const out = await run({ userId: "eval", task: MATCH, ...matchPrompt(extracted.data, doc) });
    const names = new Set(doc.skills.map((s) => s.name.toLowerCase()));
    for (const m of out.data.mappings) {
      if (m.skillName) expect(names.has(m.skillName.toLowerCase()), `${m.skillName} is not a profile skill`).toBe(true);
    }
  });

  it("reads a resume with mixed date styles into a profile", { timeout: 120_000 }, async () => {
    const out = await run({ userId: "eval", task: IMPORT_RESUME, ...importResumePrompt(RESUME_TEXT) });
    const doc = importToProfile(out.data, "riya@example.com");
    expect(doc.basics.name).toBe("Riya Sharma");
    expect(doc.experiences).toHaveLength(2);
    const [first, second] = doc.experiences;
    expect(first!.startDate).toBe("2022-03");
    expect(first!.endDate).toBe("");
    expect(second!.startDate).toBe("2020-07");
    expect(second!.endDate).toBe("2022-02");
    expect(first!.bullets.map((b) => b.text).join(" ")).toContain("320");
    expect(doc.skills.map((s) => s.name)).toContain("Selenium");
    expect(doc.certifications[0]?.name).toMatch(/ISTQB/);
  });
});
