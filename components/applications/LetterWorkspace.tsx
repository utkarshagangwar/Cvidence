"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { editLetterUnitAction, generateLetterAction, type ActionState } from "@/app/(app)/applications/actions";
import { VersionsPanel, type Version } from "@/components/applications/VersionsPanel";
import { IconCheck } from "@/components/ui/icons";
import { letterText, mailtoHref } from "@/lib/letters/sanitize";
import type { LetterDocumentData, LetterKind } from "@/lib/letters/types";
import type { Unit } from "@/lib/tailor/types";

const COPY: Record<LetterKind, { title: string; intro: string; cta: string; again: string; busy: string }> = {
  cover: {
    title: "Write a cover letter for this job",
    intro: "Three or four short paragraphs from your own profile, with the source of every claim tagged. Gaps are left out, never claimed.",
    cta: "Write cover letter · 2 credits",
    again: "Rewrite · 2 credits",
    busy: "Writing your letter…",
  },
  email: {
    title: "Write an outreach email",
    intro: "A short note to the recruiter or hiring manager with your two strongest matches. Opens in your own email app; Cvidence never sends anything.",
    cta: "Write email · 1 credit",
    again: "Rewrite · 1 credit",
    busy: "Writing your email…",
  },
};

export function LetterWorkspace({
  applicationId,
  kind,
  data,
  versions,
  currentVersion,
  hasProfileContent,
}: {
  applicationId: string;
  kind: LetterKind;
  data: LetterDocumentData | null;
  versions: Version[];
  currentVersion: number;
  hasProfileContent: boolean;
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const c = COPY[kind];

  const act = (label: string, fn: () => Promise<ActionState>, after?: () => void) => {
    setError(null);
    setBusy(label);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (res.status === "error") setError(res.message);
      else after?.();
    });
  };

  const generate = () => act("generate", () => generateLetterAction(applicationId, kind));

  if (!data) {
    return (
      <section className="card flex flex-col items-start gap-3 p-6">
        <h2 className="m-0 text-[18px]">{c.title}</h2>
        <p className="m-0 max-w-[60ch] text-ink-2">{c.intro}</p>
        {hasProfileContent ? (
          <button type="button" className="btn btn-primary press" disabled={pending} onClick={generate}>
            {busy === "generate" ? c.busy : c.cta}
          </button>
        ) : (
          <Link href="/profile" className="btn btn-primary press">Add roles to your profile first</Link>
        )}
        {busy === "generate" && (
          <p role="status" className="m-0 flex items-center gap-2 text-[13px] text-muted">
            <span className="loader-dot" aria-hidden="true" /> Usually 10 to 30 seconds.
          </p>
        )}
        {error && <p role="alert" className="m-0 text-[13px] text-gap-text">{error}</p>}
      </section>
    );
  }

  const flagsFor = (id: string) => data.flags.filter((f) => f.unitId === id);
  const flagged = new Set(data.flags.map((f) => f.unitId)).size;
  const mailto = mailtoHref(data);

  const copy = async () => {
    try {
      const text = kind === "email" && data.subject ? `Subject: ${data.subject.text}\n\n${letterText(data)}` : letterText(data);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the text and copy it instead.");
    }
  };

  const Line = ({ unit, as = "p" }: { unit: Unit; as?: "p" | "span" }) => {
    const flags = flagsFor(unit.id);
    if (editing?.id === unit.id) {
      return (
        <span className="flex flex-col gap-2 font-sans">
          <textarea
            aria-label="Edit this paragraph"
            className="field h-auto py-2 text-[14px] leading-normal"
            rows={unit.id === "subject" || unit.id === "greeting" ? 1 : 5}
            maxLength={1200}
            value={editing.text}
            onChange={(e) => setEditing({ id: unit.id, text: e.target.value })}
            autoFocus
          />
          <span className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary press h-8 px-3 text-[13px]" disabled={pending} onClick={() => act(`edit:${unit.id}`, () => editLetterUnitAction(applicationId, kind, unit.id, editing.text), () => setEditing(null))}>
              {busy === `edit:${unit.id}` ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn h-8 px-3 text-[13px] text-ink-2" onClick={() => setEditing(null)}>Cancel</button>
          </span>
        </span>
      );
    }
    const Tag = as;
    return (
      <Tag className={`m-0 ${flags.length ? "rounded-[3px] bg-partial-bg/60 px-1 -mx-1" : ""}`}>
        {unit.text}
        {unit.src.map((s) => (
          <span key={s} className="num ml-1.5 rounded-[3px] bg-teal-tint px-1 py-px align-[1px] font-sans text-[10.5px] text-teal">{s}</span>
        ))}
        {flags.length > 0 && (
          <span className="ml-1.5 align-[1px] font-sans text-[11px] font-semibold text-partial-text">Check: {flags.map((f) => f.token).join(", ")}</span>
        )}
        <button type="button" className="ml-1.5 rounded-[3px] px-1 align-[1px] font-sans text-[11px] font-semibold text-teal opacity-70 hover:bg-teal-tint hover:opacity-100 focus-visible:opacity-100" aria-label={`Edit${flags.length ? " (needs checking)" : ""}`} onClick={() => setEditing({ id: unit.id, text: unit.text })}>
          Edit
        </button>
      </Tag>
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 flex items-center gap-2 text-[13px] text-muted">
          <span className="num rounded-[4px] bg-teal-tint px-1.5 py-0.5 text-teal">R1</span> tags show which part of your profile each paragraph uses
        </p>
        {flagged > 0 ? (
          <span className="rounded-[4px] bg-partial-bg px-2.5 py-1 text-[13px] text-partial-text">{flagged} to check</span>
        ) : (
          <span className="rounded-[4px] bg-covered-bg px-2.5 py-1 text-[13px] text-covered-text">Nothing to check</span>
        )}
      </div>

      {error && <p role="alert" className="m-0 rounded-[var(--radius-control)] bg-gap-bg px-3 py-2.5 text-[13px] text-gap-text">{error}</p>}

      <article className="card flex flex-col gap-4 p-6 font-display text-[15.5px] leading-relaxed text-ink sm:p-8" aria-label={kind === "cover" ? "Cover letter" : "Email"}>
        {kind === "email" && data.subject && (
          <div className="flex flex-col gap-1 border-b border-line-soft pb-3 font-sans text-[14px]">
            {data.to && <span className="text-muted">To: <span className="text-ink">{data.to}</span></span>}
            <span className="flex flex-wrap gap-1 text-muted">Subject: <span className="font-semibold text-ink"><Line unit={data.subject} as="span" /></span></span>
          </div>
        )}
        <Line unit={data.greeting} />
        {data.paragraphs.map((p) => (
          <Line key={p.id} unit={p} />
        ))}
        <p className="m-0 whitespace-pre-line">{data.signoff}</p>
      </article>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary press w-[110px]" onClick={copy}>
          {copied ? <><IconCheck /> Copied</> : "Copy text"}
        </button>
        {kind === "email" &&
          (mailto ? (
            <a href={mailto} className="btn btn-primary press">Open in email app</a>
          ) : (
            <span className="self-center text-[13px] text-subtle">The posting has no email address. Copy the text into your own email.</span>
          ))}
        <button type="button" className="btn btn-secondary press" disabled={pending} onClick={generate}>
          {busy === "generate" ? "Rewriting…" : c.again}
        </button>
      </div>

      <VersionsPanel applicationId={applicationId} kind={kind} versions={versions} currentVersion={currentVersion} />
    </div>
  );
}
