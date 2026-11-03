"use client";

import { useState, useTransition } from "react";
import { saveAgentSettingsAction } from "@/app/(app)/settings/actions";
import { IconCheck } from "@/components/ui/icons";
import { creditsPerRun, type AgentSettings } from "@/lib/agent/settings";

const LEVELS = [
  ["intern", "Intern"],
  ["senior", "Senior"],
  ["lead", "Lead"],
  ["staff", "Staff"],
  ["principal", "Principal"],
  ["manager", "Manager"],
  ["director", "Director"],
] as const;

interface LastRun {
  day: string;
  state: string;
  found: number;
  scored: number;
  drafted: number;
  note: string | null;
}

export function AgentSettingsForm({ initial, emailReady, lastRun, dailyCredits }: { initial: AgentSettings; emailReady: boolean; lastRun: LastRun | null; dailyCredits: number }) {
  const [s, setS] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const set = (patch: Partial<AgentSettings>) => {
    setS((x) => ({ ...x, ...patch }));
    setMsg(null);
  };
  const setF = (patch: Partial<AgentSettings["filters"]>) => set({ filters: { ...s.filters, ...patch } });
  const cost = creditsPerRun(s.max_drafts);

  const save = () =>
    start(async () => {
      const res = await saveAgentSettingsAction(s);
      setMsg(res.status === "ok" ? { kind: "ok", text: "Saved" } : { kind: "error", text: res.message });
    });

  return (
    <section className="card flex flex-col gap-5 p-6" aria-labelledby="agent-h">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[60ch] flex-col gap-1">
          <h2 id="agent-h" className="m-0 text-[18px]">Daily agent</h2>
          <p className="m-0 text-ink-2">
            Each morning it searches with these filters, scores up to 16 new jobs and drafts a tailored resume for the best few. It never applies or sends anything: drafts wait on your dashboard for review.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5">
          <input type="checkbox" role="switch" className="peer sr-only" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          <span aria-hidden="true" className="relative h-6 w-11 rounded-full bg-line-strong transition-colors peer-checked:bg-teal peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-sheet after:shadow after:transition-transform peer-checked:after:translate-x-5" />
          <span className="w-[26px] text-[14px] font-medium">{s.enabled ? "On" : "Off"}</span>
        </label>
      </div>

      <fieldset className="m-0 grid grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2" disabled={!s.enabled}>
        <legend className="mb-2 p-0 text-[13px] font-medium text-ink-2">Saved search</legend>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[13px] font-medium text-ink-2">Role</span>
          <input className="field" value={s.filters.q} maxLength={120} placeholder="e.g. sdet, qa automation" onChange={(e) => setF({ q: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">City</span>
          <input className="field" value={s.filters.location} maxLength={80} placeholder="e.g. Bengaluru" onChange={(e) => setF({ location: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">Work Mode</span>
          <select className="field" value={s.filters.remote} onChange={(e) => setF({ remote: e.target.value as AgentSettings["filters"]["remote"] })}>
            <option value="any">Any</option>
            <option value="remote">Remote Only</option>
            <option value="onsite">Office or Hybrid</option>
          </select>
        </label>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-[13px] font-medium text-ink-2">Hide Levels</span>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map(([v, l]) => {
              const on = s.filters.exclude.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setF({ exclude: on ? s.filters.exclude.filter((x) => x !== v) : [...s.filters.exclude, v] })}
                  className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] transition-colors ${on ? "border-teal bg-teal-tint text-teal-ink" : "border-line-strong bg-sheet text-ink-2"}`}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>
      </fieldset>

      <fieldset className="m-0 grid grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2" disabled={!s.enabled}>
        <legend className="mb-2 p-0 text-[13px] font-medium text-ink-2">Drafting</legend>
        <label className="flex flex-col gap-1.5">
          <span className="flex justify-between text-[13px] font-medium text-ink-2">
            Draft when fit is at least <span className="num">{s.threshold}</span>
          </span>
          <input type="range" min={40} max={95} step={5} value={s.threshold} onChange={(e) => set({ threshold: Number(e.target.value) })} className="accent-teal" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">Most drafts per day</span>
          <select className="field" value={s.max_drafts} onChange={(e) => set({ max_drafts: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <p className="m-0 text-[13px] text-muted sm:col-span-2">
          Uses at most <b className="num text-ink">{cost}</b> of your {dailyCredits} daily credits, fewer when nothing scores high enough. If credits run out, it stops and says so.
        </p>
        <label className="flex items-center gap-2.5 sm:col-span-2">
          <input type="checkbox" className="size-4 accent-teal" checked={s.digest} onChange={(e) => set({ digest: e.target.checked })} />
          <span className="text-[14px]">Email me a summary each morning</span>
        </label>
        {!emailReady && s.digest && <p className="m-0 text-[12px] text-subtle sm:col-span-2">Morning emails aren't switched on for this server yet. Drafts still appear on your dashboard.</p>}
      </fieldset>

      {lastRun && (
        <p className="m-0 rounded-[var(--radius-control)] bg-well px-3 py-2.5 text-[13px] text-ink-2">
          Last run {lastRun.day}: {lastRun.state === "skipped" ? "skipped (agent off)" : `${lastRun.found} new jobs, ${lastRun.scored} scored, ${lastRun.drafted} drafted`}.
          {lastRun.note && <span className="block text-partial-text">{lastRun.note}</span>}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-primary press" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save agent settings"}
        </button>
        <span role="status" aria-live="polite" className="min-w-[60px] text-[13px]">
          {msg?.kind === "ok" && <span className="inline-flex items-center gap-1 text-covered-text"><IconCheck /> {msg.text}</span>}
          {msg?.kind === "error" && <span className="text-gap-text">{msg.text}</span>}
        </span>
      </div>
    </section>
  );
}
