import { creditsLeft } from "@/lib/quota/credits";

export function CreditsWidget({ used, limit }: { used: number; limit: number }) {
  const left = creditsLeft(used, limit);
  const pct = limit > 0 ? Math.round((left / limit) * 100) : 0;

  return (
    <div className="card flex flex-col gap-2 p-3">
      <div className="flex justify-between text-[12px] text-muted">
        <span id="credits-label">AI credits today</span>
        <span className="num text-ink">
          {left} / {limit}
        </span>
      </div>
      <div
        role="meter"
        aria-labelledby="credits-label"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={left}
        aria-valuetext={`${left} of ${limit} credits left`}
        className="h-1.5 overflow-hidden rounded-[3px] bg-track"
      >
        <div className="h-1.5 bg-teal" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[12px] text-subtle">Resets at midnight IST</div>
    </div>
  );
}
