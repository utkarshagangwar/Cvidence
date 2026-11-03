"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { editUnitAction, rewriteUnitAction, tailorAction, type ActionState } from "@/app/(app)/applications/actions";
import { VersionsPanel, type Version } from "@/components/applications/VersionsPanel";
import { ResumeSheet } from "@/components/resume/ResumeSheet";
import { IconDownload } from "@/components/ui/icons";
import { downloadResumeDocx } from "@/lib/export/docx";
import type { ResumeDocumentData } from "@/lib/tailor/frame";
import type { Flag, Unit } from "@/lib/tailor/types";

export function ResumeWorkspace({
  applicationId,
  data,
  versions,
  currentVersion,
  fileBase,
  hasProfileContent,
}: {
  applicationId: string;
  data: ResumeDocumentData | null;
  versions: Version[];
  currentVersion: number;
  fileBase: string;
  hasProfileContent: boolean;
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

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

  if (!data) {
    return (
      <section className="card flex flex-col items-start gap-3 p-6">
        <h2 className="m-0 text-[18px]">Tailor your resume to this job</h2>
        <p className="m-0 max-w-[60ch] text-ink-2">
          Cvidence reorders and rewrites your own bullets for this role, tags every line with where it came from, and flags anything it can’t trace to your profile.
        </p>
        {hasProfileContent ? (
          <button type="button" className="btn btn-primary press" disabled={pending} onClick={() => act("tailor", () => tailorAction(applicationId))}>
            {busy === "tailor" ? "Writing your resume…" : "Tailor resume · 3 credits"}
          </button>
        ) : (
          <Link href="/profile" className="btn btn-primary press">Add roles to your profile first</Link>
        )}
        {busy === "tailor" && (
          <p role="status" className="m-0 flex items-center gap-2 text-[13px] text-muted">
            <span className="loader-dot" aria-hidden="true" /> Usually 20 to 40 seconds.
          </p>
        )}
        {error && <p role="alert" className="m-0 text-[13px] text-gap-text">{error}</p>}
      </section>
    );
  }

  const flagged = new Set(data.flags.map((f) => f.unitId)).size;

  const renderUnit = (unit: Unit, flags: Flag[], body: React.ReactNode) => {
    if (editing?.id === unit.id) {
      return (
        <span className="mt-1 flex flex-col gap-2 font-sans">
          <textarea
            aria-label="Edit this line"
            className="field h-auto py-2 text-[14px] leading-normal"
            rows={3}
            maxLength={600}
            value={editing.text}
            onChange={(e) => setEditing({ id: unit.id, text: e.target.value })}
            autoFocus
          />
          <span className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary press h-8 px-3 text-[13px]" disabled={pending} onClick={() => act(`edit:${unit.id}`, () => editUnitAction(applicationId, unit.id, editing.text), () => setEditing(null))}>
              {busy === `edit:${unit.id}` ? "Saving…" : "Save line"}
            </button>
            <button type="button" className="btn btn-secondary press h-8 px-3 text-[13px]" disabled={pending} onClick={() => act(`rw:${unit.id}`, () => rewriteUnitAction(applicationId, unit.id, ""), () => setEditing(null))}>
              {busy === `rw:${unit.id}` ? "Rewriting…" : "Rewrite with AI · 1 credit"}
            </button>
            <button type="button" className="btn h-8 px-3 text-[13px] text-ink-2" onClick={() => setEditing(null)}>Cancel</button>
          </span>
        </span>
      );
    }
    return (
      <span className="group relative">
        {body}
        <button
          type="button"
          className="ml-1.5 rounded-[3px] px-1 align-[1px] font-sans text-[11px] font-semibold text-teal opacity-70 hover:bg-teal-tint hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Edit line${flags.length ? " (needs checking)" : ""}`}
          onClick={() => setEditing({ id: unit.id, text: unit.text })}
        >
          Edit
        </button>
      </span>
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 flex items-center gap-2 text-[13px] text-muted">
          <span className="num rounded-[4px] bg-teal-tint px-1.5 py-0.5 text-teal">R1</span> tags show which part of your profile each line came from
        </p>
        {flagged > 0 ? (
          <span className="rounded-[4px] bg-partial-bg px-2.5 py-1 text-[13px] text-partial-text">
            {flagged} line{flagged === 1 ? "" : "s"} to check
          </span>
        ) : (
          <span className="rounded-[4px] bg-covered-bg px-2.5 py-1 text-[13px] text-covered-text">Every line traced to your profile</span>
        )}
      </div>

      {error && <p role="alert" className="m-0 rounded-[var(--radius-control)] bg-gap-bg px-3 py-2.5 text-[13px] text-gap-text">{error}</p>}

      <ResumeSheet data={data} showTags renderUnit={renderUnit} />

      <div className="flex flex-wrap gap-2">
        <Link href={`/print/applications/${applicationId}`} target="_blank" className="btn btn-secondary press">
          <IconDownload /> PDF
        </Link>
        <button type="button" className="btn btn-secondary press" onClick={() => downloadResumeDocx(data, `${fileBase}.docx`)}>
          <IconDownload /> DOCX
        </button>
        <button type="button" className="btn btn-secondary press" disabled={pending} onClick={() => act("tailor", () => tailorAction(applicationId))}>
          {busy === "tailor" ? "Rewriting…" : "Rewrite all · 3 credits"}
        </button>
      </div>

      <VersionsPanel applicationId={applicationId} kind="resume" versions={versions} currentVersion={currentVersion} />

      <section className="rounded-[var(--radius-card)] bg-rail px-4 py-3.5 text-[12.5px] text-ink-2">
        <b className="text-[13px]">Sources</b>
        <ul className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
          {data.frame.sources.map((s) => (
            <li key={s.tag}>
              <span className="num">{s.tag}</span> {s.label}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
