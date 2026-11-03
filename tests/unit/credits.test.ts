import { describe, expect, it } from "vitest";
import { creditsLeft, istDay, nextIstMidnight, TASK_CREDITS } from "@/lib/quota/credits";

describe("istDay", () => {
  it("is still the previous day just before 00:00 IST (18:29:59 UTC)", () => {
    expect(istDay(new Date("2026-11-01T18:29:59Z"))).toBe("2026-11-01");
  });

  it("rolls over exactly at 00:00 IST (18:30 UTC)", () => {
    expect(istDay(new Date("2026-11-01T18:30:00Z"))).toBe("2026-11-02");
  });

  it("handles month and year ends", () => {
    expect(istDay(new Date("2026-12-31T18:30:00Z"))).toBe("2027-01-01");
  });
});

describe("nextIstMidnight", () => {
  it("is 18:30 UTC on the same UTC day when it's morning in India", () => {
    expect(nextIstMidnight(new Date("2026-11-02T03:00:00Z")).toISOString()).toBe("2026-11-02T18:30:00.000Z");
  });

  it("moves to the next day once midnight IST has passed", () => {
    expect(nextIstMidnight(new Date("2026-11-02T18:30:00Z")).toISOString()).toBe("2026-11-03T18:30:00.000Z");
  });
});

describe("credits", () => {
  it("matches the plan's price list", () => {
    expect(TASK_CREDITS).toEqual({
      extract: 1,
      match: 1,
      tailor_resume: 3,
      cover_letter: 2,
      outreach_email: 1,
      refine: 1,
      screen_batch: 1,
      import_resume: 2,
    });
  });

  it("one full application costs 9 credits, so 25 a day covers about 3", () => {
    const full = TASK_CREDITS.extract + TASK_CREDITS.match + TASK_CREDITS.tailor_resume + TASK_CREDITS.cover_letter + TASK_CREDITS.outreach_email + TASK_CREDITS.refine;
    expect(full).toBe(9);
    expect(Math.floor(25 / full)).toBe(2);
    expect(Math.floor(25 / (full - TASK_CREDITS.refine))).toBe(3);
  });

  it.each([
    [0, 25, 25],
    [14, 25, 11],
    [25, 25, 0],
    [30, 25, 0],
    [-5, 25, 25],
  ])("used %i of %i leaves %i", (used, limit, left) => {
    expect(creditsLeft(used, limit)).toBe(left);
  });
});
