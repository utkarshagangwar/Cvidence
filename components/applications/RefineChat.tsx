"use client";

import { useState, useTransition } from "react";
import { refineAction } from "@/app/(app)/applications/actions";

export interface ChatMessageView {
  id: string;
  role: "user" | "assistant";
  body: string;
  version: number | null;
}

const IDEAS: Record<"resume" | "cover" | "email", string[]> = {
  resume: ["Make the summary shorter", "Lead with API testing", "Use simpler words"],
  cover: ["Make it more formal", "Cut it to three paragraphs", "Mention the payments work first"],
  email: ["Make it shorter", "Sound warmer", "Ask for a 15-minute call"],
};

/** Chat edits for one document. Each answer that changes lines is a new version, so Undo works. */
export function RefineChat({ applicationId, kind, messages, hasDocument }: { applicationId: string; kind: "resume" | "cover" | "email"; messages: ChatMessageView[]; hasDocument: boolean }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  if (!hasDocument) return null;

  const send = (value: string) => {
    const ask = value.trim();
    if (ask.length < 3) return;
    setError(null);
    setSent(ask);
    start(async () => {
      const res = await refineAction(applicationId, kind, ask);
      setSent(null);
      if (res.status === "error") setError(res.message);
      else setText("");
    });
  };

  return (
    <section className="card flex flex-col gap-3 p-4" aria-label="Ask for changes">
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-[17px]">Ask for changes</h2>
        <p className="m-0 text-[13px] text-muted">Cvidence only rewrites what's already there, from your profile. 1 credit per message.</p>
      </div>

      {(messages.length > 0 || sent) && (
        <ol className="m-0 flex max-h-[320px] list-none flex-col gap-2 overflow-y-auto p-0" aria-live="polite">
          {messages.map((m) => (
            <li key={m.id} className={`max-w-[85%] rounded-[var(--radius-control)] px-3 py-2 text-[13.5px] ${m.role === "user" ? "self-end bg-teal text-on-teal" : "self-start bg-well text-ink-2"}`}>
              {m.body}
              {m.role === "assistant" && m.version !== null && <span className="num ml-1.5 text-[11px] text-subtle">v{m.version}</span>}
            </li>
          ))}
          {sent && (
            <>
              <li className="max-w-[85%] self-end rounded-[var(--radius-control)] bg-teal px-3 py-2 text-[13.5px] text-on-teal">{sent}</li>
              <li className="flex items-center gap-2 self-start rounded-[var(--radius-control)] bg-well px-3 py-2 text-[13px] text-muted" role="status">
                <span className="loader-dot" aria-hidden="true" /> Working on it…
              </li>
            </>
          )}
        </ol>
      )}

      {messages.length === 0 && !sent && (
        <div className="flex flex-wrap gap-2">
          {IDEAS[kind].map((idea) => (
            <button key={idea} type="button" className="inline-flex h-8 items-center rounded-full border border-line-strong bg-sheet px-3 text-[13px] text-ink-2 hover:border-teal hover:text-teal" disabled={pending} onClick={() => send(idea)}>
              {idea}
            </button>
          ))}
        </div>
      )}

      {error && <p role="alert" className="m-0 text-[13px] text-gap-text">{error}</p>}

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label htmlFor={`refine-${kind}`} className="sr-only">What should change?</label>
        <input id={`refine-${kind}`} className="field flex-1" placeholder="e.g. make the second paragraph shorter" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} disabled={pending} />
        <button type="submit" className="btn btn-primary press shrink-0" disabled={pending || text.trim().length < 3}>
          {pending ? "Sending…" : "Send · 1 credit"}
        </button>
      </form>
    </section>
  );
}
