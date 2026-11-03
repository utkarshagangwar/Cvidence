import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseLedger } from "@/lib/quota/ledger";
import { configuredProviders } from "./providers";
import { QuotaError, runTask, TaskError, type TaskDef, type TaskResult } from "./run-task";

/** Logs metadata only: never prompt, reply, resume or JD text. */
function log(event: Record<string, unknown>) {
  console.info(JSON.stringify({ ...event, at: new Date().toISOString() }));
}

export const AI_REQUESTS_PER_MINUTE = 20;

/**
 * Checks that run before every AI call, on the server, for every caller
 * (app and daily agent). Both fail closed: if the check itself errors, no AI.
 */
async function preflight(userId: string) {
  const admin = createSupabaseAdminClient();
  const [consent, rate] = await Promise.all([
    admin.from("profiles").select("consented_at").eq("user_id", userId).maybeSingle(),
    admin.rpc("hit_rate_limit", { p_key: `ai:${userId}`, p_max: AI_REQUESTS_PER_MINUTE, p_window_seconds: 60 }),
  ]);
  if (consent.error || rate.error) throw new TaskError("PROVIDER_FAILED", "We couldn't check your account just now. No credits were used. Please try again.");
  if (!consent.data?.consented_at) throw new ConsentRequired();
  if (rate.data !== true) throw new RateLimited();
}

export async function runAiTask<T>(userId: string, task: TaskDef<T>, prompt: { system: string; user: string }): Promise<TaskResult<T>> {
  const providers = configuredProviders();
  if (providers.length === 0) throw new AiNotConfigured();
  await preflight(userId);
  const started = Date.now();
  try {
    const result = await runTask({ ledger: createSupabaseLedger(), providers, log }, { userId, task, ...prompt });
    log({ event: "ai.ok", task: task.id, userId, provider: result.provider, ms: Date.now() - started });
    return result;
  } catch (err) {
    log({ event: "ai.fail", task: task.id, userId, ms: Date.now() - started, error: err instanceof Error ? err.name : "unknown" });
    throw err;
  }
}

export class AiNotConfigured extends Error {
  constructor() {
    super("AI isn't set up on this server yet. Add a Gemini or OpenRouter key and model ids.");
    this.name = "AiNotConfigured";
  }
}

export class ConsentRequired extends Error {
  constructor() {
    super("Before Cvidence can use AI on your profile, agree to how your data is used. You'll find it at the top of the page, or in Settings.");
    this.name = "ConsentRequired";
  }
}

export class RateLimited extends Error {
  constructor() {
    super(`That's more than ${AI_REQUESTS_PER_MINUTE} AI requests in a minute. Wait a moment and try again. No credits were used.`);
    this.name = "RateLimited";
  }
}

/** A message that is safe to show the person, for any error from an AI step. */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof QuotaError || err instanceof TaskError || err instanceof AiNotConfigured || err instanceof ConsentRequired || err instanceof RateLimited) return err.message;
  return "Something went wrong on our side. No credits were used. Please try again.";
}
