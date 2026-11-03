"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { dismissJobAction, saveJobAction, scoreJobsAction, startApplicationAction } from "@/app/(app)/jobs/actions";
import { IconBookmark, IconCheck, IconExternal, IconX } from "@/components/ui/icons";
import { UndoToast } from "@/components/ui/UndoToast";
import type { PostingListItem } from "@/lib/jobs/service";

const UNDO_MS = 6000;
const BATCH = 8;

function ago(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

/** The fit mark: score in mono on the covered / partial / gap scale. */
function Fit({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-[var(--radius-control)] border border-dashed border-line-strong text-subtle" title="Not scored yet">
        <span className="num text-[15px] leading-none" aria-hidden="true">–</span>
        <span className="sr-only">Not scored</span>
      </span>
    );
  }
  const tone = score >= 70 ? "bg-covered-bg text-covered-text" : score >= 45 ? "bg-partial-bg text-partial-text" : "bg-gap-bg text-gap-text";
  return (
    <span className={`flex size-11 shrink-0 flex-col items-center justify-center rounded-[var(--radius-control)] ${tone}`} title={`Fit ${score} of 100`}>
      <span className="num text-[16px] font-semibold leading-none">{score}</span>
      <span className="text-[9px] font-semibold uppercase tracking-[0.06em]">fit</span>
    </span>
  );
}

