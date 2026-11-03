import "server-only";
import { serverEnv } from "@/lib/env";
import type { LlmProvider } from "../types";
import { createGeminiProvider } from "./gemini";
import { createOpenRouterProvider } from "./openrouter";

/**
 * Providers in the configured order. A provider is included only when its key
 * AND both model ids are set: model ids are pinned in env, never defaulted to a
 * floating alias, so every ledger row says exactly which model wrote it.
 */
export function configuredProviders(): LlmProvider[] {
  const env = serverEnv();
  const out: LlmProvider[] = [];

  for (const name of env.AI_PROVIDER_ORDER) {
    if (name === "gemini" && env.GEMINI_API_KEY && env.GEMINI_MODEL_CHEAP && env.GEMINI_MODEL_STRONG) {
      out.push(
        createGeminiProvider({
          apiKey: env.GEMINI_API_KEY,
          models: { cheap: env.GEMINI_MODEL_CHEAP, strong: env.GEMINI_MODEL_STRONG },
        }),
      );
    }
    if (name === "openrouter" && env.OPENROUTER_API_KEY && env.OPENROUTER_MODEL_CHEAP && env.OPENROUTER_MODEL_STRONG) {
      out.push(
        createOpenRouterProvider({
          apiKey: env.OPENROUTER_API_KEY,
          models: { cheap: env.OPENROUTER_MODEL_CHEAP, strong: env.OPENROUTER_MODEL_STRONG },
          appUrl: env.NEXT_PUBLIC_SITE_URL,
        }),
      );
    }
  }
  return out;
}
