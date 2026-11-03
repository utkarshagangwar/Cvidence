import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { QuotaError, type Ledger } from "@/lib/ai/run-task";
import { serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { istDay } from "./credits";

/** Ledger backed by the Postgres functions in 20261102000002_usage.sql. */
export function createSupabaseLedger(): Ledger {
  const env = serverEnv();
  const admin = createSupabaseAdminClient();

  return {
    async reserve(userId, task, credits) {
      const { data, error } = await admin.rpc("reserve_credits", {
        p_user_id: userId,
        p_task: task,
        p_credits: credits,
        p_daily_limit: env.AI_DAILY_CREDITS,
        p_default_cap: env.AI_DAILY_TOKEN_CAP,
      });
      if (error) {
        if (error.message.includes("NO_CREDITS")) throw new QuotaError("NO_CREDITS");
        if (error.message.includes("AI_PAUSED")) throw new QuotaError("AI_PAUSED");
        throw new Error("Could not reserve AI credits");
      }
      return data as string;
    },

    async commit(reservationId, meta) {
      const { error } = await admin.rpc("commit_usage", {
        p_id: reservationId,
        p_provider: meta.provider,
        p_model: meta.model,
        p_prompt_version: meta.promptVersion,
        p_tokens_in: meta.tokensIn,
        p_tokens_out: meta.tokensOut,
      });
      if (error) throw new Error("Could not record AI usage");
    },

    async refund(reservationId, errorCode, tokens) {
      const { error } = await admin.rpc("refund_usage", {
        p_id: reservationId,
        p_error_code: errorCode,
        p_tokens_in: tokens.tokensIn,
        p_tokens_out: tokens.tokensOut,
      });
      // A failed refund is left for expire_stale_reservations; don't mask the original error.
      if (error) console.error(JSON.stringify({ event: "ledger.refund_failed", reservationId }));
    },
  };
}

export interface CreditsSnapshot {
  used: number;
  limit: number;
  day: string;
}

/** Today's credits for the signed-in user, read through RLS. */
export async function readCreditsUsed(supabase: SupabaseClient, userId: string): Promise<CreditsSnapshot> {
  const env = serverEnv();
  const day = istDay();
  const { data, error } = await supabase
    .from("usage_ledger")
    .select("credits")
    .eq("user_id", userId)
    .eq("day", day)
    .neq("status", "refunded");
  const rows = (error ? [] : (data ?? [])) as Array<{ credits: number }>;
  const used = rows.reduce((sum, r) => sum + r.credits, 0);
  return { used, limit: env.AI_DAILY_CREDITS, day };
}
