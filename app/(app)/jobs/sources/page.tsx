import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/EmptyState";
import { adapterLabel } from "@/lib/jobs/registry";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Board status" };

interface SourceRow {
  id: string;
  adapter: string;
  company: string;
  enabled: boolean;
  last_run_at: string | null;
  last_ok_at: string | null;
  last_count: number | null;
  zero_streak: number;
  flagged_at: string | null;
  last_error: string | null;
}

const when = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "Never";

function status(s: SourceRow): { label: string; tone: string; note: string } {
  if (!s.enabled) return { label: "Off", tone: "bg-track text-ink-2", note: "Switched off in the catalog" };
  if (s.flagged_at) return { label: "Check Board", tone: "bg-gap-bg text-gap-text", note: "No jobs three runs in a row. The company may have moved boards." };
  if (!s.last_run_at) return { label: "Waiting", tone: "bg-track text-ink-2", note: "Not fetched yet" };
  // Only plain-language reasons are shown: error codes stay in the server logs.
  if (s.last_error && (!s.last_ok_at || s.last_ok_at < s.last_run_at)) {
    const why = s.last_error.startsWith("RATE_LIMIT") ? "The board asked us to slow down; it retries later." : s.last_error.startsWith("NOT_FOUND") ? "Board not found." : s.last_error.startsWith("Missing env") ? "Needs an API key on the server." : "Last fetch failed; it retries on the next run.";
    return { label: "Retrying", tone: "bg-partial-bg text-partial-text", note: why };
  }
  if (s.zero_streak > 0) return { label: "Empty", tone: "bg-partial-bg text-partial-text", note: "No open jobs on the last run" };
  return { label: "OK", tone: "bg-covered-bg text-covered-text", note: "" };
}

export default async function SourcesPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("job_sources")
    .select("id, adapter, company, enabled, last_run_at, last_ok_at, last_count, zero_streak, flagged_at, last_error")
    .order("company");
  const rows = (data ?? []) as SourceRow[];
  const total = rows.reduce((n, r) => n + (r.last_count ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Board status"
        intro={`${rows.length} company boards, ${total.toLocaleString("en-IN")} open jobs on their last runs. Boards with no jobs three runs in a row are flagged each week.`}
        actions={<Link href="/jobs" className="btn btn-secondary press">Back to Find Jobs</Link>}
      />
      <div className="card overflow-x-auto p-0">
        <table className="w-full border-collapse text-left text-[14px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.06em] text-subtle">
              <th scope="col" className="px-4 py-3 font-semibold">Company</th>
              <th scope="col" className="hidden px-4 py-3 font-semibold sm:table-cell">Board</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Open Jobs</th>
              <th scope="col" className="hidden px-4 py-3 font-semibold md:table-cell">Last Checked</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const st = status(s);
              return (
                <tr key={s.id} className="border-t border-line-soft align-top">
                  <td className="px-4 py-3">
                    <span className="font-medium">{s.company}</span>
                    {/* On small screens the hidden columns move under the name. */}
                    <span className="mt-0.5 block text-[12px] text-subtle md:hidden">
                      <span className="sm:hidden">{adapterLabel(s.adapter)} · </span>
                      {when(s.last_run_at)}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-muted sm:table-cell">{adapterLabel(s.adapter)}</td>
                  <td className="num px-4 py-3 text-right">{s.last_count ?? "–"}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-muted md:table-cell">{when(s.last_run_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-[var(--radius-tag)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] ${st.tone}`}>{st.label}</span>
                    {st.note && <span className="mt-1 block text-[12px] text-subtle">{st.note}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
