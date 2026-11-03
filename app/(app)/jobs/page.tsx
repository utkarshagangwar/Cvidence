import type { Metadata } from "next";
import Link from "next/link";
import { JobFilters } from "@/components/jobs/JobFilters";
import { JobList, ScoreButton } from "@/components/jobs/JobList";
import { EmptyState, PageHeader } from "@/components/shell/EmptyState";
import { searchSchema } from "@/lib/jobs/prefilter";
import { ADAPTERS } from "@/lib/jobs/registry";
import { searchPostings } from "@/lib/jobs/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Find jobs" };

const VIEWS = [
  ["all", "All Jobs"],
  ["saved", "Saved"],
  ["dismissed", "Dismissed"],
] as const;

const fmt = (n: number) => n.toLocaleString("en-IN");

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const f = searchSchema.parse(raw);
  const supabase = await createSupabaseServerClient();
  const result = await searchPostings(supabase, f);

  let nothingFetched = false;
  if (f.view === "all" && result.funnel.found === 0) {
    const { count } = await supabase.from("postings").select("id", { count: "exact", head: true });
    nothingFetched = (count ?? 0) === 0;
  }

  const boards = ADAPTERS.map((a) => ({ id: a.id, label: a.label }));
  const boardLabels = Object.fromEntries(boards.map((b) => [b.id, b.label]));
  const viewHref = (v: string) => {
    const p = new URLSearchParams();
    for (const [k, val] of Object.entries(raw)) {
      if (k === "view" || val === undefined) continue;
      for (const one of Array.isArray(val) ? val : [val]) p.append(k, one);
    }
    if (v !== "all") p.set("view", v);
    const qs = p.toString();
    return qs ? `/jobs?${qs}` : "/jobs";
  };

  return (
    <>
      <PageHeader
        title="Find jobs"
        intro="Openings from company career boards, refreshed every 6 hours. Filtering is free; scoring uses 1 credit per 8 jobs."
        actions={<Link href="/jobs/sources" className="btn btn-secondary press">Board Status</Link>}
      />

      <div className="flex">
      <nav aria-label="Job lists" className="grid w-full max-w-[420px] grid-cols-3 rounded-[var(--radius-control)] border border-line bg-well p-1">
        {VIEWS.map(([v, label]) => (
          <Link
            key={v}
            href={viewHref(v)}
            aria-current={f.view === v ? "page" : undefined}
            className={`rounded-[4px] px-2 py-1.5 text-center text-[13px] font-medium no-underline ${f.view === v ? "bg-sheet text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      </div>

      {f.view === "all" && <JobFilters f={f} boards={boards} />}

      {nothingFetched ? (
        <EmptyState
          title="No jobs fetched yet"
          body="Cvidence pulls postings from company career boards every 6 hours. The first fetch hasn't run on this server yet."
          action={{ href: "/applications/new", label: "Paste a job description instead" }}
          note="Board Status shows which boards are set up and when each was last checked."
        />
      ) : (
        <>
          {f.view === "all" && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-ink-2" aria-label="Search funnel">
                <span><b className="num font-semibold text-ink">{fmt(result.funnel.found)}</b> found</span>
                <span aria-hidden="true" className="text-subtle">→</span>
                <span><b className="num font-semibold text-ink">{fmt(result.funnel.afterFilters)}</b> after filters</span>
                <span aria-hidden="true" className="text-subtle">→</span>
                <span><b className="num font-semibold text-ink">{fmt(result.funnel.scored)}</b> scored</span>
                {result.truncated && <span className="text-[12px] text-subtle">(newest 3,000 checked; narrow the dates to see older ones)</span>}
              </p>
              <ScoreButton ids={result.unscoredIds} />
            </div>
          )}

          {result.items.length === 0 ? (
            f.view === "saved" ? (
              <EmptyState title="No saved jobs" body="Press Save on any job to keep it here, even after it drops out of your search." action={{ href: "/jobs", label: "Back to all jobs" }} />
            ) : f.view === "dismissed" ? (
              <EmptyState title="Nothing dismissed" body="Jobs you dismiss are hidden from your search and listed here, in case you change your mind." />
            ) : (
              <EmptyState
                title="No jobs match these filters"
                body="Try a broader role (for example QA instead of QA automation), a longer date range, or Anywhere as the region."
                action={{ href: "/jobs", label: "Clear filters" }}
              />
            )
          ) : (
            <>
              <JobList items={result.items} boardLabels={boardLabels} />
              {result.funnel.afterFilters > result.items.length && (
                <p className="m-0 text-[13px] text-subtle">
                  Showing the top {result.items.length} of {fmt(result.funnel.afterFilters)}. Scored jobs come first; narrow the search to see others.
                </p>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
