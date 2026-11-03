import { redirect } from "next/navigation";
import { ConsentCard } from "@/components/shell/ConsentCard";
import { CreditsWidget } from "@/components/shell/CreditsWidget";
import { PhoneBars, Sidebar } from "@/components/shell/Sidebar";
import { creditsLeft } from "@/lib/quota/credits";
import { readCreditsUsed } from "@/lib/quota/ledger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const [credits, consent, paused] = await Promise.all([
    readCreditsUsed(supabase, data.user.id),
    supabase.from("profiles").select("consented_at").eq("user_id", data.user.id).maybeSingle(),
    supabase.rpc("ai_status"),
  ]);
  // If the consent column can't be read, show the card: asking again is the safe side.
  const needsConsent = !consent.data?.consented_at;

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <Sidebar credits={<CreditsWidget used={credits.used} limit={credits.limit} />} />
      <PhoneBars creditsLeft={creditsLeft(credits.used, credits.limit)} creditsLimit={credits.limit} />
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pb-28 pt-6 outline-none md:px-8 md:pb-12 md:pt-8">
        {/* One column for every page: headers and cards share its edges. */}
        <div data-page className="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
          {paused.data === true && (
            <p role="status" className="m-0 rounded-[var(--radius-card)] bg-partial-bg px-4 py-3 text-[14px] text-partial-text">
              AI is paused until midnight IST because today's shared budget is used up. Search, the tracker, your profile and exports keep working.
            </p>
          )}
          {needsConsent && <ConsentCard />}
          {children}
        </div>
      </main>
    </div>
  );
}