function JobRow({
  job,
  boardLabel,
  onDismiss,
  onError,
}: {
  job: PostingListItem;
  boardLabel: string;
  onDismiss: (job: PostingListItem) => void;
  onError: (message: string) => void;
}) {
  const [saved, setSaved] = useState(job.saved);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"save" | "start" | null>(null);
  useEffect(() => setSaved(job.saved), [job.saved]);

  const toggleSave = () => {
    const next = !saved;
    setSaved(next); // optimistic
    setBusy("save");
    start(async () => {
      const res = await saveJobAction(job.id, next);
      setBusy(null);
      if (res.status === "error") {
        setSaved(!next);
        onError(res.message);
      }
    });
  };

  const startApplication = () => {
    setBusy("start");
    start(async () => {
      const res = await startApplicationAction(job.id); // redirects on success
      setBusy(null);
      if (res?.status === "error") onError(res.message);
    });
  };

  const meta = [job.company, job.location || null, job.remote ? "Remote" : null, ago(job.posted_at ?? job.first_seen_at)].filter(Boolean);

  return (
    <li className="flex flex-col gap-3 border-t border-line-soft px-5 py-4 first:border-t-0 md:flex-row md:items-start md:gap-4">
      <div className="flex min-w-0 flex-1 gap-3.5">
        <Fit score={job.score} />
        <div className="flex min-w-0 flex-col gap-1">
          <a href={job.url} target="_blank" rel="noopener noreferrer" className="group inline-flex items-baseline gap-1.5 font-semibold text-ink no-underline hover:text-teal">
            <span className="min-w-0 [overflow-wrap:anywhere]">{job.title}</span>
            <span className="shrink-0 text-subtle group-hover:text-teal">
              <IconExternal />
              <span className="sr-only">(opens the posting in a new tab)</span>
            </span>
          </a>
          <p className="m-0 text-[13px] text-muted [overflow-wrap:anywhere]">
            {meta.join(" · ")}
            <span className="ml-2 rounded-[var(--radius-tag)] bg-track px-1.5 py-0.5 align-[1px] text-[11px] font-medium text-ink-2">{boardLabel}</span>
            {job.salary && <span className="ml-2 num text-[12px] text-ink-2">{job.salary}</span>}
          </p>
          {(job.reasons.length > 0 || job.redFlags.length > 0) && (
            <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0 text-[13px]">
              {job.reasons.map((r) => (
                <li key={`r-${r}`} className="flex items-start gap-1.5 text-covered-text">
                  <span className="mt-[2px] shrink-0"><IconCheck /></span>
                  <span className="text-ink-2">{r}</span>
                </li>
              ))}
              {job.redFlags.map((r) => (
                <li key={`f-${r}`} className="flex items-start gap-1.5 text-gap-text">
                  <span className="mt-[2px] shrink-0"><IconX /></span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-[58px] md:pl-0">
        <button
          type="button"
          className={`btn btn-secondary press h-9 w-[92px] px-3 text-[13px] ${saved ? "border-teal text-teal" : ""}`}
          aria-pressed={saved}
          onClick={toggleSave}
          disabled={busy === "save"}
        >
          <IconBookmark filled={saved} /> {saved ? "Saved" : "Save"}
        </button>
        <button type="button" className="btn btn-secondary press h-9 px-3 text-[13px]" onClick={() => onDismiss(job)} aria-label={`Dismiss ${job.title}`}>
          <IconX /> Dismiss
        </button>
        <button type="button" className="btn btn-primary press h-9 px-3 text-[13px]" onClick={startApplication} disabled={pending && busy === "start"}>
          {busy === "start" ? "Reading the job…" : "Start Application · 2 credits"}
        </button>
      </div>
    </li>
  );
}

export function ScoreButton({ ids }: { ids: string[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const run = (n: number) => {
    setMsg(null);
    start(async () => {
      const res = await scoreJobsAction(ids.slice(0, n));
      setMsg(res.status === "error" ? { kind: "error", text: res.message } : { kind: "ok", text: `Scored ${res.scored ?? 0} jobs.` });
    });
  };
  if (ids.length === 0) return null;
  const first = Math.min(BATCH, ids.length);
  const credits = (n: number) => Math.ceil(n / BATCH);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-primary press h-9 px-3 text-[13px]" disabled={pending} onClick={() => run(first)}>
        {pending ? "Scoring…" : `Score Next ${first} · ${credits(first)} credit`}
      </button>
      {ids.length > BATCH && (
        <button type="button" className="btn btn-secondary press h-9 px-3 text-[13px]" disabled={pending} onClick={() => run(24)}>
          Score {Math.min(24, ids.length)} · {credits(Math.min(24, ids.length))} credits
        </button>
      )}
      {pending && (
        <span role="status" className="flex items-center gap-2 text-[13px] text-muted">
          <span className="loader-dot" aria-hidden="true" /> Checking each job against your profile.
        </span>
      )}
      {!pending && msg && (
        <span role={msg.kind === "error" ? "alert" : "status"} className={`text-[13px] ${msg.kind === "error" ? "text-gap-text" : "text-covered-text"}`}>
          {msg.text}
        </span>
      )}
    </div>
  );
}

export function JobList({ items, boardLabels }: { items: PostingListItem[]; boardLabels: Record<string, string> }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pendingDismiss, setPendingDismiss] = useState<PostingListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<PostingListItem | null>(null);
  useEffect(() => {
    pendingRef.current = pendingDismiss;
  }, [pendingDismiss]);

  // The dismiss is only sent after the undo window, so Undo never needs a second request.
  const commit = (job: PostingListItem) => {
    void dismissJobAction(job.id, true).then((res) => {
      if (res.status === "error") {
        setHidden((h) => {
          const n = new Set(h);
          n.delete(job.id);
          return n;
        });
        setError(res.message);
      }
    });
  };

  const dismiss = (job: PostingListItem) => {
    if (timer.current && pendingDismiss) {
      clearTimeout(timer.current);
      commit(pendingDismiss);
    }
    setHidden((h) => new Set(h).add(job.id));
    setPendingDismiss(job);
    timer.current = setTimeout(() => {
      commit(job);
      setPendingDismiss(null);
    }, UNDO_MS);
  };

  const undo = () => {
    if (timer.current) clearTimeout(timer.current);
    if (pendingDismiss) {
      const id = pendingDismiss.id;
      setHidden((h) => {
        const n = new Set(h);
        n.delete(id);
        return n;
      });
    }
    setPendingDismiss(null);
  };

  // Leaving the page mid-window still records the dismiss.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pendingRef.current) void dismissJobAction(pendingRef.current.id, true);
    },
    [],
  );

  const visible = items.filter((i) => !hidden.has(i.id));

  return (
    <>
      {error && (
        <p role="alert" className="m-0 rounded-[var(--radius-control)] bg-gap-bg px-3 py-2.5 text-[13px] text-gap-text">
          {error}
        </p>
      )}
      <ul className="card m-0 flex list-none flex-col p-0" aria-label="Jobs">
        {visible.map((job) => (
          <JobRow key={job.id} job={job} boardLabel={boardLabels[job.adapter] ?? job.adapter} onDismiss={dismiss} onError={setError} />
        ))}
      </ul>
      {pendingDismiss && <UndoToast message={`Dismissed ${pendingDismiss.title}`} onUndo={undo} />}
    </>
  );
}
