import { codeForStatus, ProviderError, type LlmProvider, type LlmRequest, type LlmResponse, type ModelTier } from "../types";

export interface GeminiConfig {
  apiKey: string;
  models: Record<ModelTier, string>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

interface GeminiReply {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
}

// Thinking models spend part of maxOutputTokens on hidden reasoning. Keep it
// low and give it its own headroom so the visible JSON isn't cut short.
const THINKING_HEADROOM = 1024;

export function createGeminiProvider(config: GeminiConfig): LlmProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
  const timeoutMs = config.timeoutMs ?? 90_000;

  return {
    name: "gemini",
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const model = config.models[req.tier];
      const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
      const signal = req.signal ? AbortSignal.any([req.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);

      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": config.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: [{ role: "user", parts: [{ text: req.user }] }],
            generationConfig: {
              maxOutputTokens: req.maxOutputTokens + THINKING_HEADROOM,
              thinkingConfig: { thinkingLevel: "low" },
              temperature: req.temperature ?? 0.2,
              ...(req.json ? { responseMimeType: "application/json" } : {}),
            },
          }),
          signal,
        });
      } catch (err) {
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        throw new ProviderError(
          timedOut ? "Gemini timed out" : "Could not reach Gemini",
          timedOut ? "TIMEOUT" : "UPSTREAM",
          "gemini",
          true,
        );
      }

      if (!res.ok) {
        const { code, retryable } = codeForStatus(res.status);
        // Never include the response body: it can echo the prompt.
        throw new ProviderError(`Gemini returned HTTP ${res.status}`, code, "gemini", retryable);
      }

      const body = (await res.json().catch(() => null)) as GeminiReply | null;
      const tokensIn = body?.usageMetadata?.promptTokenCount ?? 0;
      // Thinking tokens are billed, so they count toward the spend cap too.
      const tokensOut = (body?.usageMetadata?.candidatesTokenCount ?? 0) + (body?.usageMetadata?.thoughtsTokenCount ?? 0);

      if (body?.promptFeedback?.blockReason) {
        throw new ProviderError("Gemini blocked the request", "BLOCKED", "gemini", false, tokensIn, tokensOut);
      }
      const text = (body?.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("");
      if (!text) {
        throw new ProviderError("Gemini returned an empty reply", "BAD_RESPONSE", "gemini", true, tokensIn, tokensOut);
      }

      return { text, provider: "gemini", model, tokensIn, tokensOut };
    },
  };
}
