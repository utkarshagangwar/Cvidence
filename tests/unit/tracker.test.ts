import { describe, expect, it } from "vitest";
import { funnelFrom, istWeekStart, weeklyCounts } from "@/lib/dashboard";
import { letterText, letterUnits, mailtoHref, replaceLetterUnit, safeRecipient, sanitizeLetter } from "@/lib/letters/sanitize";
import { coverModelSchema, emailModelSchema, refineModelSchema } from "@/lib/letters/types";
import { factGuard } from "@/lib/tailor/fact-guard";
import { riya } from "./fixtures/profile";

describe("sanitizeLetter", () => {
  const doc = riya();

  it("keeps only real source tags, adds the sign-off from the profile and drops empty paragraphs", () => {
    const out = sanitizeLetter(
      "cover",
      { greeting: "", paragraphs: [{ text: "I built a Selenium suite.", sources: ["r1", "R9", "P1"] }, { text: "   ", sources: [] }, { text: "Thanks for reading.", sources: [] }] },
      doc,
      null,
    );
    expect(out.greeting.text).toBe("Dear Hiring Team,");
    expect(out.paragraphs.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(out.paragraphs[0]!.src).toEqual(["R1", "P1"]);
    expect(out.signoff).toBe(`Regards,\n${doc.basics.name}`);
    expect(out.subject).toBeNull();
  });

  it("uses only a valid apply address as the email recipient", () => {
    const email = sanitizeLetter("email", { subject: "QA role", greeting: "Hi,", paragraphs: [{ text: "Hello.", sources: [] }] }, doc, "jobs@kitebird.example");
    expect(email.to).toBe("jobs@kitebird.example");
    expect(safeRecipient("bad address")).toBeNull();
    expect(safeRecipient("a@b.c?cc=evil@x.y")).toBeNull();
    expect(safeRecipient('x"@y.com')).toBeNull();
  });

  it("caps paragraphs per kind", () => {
    const many = Array.from({ length: 4 }, (_, i) => ({ text: `Para ${i}.`, sources: [] }));
    expect(sanitizeLetter("email", { subject: "S", greeting: "Hi", paragraphs: many }, doc, null).paragraphs).toHaveLength(3);
  });
});

describe("letter helpers", () => {
  const doc = riya();
  const email = sanitizeLetter("email", { subject: "QA Automation role", greeting: "Hi Priya,", paragraphs: [{ text: "Line one & two.", sources: [] }] }, doc, "hr@acme.example");

  it("builds a mailto link with encoded subject and body", () => {
    const href = mailtoHref(email)!;
    expect(href.startsWith("mailto:hr@acme.example?")).toBe(true);
    const q = new URLSearchParams(href.split("?")[1]);
    expect(q.get("subject")).toBe("QA Automation role");
    expect(q.get("body")).toBe(letterText(email));
    expect(href).not.toContain("+");
  });

  it("edits one unit and marks it as edited", () => {
    const next = replaceLetterUnit(email, "p1", "New text.");
    expect(next.paragraphs[0]).toMatchObject({ text: "New text.", edited: true });
    expect(letterUnits(next).map((u) => u.id)).toEqual(["subject", "greeting", "p1"]);
  });

  it("flags a name in the greeting that isn't in the profile or job post", () => {
    const flags = factGuard(letterUnits(email), doc, "QA role at Acme");
    expect(flags.some((f) => f.unitId === "greeting" && f.token === "Priya")).toBe(true);
  });
});

describe("letter reply shapes", () => {
  it("accepts plain-string paragraphs", () => {
    expect(coverModelSchema.parse({ paragraphs: ["One.", "Two."] }).paragraphs[0]).toEqual({ text: "One.", sources: [] });
  });
  it("needs a subject for email and a reply for refine", () => {
    expect(emailModelSchema.safeParse({ paragraphs: ["x"] }).success).toBe(false);
    expect(refineModelSchema.safeParse({ changes: [] }).success).toBe(false);
  });
});

describe("dashboard maths", () => {
  it("starts weeks on Monday in IST, even late on a Sunday UTC", () => {
    // Sunday 20:00 UTC = Monday 01:30 IST, so it belongs to the new week.
    const sundayLateUtc = Date.UTC(2026, 10, 1, 20, 0);
    expect(new Date(istWeekStart(sundayLateUtc)).toISOString()).toBe("2026-11-01T18:30:00.000Z");
  });

  it("counts events into the last N weeks and ignores older ones", () => {
    const now = Date.UTC(2026, 10, 4, 6);
    const week = 7 * 86_400_000;
    const out = weeklyCounts([now, now - 1000, now - week, now - 20 * week], 8, now);
    expect(out).toHaveLength(8);
    expect(out.at(-1)!.count).toBe(2);
    expect(out.at(-2)!.count).toBe(1);
    expect(out.reduce((n, w) => n + w.count, 0)).toBe(3);
  });

  it("counts an application as reaching every stage up to its best one", () => {
    const apps = [
      { id: "a", status: "draft" },
      { id: "b", status: "applied" },
      { id: "c", status: "closed" }, // was at interview before closing
      { id: "d", status: "offer" },
    ];
    const events = [{ application_id: "c", to_status: "interview" }, { application_id: "c", to_status: "closed" }, { application_id: "zz", to_status: "offer" }];
    expect(funnelFrom(apps, events)).toEqual({ reached: { draft: 4, applied: 3, interview: 2, offer: 1 }, closed: 1 });
  });
});
