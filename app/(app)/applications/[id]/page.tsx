import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LetterWorkspace } from "@/components/applications/LetterWorkspace";
import { MatchPanel } from "@/components/applications/MatchPanel";
import { NotesPanel } from "@/components/applications/NotesPanel";
import { RefineChat } from "@/components/applications/RefineChat";
import { RematchButton } from "@/components/applications/RematchButton";
import { ResumeWorkspace } from "@/components/applications/ResumeWorkspace";
import { ReviewBanner } from "@/components/applications/ReviewBanner";
import { StatusSelect } from "@/components/applications/StatusSelect";
import { listChat, listNotes } from "@/lib/applications/documents";
import { getApplication, getDocument, listVersions, type DocKind } from "@/lib/applications/service";
import type { LetterDoc } from "@/lib/letters/types";
import { loadProfile } from "@/lib/profile/load";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ResumeUnits } from "@/lib/tailor/frame";

export const metadata: Metadata = { title: "Application" };

const TABS: Array<[DocKind, string]> = [
  ["resume", "Resume"],
  ["cover", "Cover Letter"],
  ["email", "Email"],
];

export default async function ApplicationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { doc: docParam } = await searchParams;
  const kind: DocKind = (["resume", "cover", "email"] as const).find((k) => k === docParam) ?? "resume";

  const supabase = await createSupabaseServerClient();
  const app = await getApplication(supabase, id);
  if (!app) notFound();

  const [doc, profile, chat, notes] = await Promise.all([
    getDocument<ResumeUnits | LetterDoc>(supabase, id, kind),
    loadProfile(supabase),
    listChat(supabase, id, kind),
    listNotes(supabase, id),
  ]);
  const versions = doc ? await listVersions(supabase, doc.id) : [];
  const hasProfileContent = profile.experiences.length + profile.projects.length > 0;
  const fileBase = `${profile.basics.name || "resume"} ${app.company || ""}`.trim().replace(/[^A-Za-z0-9 _-]/g, "").replace(/\s+/g, "_") || "resume";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[12px] text-subtle">
            <Link href="/applications">Applications</Link> / {app.company || "Job"}
          </span>
          <h1 className="m-0 text-[30px] leading-[1.15] tracking-[-0.01em]">{app.title || "Untitled role"}</h1>
          <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-muted">
            {app.company && <span>{app.company}</span>}
            {app.location && <span>{app.location}</span>}
          </p>
        </div>
        <StatusSelect applicationId={id} status={app.status} />
      </div>

      {app.awaiting_review && <ReviewBanner applicationId={id} score={app.agent_score} />}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          {app.match ? (
            <MatchPanel match={app.match} />
          ) : (
            <section className="card flex flex-col gap-2 p-5">
              <h2 className="m-0 text-[18px]">How you match</h2>
              <p className="m-0 text-ink-2">The match didn’t finish. Run it again.</p>
            </section>
          )}
          <RematchButton applicationId={id} />
          <NotesPanel applicationId={id} notes={notes} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <nav aria-label="Documents" className="grid w-full grid-cols-3 rounded-[var(--radius-control)] border border-line bg-well p-1 sm:max-w-[420px]">
            {TABS.map(([k, label]) => (
              <Link
                key={k}
                href={k === "resume" ? `/applications/${id}` : `/applications/${id}?doc=${k}`}
                aria-current={kind === k ? "page" : undefined}
                className={`rounded-[4px] px-2 py-1.5 text-center text-[13px] font-medium no-underline ${kind === k ? "bg-sheet text-ink shadow-sm" : "text-muted hover:text-ink"}`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {kind === "resume" ? (
            <ResumeWorkspace
              applicationId={id}
              data={doc ? { ...(doc.units as ResumeUnits), flags: doc.flags } : null}
              versions={versions}
              currentVersion={doc?.current_version ?? 0}
              fileBase={fileBase}
              hasProfileContent={hasProfileContent}
            />
          ) : (
            <LetterWorkspace
              key={kind}
              applicationId={id}
              kind={kind}
              data={doc ? { ...(doc.units as LetterDoc), flags: doc.flags } : null}
              versions={versions}
              currentVersion={doc?.current_version ?? 0}
              hasProfileContent={hasProfileContent}
            />
          )}

          <RefineChat key={`chat-${kind}`} applicationId={id} kind={kind} messages={chat} hasDocument={Boolean(doc)} />
        </div>
      </div>
    </>
  );
}
