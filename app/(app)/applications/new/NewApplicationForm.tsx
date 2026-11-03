"use client";

import { useActionState, useState } from "react";
import { createApplicationAction, type ActionState } from "../actions";

const MAX = 50_000;

export function NewApplicationForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createApplicationAction, { status: "idle" });
  const [text, setText] = useState("");

  return (
    <form action={action} className="card flex flex-col gap-4 p-6">
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
