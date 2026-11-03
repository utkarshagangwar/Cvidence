import type { LlmProvider, ModelTier } from "../types";
import { createChatCompletionsProvider } from "./chat-completions";

export interface GrokConfig {
  apiKey: string;
  models: Record<ModelTier, string>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

/** xAI Grok, through its OpenAI-style chat completions API. */
export function createGrokProvider(config: GrokConfig): LlmProvider {
  return createChatCompletionsProvider({
    name: "grok",
    label: "Grok",
    apiKey: config.apiKey,
    models: config.models,
    baseUrl: config.baseUrl ?? "https://api.x.ai/v1",
    reasoningTokensSeparate: true,
    timeoutMs: config.timeoutMs,
    fetchImpl: config.fetchImpl,
  });
}
