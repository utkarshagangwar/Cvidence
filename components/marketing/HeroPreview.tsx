// A live, scaled-down copy of the Casefile resume view (not a screenshot).
// On load, each line gets its source tag in turn, then one unbacked claim is
// flagged: the product's whole promise, shown in three seconds.
// Example data only; labelled as such.

const LINES = [
  { text: "Built a Selenium and Python suite on the Page Object Model for the shipment-tracking web app.", src: "R1" },
  { text: "Wrote Robot Framework keyword libraries reused by 3 product teams.", src: "R1" },
  { text: "Ran Robot Framework suites on every pull request with GitHub Actions.", src: "P1" },
];

export function HeroPreview() {
  return (
    <figure className="hero-preview relative m-0" aria-label="Example: a tailored resume where each line shows its source">
      <div className="card overflow-hidden bg-sheet shadow-[0_1px_2px_rgb(22_32_29/0.06),0_24px_60px_-20px_rgb(15_92_85/0.28)]">
        <div className="flex items-center justify-between gap-3 border-b border-line-soft bg-surface px-5 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-semibold">QA Automation Engineer II</span>
            <span className="truncate text-[12px] text-muted">Kitebird Payments · Bengaluru</span>
          </div>
          <span className="hp-match num shrink-0 rounded-[var(--radius-tag)] bg-teal-tint px-2 py-1 text-[12px] text-teal">
            7 of 9 matched
          </span>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5 font-display text-ink sm:px-7">
          <div className="flex flex-col gap-0.5">
            <span className="text-[20px] font-semibold tracking-[-0.01em]">Riya Sharma</span>
            <span className="font-sans text-[12px] text-muted">QA Automation Engineer · Bengaluru</span>
          </div>

          <div className="flex flex-col gap-2">
            <span className="border-b border-line-soft pb-1 font-sans text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
              Experience
            </span>
            <ul className="m-0 flex list-disc flex-col gap-2 pl-4 text-[13.5px] leading-[1.5]">
              {LINES.map((l, i) => (
                <li key={l.text} className="hp-line" style={{ "--i": i } as React.CSSProperties}>
                  {l.text}{" "}
                  <span className="hp-tag num inline-block rounded-[3px] bg-teal-tint px-1.5 text-[11px] text-teal">{l.src}</span>
                </li>
              ))}
              <li className="hp-line hp-flagged" style={{ "--i": LINES.length } as React.CSSProperties}>
                <span className="hp-underline">Cut regression time by 40% with parallel runs.</span>{" "}
                <span className="hp-check inline-block rounded-[3px] bg-partial-bg px-1.5 font-sans text-[11px] font-semibold text-partial-text">
                  Check: “40%” isn’t in your profile
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-[12px] text-subtle">Example resume. R1 and P1 point to a role and a project in the profile.</figcaption>
    </figure>
  );
}
