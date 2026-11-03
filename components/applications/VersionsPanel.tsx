"use client";

import { useState, useTransition } from "react";
import { restoreVersionAction } from "@/app/(app)/applications/actions";
import { IconUndo } from "@/components/ui/icons";

export interface Version {
  version: number;
  cause: string;
  created_at: string;
}

const CAUSE: Record<string, string> = {
  generated: "First draft",
  regenerated: "Rewritten",
  edited: "Edited by you",
  refined: "Changed in chat",
  restored: "Restored",
};

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));

/** Version history with Undo, shared by the resume, cover letter and email. */
export function VersionsPanel({ applicationId, kind, versions, currentVersion }: { applicationId: string; kind: "resume" | "cover" | "email"; versions: Version[]; currentVersion: number }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previous = versions.find((v) => v.version < currentVersion);

  const restore = (label: string, version: number) => {
    setError(null);
    setBusy(label);
    start(async () => {
      const res = await restoreVersionAction(applicationId, version, kind);
      setBusy(null);
      if (res.status === "error") setError(res.message);
    });
  };

  return (
    <section className="card flex flex-col gap-2.5 p-4" aria-label="Versions">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-[17px]">Versions</h2>
        {previous && (
          <button type="button" className="btn btn-secondary press h-9 px-3 text-[13px]" disabled={pending} onClick={() => restore("undo", previous.version)}>
            <IconUndo /> {busy === "undo" ? "Restoring…" : "Undo last change"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="m-0 text-[13px] text-gap-text">{error}</p>}
      <ul className="m-0 flex list-none flex-col p-0">
        {versions.map((v) => (
          <li key={v.version} className="flex items-center justify-between gap-3 border-t border-line-soft py-2 text-[13px]">
            <span>
              <span className="num">v{v.version}</span> · {CAUSE[v.cause] ?? v.cause}
              {v.version === currentVersion && <span className="ml-2 text-[12px] text-covered-text">current</span>}
            </span>
            <span className="flex items-center gap-2 text-subtle">
              {when(v.created_at)}
              {v.version !== currentVersion && (
                <button type="button" className="text-[12px] font-semibold text-teal hover:underline" disabled={pending} onClick={() => restore(`restore:${v.version}`, v.version)}>
                  Restore
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
