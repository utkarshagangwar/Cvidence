// Code has the last word on a screening score: the model can't talk a junior
// candidate into a staff role. Pure, so it's unit-tested.

import { seniorityOf } from "./prefilter";

export interface ScreenScore {
  score: number;
  reasons: string[];
  redFlags: string[];
}

const fmtYears = (y: number) => `${y} year${y === 1 ? "" : "s"}`;

export function applySeniorityRules(title: string, years: number, s: ScreenScore): ScreenScore {
  const levels = seniorityOf(title);
  let cap = 100;
  let flag: string | null = null;

  if (levels.some((l) => l === "director" || l === "vp") && years < 10) {
    cap = 25;
    flag = `Executive role; you have ${fmtYears(years)} of experience`;
  } else if (levels.some((l) => l === "staff" || l === "principal") && years < 7) {
    cap = 35;
    flag = `Staff or principal level; you have ${fmtYears(years)} of experience`;
  } else if (levels.some((l) => l === "senior" || l === "lead" || l === "manager") && years < 4) {
    cap = 45;
    flag = `Senior-level title; you have ${fmtYears(years)} of experience`;
  } else if (levels.includes("intern") && years >= 2) {
    cap = 40;
    flag = "Internship; you already have work experience";
  }

  if (s.score <= cap) return s;
  return { score: cap, reasons: s.reasons, redFlags: flag ? [flag, ...s.redFlags].slice(0, 3) : s.redFlags };
}
