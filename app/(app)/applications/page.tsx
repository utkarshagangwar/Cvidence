import type { Metadata } from "next";
import Link from "next/link";
import { Board, type BoardItem } from "@/components/applications/Board";
import { StatusSelect } from "@/components/applications/StatusSelect";
import { EmptyState, PageHeader } from "@/components/shell/EmptyState";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Applications" };

const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view === "table" ? "table" : "board";
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("applications")
    .select("id, title, company, location, status, match, updated_at")
    .order("updated_at", { ascending: false })
    .limit(300);
  const rows = (data ?? []) as Array<{ id: string; title: string; company: string; location: string; status: string; match: { counts?: Record<string, number> } | null; updated_at: string }>;
  const items: Array<BoardItem & { location: string }> = rows.map((a) => {
    const c = a.match?.counts;
    const total = c ? (c.covered ?? 0) + (c.partial ?? 0) + (c.gap ?? 0) : null;
    return { id: a.id, title: a.title, company: a.company, location: a.location, status: a.status, covered: c ? (c.covered ?? 0) : null, total, updated_at: a.updated_at };
  });

  return (
    <>
      <PageHeader
        title="Applications"
        intro="Every job you're working on, from draft to offer. Drag a card or change its status; each move is dated for your dashboard."
        actions={<Link href="/applications/new" className="btn btn-primary press">Paste a job description</Link>}
      />
      {items.length === 0 ? (
        <EmptyState
          title="No applications yet"
          body="Paste a job description, or start one from Find Jobs. Cvidence shows how you match, then drafts a resume where every line points back to your profile."
          action={{ href: "/applications/new", label: "Paste a job description" }}
        />
      ) : (
        <>
          <div className="flex">
            <nav aria-label="Layout" className="grid w-full max-w-[280px] grid-cols-2 rounded-[var(--radius-control)] border border-line bg-well p-1">
              {(["board", "table"] as const).map((v) => (
                <Link
                  key={v}
                  href={v === "board" ? "/applications" : "/applications?view=table"}
                  aria-current={view === v ? "page" : undefined}
                  className={`rounded-[4px] px-2 py-1.5 text-center text-[13px] font-medium no-underline ${view === v ? "bg-sheet text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                >
                  {v === "board" ? "Board" : "Table"}
                </Link>
              ))}
            </nav>
          </div>

          {view === "board" ? (
            <Board items={items} />
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full border-collapse text-left text-[14px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.06em] text-subtle">
                    <th scope="col" className="px-4 py-3 font-semibold">Role</th>
                    <th scope="col" className="hidden px-4 py-3 text-right font-semibold sm:table-cell">Covered</th>
                    <th scope="col" className="hidden px-4 py-3 font-semibold md:table-cell">Updated</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id} className="border-t border-line-soft align-middle">
                      <td className="px-4 py-3">
                        <Link href={`/applications/${a.id}`} className="flex flex-col text-ink no-underline hover:text-teal">
                          <span className="font-semibold [overflow-wrap:anywhere]">{a.title || "Untitled role"}</span>
                          <span className="text-[13px] text-muted [overflow-wrap:anywhere]">{[a.company, a.location].filter(Boolean).join(" · ")}</span>
                        </Link>
                      </td>
                      <td className="num hidden px-4 py-3 text-right text-muted sm:table-cell">{a.total ? `${a.covered}/${a.total}` : "–"}</td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-muted md:table-cell">{when(a.updated_at)}</td>
                      <td className="px-4 py-3">
                        <StatusSelect applicationId={a.id} status={a.status} compact label={`Status of ${a.title || "application"}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
