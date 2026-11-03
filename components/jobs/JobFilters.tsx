import type { SearchFilters } from "@/lib/jobs/prefilter";

// A plain GET form: filters live in the URL, so a search can be bookmarked or
// shared, and it works before any JavaScript loads.

const DAYS = [
  [1, "Last 24 Hours"],
  [3, "Last 3 Days"],
  [7, "Last Week"],
  [14, "Last 2 Weeks"],
  [30, "Last 30 Days"],
  [60, "Last 60 Days"],
] as const;

const LEVELS = [
  ["intern", "Intern"],
  ["senior", "Senior"],
  ["lead", "Lead"],
  ["staff", "Staff"],
  ["principal", "Principal"],
  ["manager", "Manager"],
  ["director", "Director"],
] as const;

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: ReadonlyArray<readonly [string | number, string]> }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <select name={name} defaultValue={value} className="field">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function JobFilters({ f, boards }: { f: SearchFilters; boards: Array<{ id: string; label: string }> }) {
  return (
    <form method="get" action="/jobs" className="card flex flex-col gap-4 p-5" aria-label="Search jobs">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="flex min-w-0 flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
          <span className="text-[13px] font-medium text-ink-2">Role</span>
          <input name="q" defaultValue={f.q} className="field" placeholder="e.g. sdet, qa automation" maxLength={120} aria-describedby="q-help" />
          <span id="q-help" className="text-[12px] text-subtle">Commas mean "or". Short forms like SDE, QA and SDET include their spelled-out titles.</span>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">City</span>
          <input name="location" defaultValue={f.location} className="field" placeholder="e.g. Bengaluru" maxLength={80} />
        </label>
        <Select name="where" label="Region" value={f.where} options={[["india", "India and Open Remote"], ["anywhere", "Anywhere"]]} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select name="remote" label="Work Mode" value={f.remote} options={[["any", "Any"], ["remote", "Remote Only"], ["onsite", "Office or Hybrid"]]} />
        <Select name="days" label="Posted" value={String(f.days)} options={DAYS} />
        <Select name="source" label="Board" value={f.source} options={[["", "All Boards"], ...boards.map((b) => [b.id, b.label] as const)]} />
      </div>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-[13px] font-medium text-ink-2">Hide Levels</legend>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map(([v, l]) => (
            <label key={v} className="cursor-pointer">
              <input type="checkbox" name="exclude" value={v} defaultChecked={f.exclude.includes(v)} className="peer sr-only" />
              <span className="inline-flex h-8 items-center rounded-full border border-line-strong bg-sheet px-3 text-[13px] text-ink-2 transition-colors peer-checked:border-teal peer-checked:bg-teal-tint peer-checked:text-teal-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal">
                {l}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {f.view !== "all" && <input type="hidden" name="view" value={f.view} />}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary press">Search</button>
        <a href="/jobs" className="text-[13px] font-medium text-teal hover:underline">Clear filters</a>
      </div>
    </form>
  );
}
