import { codeForStatus, ProviderError, type LlmProvider, type LlmRequest, type LlmResponse, type ModelTier } from "../types";

export interface OpenRouterConfig {
  apiKey: string;
  models: Record<ModelTier, string>;
  /** Sent as HTTP-Referer so OpenRouter can attribute traffic. */
  appUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

interface OpenRouterReply {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function createOpenRouterProvider(config: OpenRouterConfig): LlmProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = config.baseUrl ?? "https://openrouter.ai/api/v1";
  const timeoutMs = config.timeoutMs ?? 90_000;

  return {
    name: "openrouter",
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const model = config.models[req.tier];
      const signal = req.signal ? AbortSignal.any([req.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);

      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey}`,
            ...(config.appUrl ? { "HTTP-Referer": config.appUrl } : {}),
            "X-Title": "Cvidence",
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
        throw new ProviderError(
          timedOut ? "OpenRouter timed out" : "Could not reach OpenRouter",
          timedOut ? "TIMEOUT" : "UPSTREAM",
          "openrouter",
          true,
        );
      }

      if (!res.ok) {
        const { code, retryable } = codeForStatus(res.status);
        throw new ProviderError(`OpenRouter returned HTTP ${res.status}`, code, "openrouter", retryable);
      }

      const body = (await res.json().catch(() => null)) as OpenRouterReply | null;
      const tokensIn = body?.usage?.prompt_tokens ?? 0;
      const tokensOut = body?.usage?.completion_tokens ?? 0;
      const text = body?.choices?.[0]?.message?.content ?? "";
      if (!text) {
        throw new ProviderError("OpenRouter returned an empty reply", "BAD_RESPONSE", "openrouter", true, tokensIn, tokensOut);
      }

      return { text, provider: "openrouter", model, tokensIn, tokensOut };
    },
  };
}
