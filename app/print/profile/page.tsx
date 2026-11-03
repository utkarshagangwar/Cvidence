import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PrintButton } from "@/components/resume/PrintButton";
import { ResumeSheet } from "@/components/resume/ResumeSheet";
import { profileToResume } from "@/lib/export/profile-resume";
import { loadProfile } from "@/lib/profile/load";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Resume", robots: { index: false } };
export const dynamic = "force-dynamic";

// The saved master profile as a clean page for "Save as PDF".
export default async function PrintProfile() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const profile = await loadProfile(supabase);

  return (
    <main className="mx-auto max-w-[820px] px-4 py-8 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="m-0 text-[13px] text-muted">In the print window, choose “Save as PDF” as the printer.</p>
        <PrintButton />
      </div>
      <ResumeSheet data={profileToResume(profile)} />
    </main>
  );
}
