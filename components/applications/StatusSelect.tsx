"use client";

import { useState, useTransition } from "react";
import { setStatusAction } from "@/app/(app)/applications/actions";

export const STATUS_OPTIONS = [
  ["draft", "Draft"],
  ["applied", "Applied"],
  ["interview", "Interview"],
  ["offer", "Offer"],
  ["closed", "Closed"],
] as const;

/** Status picker. Every change is recorded with its date for the dashboard. */
export function StatusSelect({ applicationId, status, compact = false, label = "Status" }: { applicationId: string; status: string; compact?: boolean; label?: string }) {
  const [value, setValue] = useState(status);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const change = (next: string) => {
    const prev = value;
    setValue(next);
    setError(null);
    start(async () => {
      const res = await setStatusAction(applicationId, next);
      if (res.status === "error") {
        setValue(prev);
        setError(res.message);
      }
    });
  };

  return (
    <span className="flex flex-col gap-1">
      <label className={`flex items-center gap-2 ${compact ? "text-[12px]" : "text-[13px]"} text-muted`}>
        <span className={compact ? "sr-only" : ""}>{label}</span>
        <select className={`field ${compact ? "h-8 py-0 text-[13px]" : ""} w-auto min-w-[124px]`} value={value} disabled={pending} onChange={(e) => change(e.target.value)}>
          {STATUS_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {error && <span role="alert" className="text-[12px] text-gap-text">{error}</span>}
    </span>
  );
}
