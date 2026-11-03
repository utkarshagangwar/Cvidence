import type { Metadata } from "next";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { PageHeader } from "@/components/shell/EmptyState";
import { loadProfile } from "@/lib/profile/load";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const profile = await loadProfile(supabase);

  return (
    <>
      <PageHeader
        title="Master profile"
        intro="The single source for every resume, cover letter and email. Cvidence only uses what's here."
      />
      <ProfileEditor initial={profile} />
    </>
  );
}
