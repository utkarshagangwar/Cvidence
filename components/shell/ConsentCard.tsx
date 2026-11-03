"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { recordConsentAction } from "@/app/(app)/settings/actions";
import { CONSENT_POINTS } from "@/lib/consent";

/** Shown on every app page until the person agrees. Profile editing works without it; AI steps don't. */
export function ConsentCard() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="card flex flex-col gap-3 border-teal/40 p-5" aria-labelledby="consent-h">
      <h2 id="consent-h" className="m-0 text-[18px]">Before Cvidence uses AI on your profile</h2>
      <ul className="m-0 flex flex-col gap-1.5 pl-5 text-[14px] text-ink-2">
        {CONSENT_POINTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <p className="m-0 text-[13px] text-muted">
        Read the full <Link href="/privacy">privacy policy</Link> and <Link href="/terms">terms</Link>. You can withdraw this any time in Settings.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-primary press"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await recordConsentAction();
              if (res.status === "error") setError(res.message);
            })
          }
        >
          {pending ? "Saving…" : "I agree, turn on AI"}
        </button>
        <span className="text-[13px] text-subtle">Until then you can still fill in your profile by hand.</span>
        {error && <span role="alert" className="text-[13px] text-gap-text">{error}</span>}
      </div>
    </section>
  );
}
