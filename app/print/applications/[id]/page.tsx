import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ResumeSheet } from "@/components/resume/ResumeSheet";
import { getResumeDocument } from "@/lib/applications/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "Resume", robots: { index: false } };
export const dynamic = "force-dynamic";

// A clean page for "Save as PDF": no app chrome, no tags, real selectable text.
export default async function PrintResume({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const doc = await getResumeDocument(supabase, id);
  if (!doc) notFound();

  return (
    <main className="mx-auto max-w-[820px] px-4 py-8 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="m-0 text-[13px] text-muted">In the print window, choose “Save as PDF” as the printer.</p>
        <PrintButton />
      </div>
      <ResumeSheet data={{ ...doc.units, flags: doc.flags }} />
    </main>
  );
}
