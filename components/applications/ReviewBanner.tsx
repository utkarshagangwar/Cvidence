"use client";

import { useState, useTransition } from "react";
import { markReviewedAction } from "@/app/(app)/applications/actions";

/** Shown on applications the daily agent drafted, until the person confirms they've checked it. */
export function ReviewBanner({ applicationId, score }: { applicationId: string; score: number | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-partial/40 bg-partial-bg px-4 py-3 text-[14px] text-partial-text">
      <span>
        Drafted by your daily agent{score !== null ? <> (fit <span className="num">{score}</span>)</> : null}. Check every line before you apply; nothing has been sent.
      </span>
      <span className="flex items-center gap-2">
        {error && <span className="text-[13px] text-gap-text">{error}</span>}
        <button
          type="button"
          className="btn btn-secondary press h-9 px-3 text-[13px]"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await markReviewedAction(applicationId);
              if (res.status === "error") setError(res.message);
            })
          }
        >
          {pending ? "Saving…" : "Mark as reviewed"}
        </button>
      </span>
    </div>
  );
}
