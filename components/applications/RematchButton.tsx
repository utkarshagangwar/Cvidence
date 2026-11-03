"use client";

import { useState, useTransition } from "react";
import { rematchAction } from "@/app/(app)/applications/actions";

export function RematchButton({ applicationId }: { applicationId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        className="btn btn-secondary press self-start"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await rematchAction(applicationId);
            if (r.status === "error") setError(r.message);
          })
        }
      >
        {pending ? "Matching…" : "Match again · 1 credit"}
      </button>
      <span className="text-[12px] text-subtle">Use after you update your profile.</span>
      {error && <span role="alert" className="text-[13px] text-gap-text">{error}</span>}
    </div>
  );
}
