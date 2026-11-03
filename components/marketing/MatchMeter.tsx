import { Reveal } from "./Reveal";

// The covered / partial / gap view from the Casefile workspace, in miniature.
// Example requirements; the bar fills when it scrolls into view.

const REQS = [
  { text: "Selenium WebDriver with Python", state: "Covered", note: "R1 Northwind suite" },
  { text: "CI with GitHub Actions or Jenkins", state: "Covered", note: "P1 CI pipeline" },
  { text: "REST API testing", state: "Partial", note: "In your skills, not yet in a role" },
  { text: "3+ years in test automation", state: "Gap", note: "About 2 years across 2 roles" },
] as const;

const CHIP = {
  Covered: "bg-covered-bg text-covered-text",
  Partial: "bg-partial-bg text-partial-text",
  Gap: "bg-gap-bg text-gap-text",
} as const;

export function MatchMeter() {
  return (
    <Reveal className="card flex flex-col gap-4 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-[17px] font-semibold">How you match</span>
        <span className="num text-[12px] text-muted">example</span>
      </div>
      <div className="mm-bar flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        <span className="mm-seg bg-covered" style={{ flex: 5, "--d": "0ms" } as React.CSSProperties} />
        <span className="mm-seg bg-partial" style={{ flex: 2, "--d": "180ms" } as React.CSSProperties} />
        <span className="mm-seg bg-gap" style={{ flex: 2, "--d": "320ms" } as React.CSSProperties} />
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {REQS.map((r) => (
          <li key={r.text} className="flex items-start justify-between gap-3 border-t border-line-soft py-2.5">
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">{r.text}</span>
              <span className="text-[12px] text-subtle">{r.note}</span>
            </span>
            <span className={`shrink-0 rounded-[var(--radius-tag)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] ${CHIP[r.state]}`}>
              {r.state}
            </span>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}
