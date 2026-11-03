// Runs one AI task: reserve credits → call the model (with provider fallback)
// → parse and validate JSON → retry once on a bad shape → commit or refund.
// Credits are refunded on every failure path, exactly once.

import type { z } from "zod";
import { TASK_CREDITS, type TaskId } from "../quota/credits";
import { dropNulls, JsonRepairError, parseJsonLoose } from "./json-repair";
import type { ProviderHealth } from "./provider-health";
import { ProviderError, type LlmProvider, type ModelTier, type ProviderName } from "./types";

export interface TaskDef<T> {
  id: TaskId;
  /** For example "tailor-resume@1"; stored with every ledger row. */
  promptVersion: string;
  tier: ModelTier;
  maxOutputTokens: number;
  schema: z.ZodType<T>;
  temperature?: number;
}

export interface Ledger {
  /** Throws QuotaError when the user is out of credits or AI is paused. */
  reserve(userId: string, task: TaskId, credits: number): Promise<string>;
  commit(
    reservationId: string,
    meta: { provider: ProviderName; model: string; promptVersion: string; tokensIn: number; tokensOut: number },
  ): Promise<void>;
  refund(reservationId: string, errorCode: string, tokens: { tokensIn: number; tokensOut: number }): Promise<void>;
}

export type QuotaErrorCode = "NO_CREDITS" | "AI_PAUSED";

export class QuotaError extends Error {
  constructor(readonly code: QuotaErrorCode) {
    super(
      code === "NO_CREDITS"
        ? "You've used today's AI credits. They reset at midnight IST."
        : "AI is paused until midnight IST. Search, tracker, profile and exports still work.",
    );
    this.name = "QuotaError";
  }
}

export type TaskErrorCode = "SCHEMA_INVALID" | "PROVIDER_FAILED";

export class TaskError extends Error {
  constructor(
    readonly code: TaskErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TaskError";
  }
}

export interface TaskResult<T> {
  data: T;
  provider: ProviderName;
  model: string;
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
  reservationId: string;
}

export interface RunTaskInput<T> {
  userId: string;
  task: TaskDef<T>;
  system: string;
  user: string;
  signal?: AbortSignal;
}

export interface RunTaskDeps {
  ledger: Ledger;
  /** In priority order; later providers are fallbacks. */
  providers: LlmProvider[];
  /** For logs: never pass prompt or reply text here. */
  log?: (event: Record<string, unknown>) => void;
  /** Injected in tests so the retry wait doesn't slow them down. */
  sleep?: (ms: number) => Promise<void>;
  /** Skips providers that failed moments ago. Optional so tests stay isolated. */
  health?: ProviderHealth;
  /** Total time for one task across all providers and retries. */
  budgetMs?: number;
}

// First try + retries on a bad reply shape; each retry prefers another provider.
const attemptsFor = (providerCount: number) => Math.min(3, Math.max(2, providerCount));
// Wall-clock budget for one task across every provider, kept well under the 300 s
// server limit. A single call stops when the budget runs out.
const DEFAULT_BUDGET_MS = 180_000;
const MIN_CALL_MS = 5_000;
// When every provider is briefly busy (5xx, timeout, rate limit), wait once and
// go round again. Auth or blocked errors won't get better, so they don't retry.
const BUSY_RETRY_MS = 2500;
const BUSY_CODES = new Set(["UPSTREAM", "TIMEOUT", "RATE_LIMIT"]);

