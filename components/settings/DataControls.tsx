"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteAccountAction, recordConsentAction, withdrawConsentAction } from "@/app/(app)/settings/actions";

export function DataControls({ consentedAt }: { consentedAt: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const when = consentedAt ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(consentedAt)) : null;

  const run = (fn: () => Promise<{ status: string; message?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.status === "error") setError(res.message ?? "Something went wrong.");
    });

  return (
    <section className="card flex flex-col gap-5 p-6" aria-labelledby="data-h">
      <div className="flex flex-col gap-1">
        <h2 id="data-h" className="m-0 text-[18px]">Your data</h2>
        <p className="m-0 text-ink-2">
          What's stored and where it goes is in the <Link href="/privacy">privacy policy</Link>.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
        <div className="flex max-w-[52ch] flex-col gap-0.5">
          <span className="font-medium">AI use</span>
          <span className="text-[13px] text-muted">{when ? `You agreed on ${when}. Withdrawing stops every AI step and the daily agent.` : "Off. AI steps stay switched off until you agree."}</span>
        </div>
        {when ? (
          <button type="button" className="btn btn-secondary press" disabled={pending} onClick={() => run(withdrawConsentAction)}>Withdraw consent</button>
        ) : (
          <button type="button" className="btn btn-primary press" disabled={pending} onClick={() => run(recordConsentAction)}>I agree, turn on AI</button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
        <div className="flex max-w-[52ch] flex-col gap-0.5">
          <span className="font-medium">Export everything</span>
          <span className="text-[13px] text-muted">One JSON file with your profile, applications, documents and their history, notes, saved jobs and usage.</span>
        </div>
        <a href="/api/account/export" className="btn btn-secondary press" download>Download my data</a>
      </div>

      <div className="flex flex-col gap-3 border-t border-line-soft pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex max-w-[52ch] flex-col gap-0.5">
            <span className="font-medium text-gap-text">Delete my account</span>
            <span className="text-[13px] text-muted">Removes your account and all its data right away. This can't be undone, so download your data first if you want a copy.</span>
          </div>
          {!deleting && (
            <button type="button" className="btn btn-secondary press border-gap/50 text-gap-text" onClick={() => setDeleting(true)}>Delete account…</button>
          )}
        </div>
        {deleting && (
          <form
            className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-gap-bg p-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => deleteAccountAction(confirm));
            }}
          >
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-[13px] font-medium text-gap-text">Type DELETE to confirm</span>
              <input className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoFocus />
            </label>
            <span className="flex gap-2">
              <button type="submit" className="btn press bg-gap text-paper hover:opacity-90" disabled={pending || confirm.trim() !== "DELETE"}>
                {pending ? "Deleting…" : "Delete forever"}
              </button>
              <button type="button" className="btn btn-secondary press" onClick={() => { setDeleting(false); setConfirm(""); }}>Cancel</button>
            </span>
          </form>
        )}
      </div>
      {error && <p role="alert" className="m-0 text-[13px] text-gap-text">{error}</p>}
    </section>
  );
}
