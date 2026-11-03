// Credit prices and the IST day boundary. Pure functions: safe on client and server.

export const TASK_IDS = [
  "extract",
  "match",
  "tailor_resume",
  "cover_letter",
  "outreach_email",
  "refine",
  "screen_batch",
  "import_resume",
] as const;

export type TaskId = (typeof TASK_IDS)[number];

export const TASK_CREDITS: Readonly<Record<TaskId, number>> = {
  extract: 1,
  match: 1,
  tailor_resume: 3,
  cover_letter: 2,
  outreach_email: 1,
  refine: 1,
  screen_batch: 1,
  import_resume: 2,
};

export const DEFAULT_DAILY_CREDITS = 25;

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // India has no daylight saving.

/** Calendar day in India for a given instant, as YYYY-MM-DD. Matches public.ist_today(). */
export function istDay(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The next midnight IST, as a UTC instant. */
export function nextIstMidnight(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  const nextShiftedMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1,
  );
  return new Date(nextShiftedMidnight - IST_OFFSET_MS);
}

export function creditsLeft(used: number, dailyLimit: number = DEFAULT_DAILY_CREDITS): number {
  return Math.max(0, dailyLimit - Math.max(0, used));
}
