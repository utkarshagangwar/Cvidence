import type { LlmProvider, ModelTier } from "../types";
import { createChatCompletionsProvider } from "./chat-completions";

export interface OpenRouterConfig {
  apiKey: string;
  models: Record<ModelTier, string>;
  /** Sent as HTTP-Referer so OpenRouter can attribute traffic. */
  appUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

export function createOpenRouterProvider(config: OpenRouterConfig): LlmProvider {
  return createChatCompletionsProvider({
    name: "openrouter",
    label: "OpenRouter",
    apiKey: config.apiKey,
    models: config.models,
    baseUrl: config.baseUrl ?? "https://openrouter.ai/api/v1",
    extraHeaders: { ...(config.appUrl ? { "HTTP-Referer": config.appUrl } : {}), "X-Title": "Cvidence" },
    timeoutMs: config.timeoutMs,
    fetchImpl: config.fetchImpl,
  });
}
