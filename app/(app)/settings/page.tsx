import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/EmptyState";
import { AgentSettingsForm } from "@/components/settings/AgentSettingsForm";
import { DataControls } from "@/components/settings/DataControls";
import { parseAgentSettings } from "@/lib/agent/settings";
import { emailConfigured } from "@/lib/email/resend";
import { serverEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const [agent, run, profile] = await Promise.all([
    supabase.from("agent_settings").select("*").maybeSingle(),
    supabase.from("agent_runs").select("day, state, found, scored, drafted, note").order("day", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("profiles").select("consented_at").maybeSingle(),
  ]);

  return (
    <>
      <PageHeader title="Settings" />
      <section className="card flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-[18px]">Account</h2>
          <p className="m-0 text-ink-2">
            Signed in as <b className="font-semibold">{user?.email ?? "unknown"}</b>
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn btn-secondary">
            Sign out
          </button>
        </form>
      </section>
      <AgentSettingsForm initial={parseAgentSettings(agent.data)} emailReady={emailConfigured()} lastRun={run.data ?? null} dailyCredits={serverEnv().AI_DAILY_CREDITS} />
      <DataControls consentedAt={(profile.data?.consented_at as string | null) ?? null} />
    </>
  );
}
