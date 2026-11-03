// Provider-neutral contract for every model call.

export type ModelTier = "cheap" | "strong";
export type ProviderName = "gemini" | "openrouter";

export interface LlmRequest {
  system: string;
  user: string;
  tier: ModelTier;
  maxOutputTokens: number;
  temperature?: number;
  /** Ask the provider for a JSON object (all Cvidence tasks do). */
  json?: boolean;
  signal?: AbortSignal;
}

export interface LlmResponse {
  text: string;
  provider: ProviderName;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export interface LlmProvider {
  readonly name: ProviderName;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export type ProviderErrorCode =
  | "CONFIG"
  | "AUTH"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "UPSTREAM"
  | "BAD_RESPONSE"
  | "BLOCKED";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: ProviderErrorCode,
    readonly provider: ProviderName,
    /** True when another provider might succeed (rate limit, outage, timeout). */
    readonly retryable: boolean,
    /** Tokens the provider reported before failing, if any. */
    readonly tokensIn = 0,
    readonly tokensOut = 0,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Map an HTTP status from a provider to an error code. */
export function codeForStatus(status: number): { code: ProviderErrorCode; retryable: boolean } {
  if (status === 401 || status === 403) return { code: "AUTH", retryable: true };
  if (status === 429) return { code: "RATE_LIMIT", retryable: true };
  if (status === 408 || status === 504) return { code: "TIMEOUT", retryable: true };
  if (status >= 500) return { code: "UPSTREAM", retryable: true };
  return { code: "BAD_RESPONSE", retryable: false };
}
