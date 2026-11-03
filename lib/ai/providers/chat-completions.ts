import { codeForStatus, ProviderError, type LlmProvider, type LlmRequest, type LlmResponse, type ModelTier, type ProviderName } from "../types";

// Shared client for OpenAI-style /chat/completions APIs (OpenRouter, xAI Grok).

export interface ChatCompletionsConfig {
  name: ProviderName;
  /** Shown in error messages, e.g. "OpenRouter". */
  label: string;
  apiKey: string;
  models: Record<ModelTier, string>;
  baseUrl: string;
  extraHeaders?: Record<string, string>;
  /** xAI reports reasoning tokens outside completion_tokens; OpenAI-style APIs include them. */
  reasoningTokensSeparate?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface ChatReply {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

export function createChatCompletionsProvider(config: ChatCompletionsConfig): LlmProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? 90_000;
  const { name, label } = config;

  return {
    name,
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const model = config.models[req.tier];
      const signal = req.signal ? AbortSignal.any([req.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);

      let res: Response;
      try {
        res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey}`,
            ...config.extraHeaders,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: req.system },
              { role: "user", content: req.user },
            ],
            max_tokens: req.maxOutputTokens,
            temperature: req.temperature ?? 0.2,
            ...(req.json ? { response_format: { type: "json_object" } } : {}),
          }),
          signal,
        });
      } catch (err) {
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        throw new ProviderError(timedOut ? `${label} timed out` : `Could not reach ${label}`, timedOut ? "TIMEOUT" : "UPSTREAM", name, true);
      }

      if (!res.ok) {
        const { code, retryable } = codeForStatus(res.status);
        // Never include the response body: it can echo the prompt.
        throw new ProviderError(`${label} returned HTTP ${res.status}`, code, name, retryable);
      }

      const body = (await res.json().catch(() => null)) as ChatReply | null;
      const tokensIn = body?.usage?.prompt_tokens ?? 0;
      // Reasoning tokens are billed, so they count toward the spend cap too.
      const reasoning = config.reasoningTokensSeparate ? (body?.usage?.completion_tokens_details?.reasoning_tokens ?? 0) : 0;
      const tokensOut = (body?.usage?.completion_tokens ?? 0) + reasoning;
      const text = body?.choices?.[0]?.message?.content ?? "";
      if (!text) {
        throw new ProviderError(`${label} returned an empty reply`, "BAD_RESPONSE", name, true, tokensIn, tokensOut);
      }

      return { text, provider: name, model, tokensIn, tokensOut };
    },
  };
}
