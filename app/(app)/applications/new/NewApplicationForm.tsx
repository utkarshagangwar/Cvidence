"use client";

import { useActionState, useState } from "react";
import { IconSparkle } from "@/components/ui/icons";
import { createApplicationAction, generateJdAction, type ActionState } from "../actions";

const MAX = 50_000;

const LEVELS = [
  { value: "entry", label: "Entry (0–2 years)" },
  { value: "mid", label: "Mid (2–5 years)" },
  { value: "senior", label: "Senior (5–8 years)" },
  { value: "lead", label: "Lead (8+ years)" },
] as const;

type Sample = { kind: "idle" } | { kind: "busy" } | { kind: "done"; title: string; previous: string } | { kind: "error"; message: string };

export function NewApplicationForm({ defaultRole = "", defaultLevel = "mid" }: { defaultRole?: string; defaultLevel?: (typeof LEVELS)[number]["value"] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createApplicationAction, { status: "idle" });
  const [text, setText] = useState("");
  const [role, setRole] = useState(defaultRole);
  const [level, setLevel] = useState<string>(defaultLevel);
  const [location, setLocation] = useState("");
  const [sample, setSample] = useState<Sample>({ kind: "idle" });

  // Writes a typical posting for the target role into the box below. Nothing is
  // saved: the person reads it, edits it, then runs Read and match as usual.
  async function onWriteSample() {
    setSample({ kind: "busy" });
    const res = await generateJdAction({ role, level, location });
    if (res.status === "error") return setSample({ kind: "error", message: res.message });
    setSample({ kind: "done", title: res.title, previous: text });
    setText(res.text.slice(0, MAX));
  }

  return (
    <form action={action} className="card flex flex-col gap-4 p-6">
      <fieldset className="m-0 flex flex-col gap-3 rounded-[var(--radius-control)] border border-line-soft p-4">
        <legend className="px-1 text-[13px] font-medium text-ink-2">No posting yet? Write a sample for your target role</legend>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="jd-role" className="text-[13px] font-medium text-ink-2">Target role</label>
            <input id="jd-role" className="field" value={role} maxLength={120} onChange={(e) => setRole(e.target.value)} placeholder="e.g. QA Engineer" autoComplete="off" />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="jd-level" className="text-[13px] font-medium text-ink-2">Level</label>
            <select id="jd-level" className="field" value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="jd-location" className="text-[13px] font-medium text-ink-2">Location <span className="font-normal text-subtle">(optional)</span></label>
            <input id="jd-location" className="field" value={location} maxLength={120} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Noida or Remote" autoComplete="off" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-secondary press" onClick={onWriteSample} disabled={sample.kind === "busy" || pending || role.trim().length < 2}>
            {sample.kind === "busy" ? (
              <>
                <span className="loader-dot" aria-hidden="true" /> Writing…
              </>
            ) : (
              <>
                <IconSparkle /> Write a job description · 1 credit
              </>
            )}
          </button>
          <span role={sample.kind === "error" ? "alert" : "status"} className={`text-[12.5px] ${sample.kind === "error" ? "text-gap-text" : "text-muted"}`}>
            {sample.kind === "error" && sample.message}
            {sample.kind === "done" && (
              <>
                Wrote a typical {sample.title} posting below. It isn’t a real job, so edit it to match the roles you’re applying for.{" "}
                {sample.previous && (
                  <button type="button" className="text-teal underline underline-offset-2 hover:text-teal-hover" onClick={() => { setText(sample.previous); setSample({ kind: "idle" }); }}>
                    Undo
                  </button>
                )}
              </>
            )}
          </span>
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="jd" className="text-[13px] font-medium text-ink-2">Job description</label>
        <textarea
          id="jd"
          name="jd"
          rows={14}
          required
          minLength={50}
          maxLength={MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the whole posting: title, company, responsibilities and requirements."
          aria-describedby="jd-help"
          aria-invalid={state.status === "error" ? true : undefined}
          className="field h-auto py-3 leading-relaxed"
        />
        <span id="jd-help" className="flex flex-wrap justify-between gap-2 text-[12px] text-subtle">
          <span>Read as data only: instructions hidden inside a posting are ignored.</span>
          <span className="num">{text.length.toLocaleString("en-IN")} / 50,000</span>
        </span>
      </div>

      {state.status === "error" && (
        <p role="alert" className="m-0 rounded-[var(--radius-control)] bg-gap-bg px-3 py-2.5 text-[13px] text-gap-text">{state.message}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary press" disabled={pending || text.trim().length < 50}>
          {pending ? "Reading the job…" : "Read and match · 2 credits"}
        </button>
        {pending && (
          <span role="status" className="flex items-center gap-2 text-[13px] text-muted">
            <span className="loader-dot" aria-hidden="true" /> Listing requirements, then checking your profile.
          </span>
        )}
      </div>
    </form>
  );
}
