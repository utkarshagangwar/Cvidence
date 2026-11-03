import { describe, expect, it } from "vitest";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createGrokProvider } from "@/lib/ai/providers/grok";
import { createOpenRouterProvider } from "@/lib/ai/providers/openrouter";
import { ProviderError } from "@/lib/ai/types";

const FAKE_KEY = ["fake", "credential", "value"].join("-");
const models = { cheap: "cheap-model", strong: "strong-model" };
const req = { system: "sys", user: "hello", tier: "strong" as const, maxOutputTokens: 100, json: true };

function fakeFetch(status: number, body: unknown, seen: Array<{ url: string; init: RequestInit }> = []) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

describe("gemini adapter", () => {
  it("sends the key in a header (not the URL) and reads text and tokens", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const p = createGeminiProvider({
      apiKey: FAKE_KEY,
      models,
      fetchImpl: fakeFetch(200, {
        candidates: [{ content: { parts: [{ text: '{"a":' }, { text: "1}" }] } }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3 },
      }, seen),
    });
    const out = await p.complete(req);
    expect(out).toEqual({ text: '{"a":1}', provider: "gemini", model: "strong-model", tokensIn: 12, tokensOut: 3 });
    expect(seen[0]!.url).toContain("/models/strong-model:generateContent");
    expect(seen[0]!.url).not.toContain(FAKE_KEY);
    expect((seen[0]!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe(FAKE_KEY);
    const body = JSON.parse(String(seen[0]!.init.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("counts hidden thinking tokens toward spend and leaves room for them", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const p = createGeminiProvider({
      apiKey: FAKE_KEY,
      models,
      fetchImpl: fakeFetch(200, {
        candidates: [{ content: { parts: [{ text: "{}" }] } }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2, thoughtsTokenCount: 60 },
      }, seen),
    });
    const out = await p.complete(req);
    expect(out.tokensOut).toBe(62);
    const body = JSON.parse(String(seen[0]!.init.body));
    expect(body.generationConfig.maxOutputTokens).toBeGreaterThan(req.maxOutputTokens);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });
  });

  it("maps 429 to a retryable RATE_LIMIT without leaking the body", async () => {
    const p = createGeminiProvider({ apiKey: "k".repeat(12), models, fetchImpl: fakeFetch(429, { error: "echo of prompt" }) });
    const err = await p.complete(req).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ code: "RATE_LIMIT", retryable: true });
    expect(String(err.message)).not.toContain("echo of prompt");
  });

  it("treats a blocked prompt as non-retryable", async () => {
    const p = createGeminiProvider({ apiKey: "k".repeat(12), models, fetchImpl: fakeFetch(200, { promptFeedback: { blockReason: "SAFETY" } }) });
    await expect(p.complete(req)).rejects.toMatchObject({ code: "BLOCKED", retryable: false });
  });
});

describe("openrouter adapter", () => {
  it("reads content and usage", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const p = createOpenRouterProvider({
      apiKey: FAKE_KEY,
      models,
      fetchImpl: fakeFetch(200, { choices: [{ message: { content: '{"b":2}' } }], usage: { prompt_tokens: 8, completion_tokens: 2 } }, seen),
    });
    const out = await p.complete({ ...req, tier: "cheap" });
    expect(out).toEqual({ text: '{"b":2}', provider: "openrouter", model: "cheap-model", tokensIn: 8, tokensOut: 2 });
    const body = JSON.parse(String(seen[0]!.init.body));
    expect(body.model).toBe("cheap-model");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("maps 500 to a retryable UPSTREAM error", async () => {
    const p = createOpenRouterProvider({ apiKey: "k".repeat(12), models, fetchImpl: fakeFetch(502, {}) });
    await expect(p.complete(req)).rejects.toMatchObject({ code: "UPSTREAM", retryable: true });
  });

  it("treats an empty reply as a bad response", async () => {
    const p = createOpenRouterProvider({ apiKey: "k".repeat(12), models, fetchImpl: fakeFetch(200, { choices: [] }) });
    await expect(p.complete(req)).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });
});

describe("grok adapter", () => {
  it("calls xAI with a bearer key and counts reasoning tokens", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const p = createGrokProvider({
      apiKey: FAKE_KEY,
      models,
      fetchImpl: fakeFetch(200, {
        choices: [{ message: { content: '{"c":3}' } }],
        usage: { prompt_tokens: 9, completion_tokens: 4, completion_tokens_details: { reasoning_tokens: 6 } },
      }, seen),
    });
    const out = await p.complete(req);
    expect(out).toEqual({ text: '{"c":3}', provider: "grok", model: "strong-model", tokensIn: 9, tokensOut: 10 });
    expect(seen[0]!.url).toBe("https://api.x.ai/v1/chat/completions");
    expect(seen[0]!.url).not.toContain(FAKE_KEY);
    expect((seen[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer " + FAKE_KEY);
    expect(JSON.parse(String(seen[0]!.init.body)).response_format).toEqual({ type: "json_object" });
  });

  it("maps 429 to a retryable RATE_LIMIT error", async () => {
    const p = createGrokProvider({ apiKey: "k".repeat(12), models, fetchImpl: fakeFetch(429, {}) });
    await expect(p.complete(req)).rejects.toMatchObject({ code: "RATE_LIMIT", provider: "grok", retryable: true });
  });

  it("turns a network failure into an UPSTREAM error without the key", async () => {
    const p = createGrokProvider({
      apiKey: FAKE_KEY,
      models,
      fetchImpl: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    const err = await p.complete(req).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "UPSTREAM", provider: "grok" });
    expect(String((err as Error).message)).not.toContain(FAKE_KEY);
  });
});

describe("openrouter token counting", () => {
  it("does not double-count reasoning tokens already inside completion_tokens", async () => {
    const p = createOpenRouterProvider({
      apiKey: FAKE_KEY,
      models,
      fetchImpl: fakeFetch(200, {
        choices: [{ message: { content: "{}" } }],
        usage: { prompt_tokens: 1, completion_tokens: 10, completion_tokens_details: { reasoning_tokens: 6 } },
      }),
    });
    expect((await p.complete(req)).tokensOut).toBe(10);
  });
});
