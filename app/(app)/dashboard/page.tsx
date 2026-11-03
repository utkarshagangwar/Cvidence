import type { Metadata } from "next";
import Link from "next/link";
import { WeeklyBars } from "@/components/dashboard/WeeklyBars";
import { EmptyState, PageHeader } from "@/components/shell/EmptyState";
import { scoreProfile } from "@/lib/ats/score";
import { loadDashboard } from "@/lib/dashboard";
import { loadProfile } from "@/lib/profile/load";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

const STAGES = [
  ["draft", "Drafted"],
  ["applied", "Applied"],
  ["interview", "Interview"],
  ["offer", "Offer"],
] as const;

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const [profile, dash, apps, review] = await Promise.all([
    loadProfile(supabase),
    loadDashboard(supabase),
    supabase.from("applications").select("id, title, company, status, updated_at").order("updated_at", { ascending: false }).limit(5),
    supabase.from("applications").select("id, title, company, agent_score").eq("awaiting_review", true).order("agent_score", { ascending: false, nullsFirst: false }).limit(10),
  ]);
  const recent = (apps.data ?? []) as Array<{ id: string; title: string; company: string; status: string }>;
  const queue = (review.data ?? []) as Array<{ id: string; title: string; company: string; agent_score: number | null }>;
  const firstName = profile.basics.name.trim().split(/\s+/)[0];
  const hasContent = profile.experiences.length + profile.projects.length > 0;
  const ats = scoreProfile(profile).score;
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date());

  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-subtle">{today}</span>
        <PageHeader
          title={firstName ? `Welcome, ${firstName}` : "Welcome to Cvidence"}
          actions={hasContent ? <Link href="/applications/new" className="btn btn-primary press">Paste a job description</Link> : undefined}
        />
      </div>

      {!hasContent ? (
        <EmptyState
          title="Start with your master profile"
          body="Cvidence writes every resume line from your profile and shows where each one came from. Import a resume file or fill it in by hand."
          action={{ href: "/profile", label: "Set up your profile" }}
        />
      ) : (
        <>
          {queue.length > 0 && (
            <section className="card flex flex-col p-0" aria-labelledby="review-h">
              <div className="flex flex-col gap-0.5 px-5 pb-2 pt-5">
                <h2 id="review-h" className="m-0 text-[18px]">Ready for your review</h2>
                <p className="m-0 text-[13px] text-muted">Drafted by your daily agent. Nothing has been sent; check each one before you apply.</p>
              </div>
              <ul className="m-0 list-none p-0">
                {queue.map((a) => (
                  <li key={a.id} className="border-t border-line-soft">
                    <Link href={`/applications/${a.id}`} className="flex items-center gap-3 px-5 py-3 text-ink no-underline hover:bg-sheet">
                      {a.agent_score !== null && (
                        <span className={`num flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[13px] font-semibold ${a.agent_score >= 70 ? "bg-covered-bg text-covered-text" : "bg-partial-bg text-partial-text"}`}>{a.agent_score}</span>
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{a.title || "Untitled role"}</span>
                        <span className="truncate text-[13px] text-muted">{a.company}</span>
                      </span>
                      <span className="text-[13px] font-medium text-teal">Review</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Funnel: a row of numbers, not a chart. Each stage counts applications that ever reached it. */}
          <section className="card p-0" aria-labelledby="funnel-h">
            <h2 id="funnel-h" className="sr-only">Your funnel</h2>
            <ol className="m-0 grid list-none grid-cols-2 p-0 sm:grid-cols-4">
              {STAGES.map(([key, label], i) => {
                const n = dash.funnel.reached[key];
                const prev = i > 0 ? dash.funnel.reached[STAGES[i - 1]![0]] : null;
                const rate = prev ? Math.round((n / prev) * 100) : null;
                return (
                  <li key={key} className="flex flex-col gap-0.5 border-line-soft px-5 py-4 max-sm:[&:nth-child(n+3)]:border-t sm:[&:not(:first-child)]:border-l max-sm:[&:nth-child(even)]:border-l">
                    <span className="text-[13px] text-muted">{label}</span>
                    <span className="num text-[28px] leading-tight text-ink">{n}</span>
                    <span className="text-[12px] text-subtle">{rate === null ? (dash.funnel.closed ? `${dash.funnel.closed} closed` : " ") : `${rate}% of ${STAGES[i - 1]![1].toLowerCase()}`}</span>
                  </li>
                );
              })}
            </ol>
          </section>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-w-0 flex-col gap-5">
              <WeeklyBars weeks={dash.weekly} />

              <section className="card flex flex-col p-0" aria-labelledby="recent-h">
                <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
                  <h2 id="recent-h" className="m-0 text-[18px]">Recent applications</h2>
                  <Link href="/applications" className="text-[13px]">See all</Link>
                </div>
                {recent.length === 0 ? (
                  <p className="m-0 px-5 pb-5 text-ink-2">
                    Nothing yet. <Link href="/applications/new">Paste a job description</Link> or <Link href="/jobs">find a job</Link>.
                  </p>
                ) : (
                  <ul className="m-0 list-none p-0">
                    {recent.map((a) => (
                      <li key={a.id} className="border-t border-line-soft">
                        <Link href={`/applications/${a.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-ink no-underline hover:bg-sheet">
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{a.title || "Untitled role"}</span>
                            <span className="truncate text-[13px] text-muted">{a.company}</span>
                          </span>
                          <span className="rounded-[4px] bg-track px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-2">{a.status}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="flex min-w-0 flex-col gap-5">
              <section className="card flex flex-col gap-2 p-5" aria-labelledby="worth-h">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="worth-h" className="m-0 text-[17px]">Worth a look</h2>
                  <Link href="/jobs" className="text-[13px]">Find jobs</Link>
                </div>
                {dash.worth.length === 0 ? (
                  <p className="m-0 text-[13px] text-ink-2">Score jobs on Find Jobs and the best fits you haven't applied to show up here.</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col p-0">
                    {dash.worth.map((w) => (
                      <li key={w.postingId} className="flex items-start gap-3 border-t border-line-soft py-2.5 first:border-t-0">
                        <span className={`num flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[13px] font-semibold ${w.score >= 70 ? "bg-covered-bg text-covered-text" : "bg-partial-bg text-partial-text"}`}>{w.score}</span>
                        <span className="flex min-w-0 flex-col">
                          <span className="text-[14px] font-medium leading-snug [overflow-wrap:anywhere]">{w.title}</span>
                          <span className="text-[12.5px] text-muted [overflow-wrap:anywhere]">{[w.company, w.location].filter(Boolean).join(" · ")}</span>
                          {w.reason && <span className="text-[12px] text-subtle [overflow-wrap:anywhere]">{w.reason}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card flex flex-col gap-2 p-5" aria-labelledby="ats-h">
                <div className="flex items-baseline justify-between">
                  <h2 id="ats-h" className="m-0 text-[17px]">Profile readiness</h2>
                  <span className="num text-[22px]">{ats}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-[3px] bg-track" aria-hidden="true">
                  <div className="h-1.5 bg-teal" style={{ width: `${ats}%` }} />
                </div>
                <Link href="/profile" className="text-[13px]">Improve your profile</Link>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
