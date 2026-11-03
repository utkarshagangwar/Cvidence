import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/EmptyState";
import { yearsOfExperience } from "@/lib/match/classify";
import { loadProfile } from "@/lib/profile/load";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NewApplicationForm } from "./NewApplicationForm";

export const metadata: Metadata = { title: "New application" };

// "QA Engineer | Manual Testing | Web" -> "QA Engineer": the role part of the headline.
const roleFromHeadline = (h: string) => h.split(/\s[|·•–-]\s|[|·•]/)[0]?.trim().slice(0, 120) ?? "";

function levelFor(years: number) {
  if (years < 2) return "entry" as const;
  if (years < 5) return "mid" as const;
  if (years < 8) return "senior" as const;
  return "lead" as const;
}

export default async function NewApplicationPage() {
  const supabase = await createSupabaseServerClient();
  const profile = await loadProfile(supabase).catch(() => null);
  const defaultRole = profile ? roleFromHeadline(profile.basics.headline) || profile.experiences[0]?.title || "" : "";
  const defaultLevel = profile ? levelFor(yearsOfExperience(profile)) : "mid";

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-subtle">
          <Link href="/applications">Applications</Link> / New
        </span>
        <PageHeader title="Paste a job description" intro="Cvidence reads it, lists every requirement, and checks each one against your profile. No posting yet? Have AI write a typical one for your target role." />
      </div>
      <NewApplicationForm defaultRole={defaultRole} defaultLevel={defaultLevel} />
    </>
  );
}