export async function runTask<T>(deps: RunTaskDeps, input: RunTaskInput<T>): Promise<TaskResult<T>> {
  if (deps.providers.length === 0) throw new TaskError("PROVIDER_FAILED", "No AI provider is configured.");

  const { task } = input;
  const reservationId = await deps.ledger.reserve(input.userId, task.id, TASK_CREDITS[task.id]);
  let tokensIn = 0;
  let tokensOut = 0;
  let settled = false;

  const refund = async (code: string) => {
    if (settled) return;
    settled = true;
    await deps.ledger.refund(reservationId, code, { tokensIn, tokensOut });
  };

  const deadline = Date.now() + (deps.budgetMs ?? DEFAULT_BUDGET_MS);
  // Providers that sent a reply we couldn't use; the retry tries others first.
  const avoid = new Set<ProviderName>();

  try {
    const maxAttempts = attemptsFor(deps.providers.length);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1 && deadline - Date.now() < MIN_CALL_MS) break;
      const reply = await callWithFallback(
        deps,
        input,
        (tin, tout) => {
          tokensIn += tin;
          tokensOut += tout;
        },
        avoid,
        deadline,
      );

      let parsed: unknown;
      try {
        parsed = parseJsonLoose(reply.text);
      } catch (err) {
        if (!(err instanceof JsonRepairError)) throw err;
        deps.log?.({ event: "ai.bad_json", task: task.id, attempt, provider: reply.provider });
        avoid.add(reply.provider);
        continue;
      }

      const checked = task.schema.safeParse(dropNulls(parsed));
      if (!checked.success) {
        deps.log?.({ event: "ai.schema_invalid", task: task.id, attempt, provider: reply.provider, issues: checked.error.issues.length });
        avoid.add(reply.provider);
        continue;
      }

      settled = true;
      await deps.ledger.commit(reservationId, {
        provider: reply.provider,
        model: reply.model,
        promptVersion: task.promptVersion,
        tokensIn,
        tokensOut,
      });
      return {
        data: checked.data,
        provider: reply.provider,
        model: reply.model,
        promptVersion: task.promptVersion,
        tokensIn,
        tokensOut,
        reservationId,
      };
    }

    await refund("SCHEMA_INVALID");
    throw new TaskError(
      "SCHEMA_INVALID",
      "The AI reply wasn't in the shape we need, so nothing was saved. Your credits were refunded. Please try again.",
    );
  } catch (err) {
    if (err instanceof ProviderError) {
      await refund(`PROVIDER_${err.code}`);
      throw new TaskError(
        "PROVIDER_FAILED",
        "The AI service didn't respond properly. Your credits were refunded. Please try again in a minute.",
      );
    }
    await refund("INTERNAL");
    throw err;
  }
}

/**
 * Order for this call: healthy providers first (config order), then ones that
 * just gave a bad reply for this task, then ones cooling down after a failure.
 * Nothing is dropped, so every configured provider gets a chance.
 */
function orderProviders(deps: RunTaskDeps, avoid: ReadonlySet<ProviderName>) {
  const rank = (p: LlmProvider) => (deps.health?.isCooling(p.name) ? 2 : avoid.has(p.name) ? 1 : 0);
  return deps.providers.map((p, i) => ({ p, i, r: rank(p) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.p);
}

async function callWithFallback<T>(
  deps: RunTaskDeps,
  input: RunTaskInput<T>,
  addTokens: (tokensIn: number, tokensOut: number) => void,
  avoid: ReadonlySet<ProviderName>,
  deadline: number,
) {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastError: ProviderError | undefined;
  let queue = orderProviders(deps, avoid);

  for (let round = 0; round < 2 && queue.length > 0; round++) {
    if (round === 1) {
      // Second round: only providers that were busy, after a short wait.
      if (deadline - Date.now() < BUSY_RETRY_MS + MIN_CALL_MS) break;
      deps.log?.({ event: "ai.busy_retry", task: input.task.id, code: lastError?.code });
      await sleep(BUSY_RETRY_MS);
    }
    const busy: LlmProvider[] = [];
    for (const provider of queue) {
      if (input.signal?.aborted) throw lastError ?? new ProviderError("Request cancelled", "TIMEOUT", provider.name, false);
      const remaining = deadline - Date.now();
      if (remaining < MIN_CALL_MS) break;
      const budget = AbortSignal.timeout(remaining);
      try {
        const reply = await provider.complete({
          system: input.system,
          user: input.user,
          tier: input.task.tier,
          maxOutputTokens: input.task.maxOutputTokens,
          temperature: input.task.temperature,
          json: true,
          signal: input.signal ? AbortSignal.any([input.signal, budget]) : budget,
        });
        addTokens(reply.tokensIn, reply.tokensOut);
        deps.health?.markOk(provider.name);
        if (lastError) deps.log?.({ event: "ai.fallback_ok", task: input.task.id, provider: provider.name });
        return reply;
      } catch (err) {
        if (!(err instanceof ProviderError)) throw err;
        addTokens(err.tokensIn, err.tokensOut);
        deps.health?.markFailed(err.provider, err.code);
        deps.log?.({ event: "ai.provider_error", task: input.task.id, provider: err.provider, code: err.code });
        lastError = err;
        // Whatever went wrong here (outage, quota, bad key, refusal, odd
        // reply), the next provider is a separate service and may well work.
        if (BUSY_CODES.has(err.code)) busy.push(provider);
      }
    }
    queue = busy;
  }
  throw lastError ?? new ProviderError("No provider answered in time", "TIMEOUT", deps.providers[0]!.name, false);
}
