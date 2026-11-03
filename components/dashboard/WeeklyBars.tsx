// Applications sent per week: one series, so one hue and no legend; the title
// names it. Each bar has a hover tooltip; a hidden table carries the data
// for screen readers.

const fmtWeek = (t: number) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(t));

export function WeeklyBars({ weeks }: { weeks: Array<{ weekStart: number; count: number }> }) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const total = weeks.reduce((n, w) => n + w.count, 0);
  const last = weeks.at(-1);

  return (
    <section className="card flex flex-col gap-3 p-5" aria-labelledby="weekly-h">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="weekly-h" className="m-0 text-[17px]">Applications sent per week</h2>
        <span className="text-[13px] text-muted"><b className="num font-semibold text-ink">{total}</b> in 8 weeks</span>
      </div>

      <div className="relative" aria-hidden="true">
        {/* Recessive grid: just the baseline and a top line at the max. */}
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-line-soft" />
        <span className="num absolute -top-2 right-0 bg-sheet pl-1 text-[10.5px] text-subtle">{max}</span>
        <div className="flex h-[120px] items-end gap-[2px] border-b border-line pt-3">
          {weeks.map((w, i) => {
            const h = w.count === 0 ? 0 : Math.max(6, Math.round((w.count / max) * 104));
            return (
              <div key={w.weekStart} className="group relative flex h-full flex-1 items-end justify-center">
                {/* Hit target is the whole column, bigger than the bar. */}
                <div className={`w-full max-w-[34px] rounded-t-[4px] ${i === weeks.length - 1 ? "bg-teal" : "bg-teal/70"} group-hover:bg-teal group-focus-visible:bg-teal`} style={{ height: `${h}px` }} />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-control)] bg-ink px-2 py-1 text-[12px] text-paper shadow-md group-hover:block">
                  {fmtWeek(w.weekStart)}: <span className="num">{w.count}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-[2px]">
          {weeks.map((w, i) => (
            <span key={w.weekStart} className="flex-1 text-center text-[10.5px] text-subtle">
              {i === 0 || i === weeks.length - 1 || i === 3 ? fmtWeek(w.weekStart) : ""}
            </span>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <p className="m-0 text-[13px] text-subtle">Move an application to Applied and it shows up here.</p>
      ) : (
        last && <p className="m-0 text-[13px] text-muted">This week: <span className="num text-ink">{last.count}</span></p>
      )}

      {/* sr-only goes on a wrapper: tables ignore its 1px size and can widen the page. */}
      <div className="sr-only">
      <table>
        <caption>Applications moved to Applied, per week starting Monday</caption>
        <thead>
          <tr>
            <th scope="col">Week of</th>
            <th scope="col">Applications</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.weekStart}>
              <td>{fmtWeek(w.weekStart)}</td>
              <td>{w.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
