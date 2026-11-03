"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { agentSettingsSchema } from "@/lib/agent/settings";
import { CONSENT_VERSION } from "@/lib/consent";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SettingsState = { status: "ok" } | { status: "error"; message: string };

export async function saveAgentSettingsAction(input: unknown): Promise<SettingsState> {
  const parsed = agentSettingsSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Some settings weren't valid. Check them and try again." };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { status: "error", message: "Your session ended. Sign in again." };
  const s = parsed.data;
  const { error } = await supabase
    .from("agent_settings")
    .upsert({ user_id: data.user.id, enabled: s.enabled, filters: s.filters, threshold: s.threshold, max_drafts: s.max_drafts, digest: s.digest }, { onConflict: "user_id" });
  if (error) return { status: "error", message: "Couldn't save your agent settings. Try again." };
  revalidatePath("/settings");
  return { status: "ok" };
}

export async function recordConsentAction(): Promise<SettingsState> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { status: "error", message: "Your session ended. Sign in again." };
  const { error } = await supabase.from("profiles").update({ consented_at: new Date().toISOString(), consent_version: CONSENT_VERSION }).eq("user_id", data.user.id);
  if (error) return { status: "error", message: "Couldn't save that. Try again." };
  revalidatePath("/", "layout");
  return { status: "ok" };
}

/** Withdrawing consent stops every AI step (and the daily agent) until given again. */
export async function withdrawConsentAction(): Promise<SettingsState> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { status: "error", message: "Your session ended. Sign in again." };
  const [a, b] = await Promise.all([
    supabase.from("profiles").update({ consented_at: null, consent_version: null }).eq("user_id", data.user.id),
    supabase.from("agent_settings").update({ enabled: false }).eq("user_id", data.user.id),
  ]);
  if (a.error || b.error) return { status: "error", message: "Couldn't save that. Try again." };
  revalidatePath("/", "layout");
  return { status: "ok" };
}

/** Deletes the account. Every user table cascades from auth.users, so all data goes with it. */
export async function deleteAccountAction(confirmText: string): Promise<SettingsState> {
  if (confirmText.trim() !== "DELETE") return { status: "error", message: 'Type DELETE in capitals to confirm.' };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { status: "error", message: "Your session ended. Sign in again." };
  const userId = data.user.id;
  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(userId);
  if (error) return { status: "error", message: "Couldn't delete your account. Try again, or contact us." };
  console.info(JSON.stringify({ event: "account.deleted", userId, at: new Date().toISOString() }));
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
