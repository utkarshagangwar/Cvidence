import type { MatchResult, MatchState } from "@/lib/match/types";

const CHIP: Record<MatchState, string> = {
  covered: "bg-covered-bg text-covered-text",
  partial: "bg-partial-bg text-partial-text",
  gap: "bg-gap-bg text-gap-text",
};
const LABEL: Record<MatchState, string> = { covered: "Covered", partial: "Partial", gap: "Gap" };

export function MatchPanel({ match }: { match: MatchResult }) {
  const total = match.items.length || 1;
  return (
    <section aria-label="Requirements match" className="card flex flex-col gap-3.5 p-[18px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[18px]">How you match</h2>
        <span className="num text-[13px] text-muted">{match.items.length} requirements</span>
      </div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {(["covered", "partial", "gap"] as const).map((s) =>
          match.counts[s] ? <span key={s} className={s === "covered" ? "bg-covered" : s === "partial" ? "bg-partial" : "bg-gap"} style={{ flex: match.counts[s] / total }} /> : null,
        )}
      </div>
      <p className="m-0 flex gap-3.5 text-[12px] text-muted">
        <span><b className="text-covered-text">{match.counts.covered}</b> covered</span>
        <span><b className="text-partial-text">{match.counts.partial}</b> partial</span>
        <span><b className="text-gap-text">{match.counts.gap}</b> gaps</span>
      </p>
      <ul className="m-0 flex list-none flex-col p-0">
        {match.items.map((r) => (
          <li key={r.requirementId} className="flex flex-col gap-1 border-t border-line-soft py-2.5">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">
                {r.text}
                {!r.mustHave && <span className="ml-1.5 text-[12px] font-normal text-subtle">(nice to have)</span>}
              </span>
              <span className={`shrink-0 rounded-[var(--radius-tag)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] ${CHIP[r.state]}`}>
                {LABEL[r.state]}
              </span>
            </div>
            <span className="text-[12px] text-subtle">{r.note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
