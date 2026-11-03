import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { QuotaError, runTask, TaskError, type Ledger, type TaskDef } from "@/lib/ai/run-task";
import { createProviderHealth } from "@/lib/ai/provider-health";
import { ProviderError, type LlmProvider, type LlmResponse, type ProviderName } from "@/lib/ai/types";

const task: TaskDef<{ title: string }> = {
  id: "extract",
  promptVersion: "extract-jd@1",
  tier: "cheap",
  maxOutputTokens: 800,
  schema: z.object({ title: z.string().min(1) }),
};

function fakeLedger(opts: { reserveError?: Error } = {}) {
  const calls: string[] = [];
  const ledger: Ledger & { calls: string[] } = {
    calls,
    reserve: vi.fn(async (_u, t, c) => {
      calls.push(`reserve:${t}:${c}`);
      if (opts.reserveError) throw opts.reserveError;
      return "res-1";
    }),
    commit: vi.fn(async (id, meta) => {
      calls.push(`commit:${id}:${meta.provider}:${meta.tokensIn}:${meta.tokensOut}`);
    }),
    refund: vi.fn(async (id, code, t) => {
      calls.push(`refund:${id}:${code}:${t.tokensIn}:${t.tokensOut}`);
    }),
  };
  return ledger;
}

function provider(name: ProviderName, replies: Array<string | ProviderError>): LlmProvider & { count: () => number } {
  let i = 0;
  return {
    name,
    count: () => i,
    async complete(): Promise<LlmResponse> {
      const r = replies[Math.min(i, replies.length - 1)]!;
      i++;
      if (r instanceof ProviderError) throw r;
      return { text: r, provider: name, model: `${name}-model`, tokensIn: 10, tokensOut: 5 };
    },
  };
}

const input = { userId: "user-1", task, system: "sys", user: "jd" };

describe("runTask", () => {
  it("commits once on a valid reply", async () => {
    const ledger = fakeLedger();
    const out = await runTask({ ledger, providers: [provider("gemini", ['{"title":"SDET"}'])] }, input);
    expect(out.data).toEqual({ title: "SDET" });
    expect(out.promptVersion).toBe("extract-jd@1");
    expect(ledger.calls).toEqual(["reserve:extract:1", "commit:res-1:gemini:10:5"]);
  });

  it("lets a schema default fill a field the model sent as null", async () => {
    const ledger = fakeLedger();
    const t: TaskDef<{ title: string; company: string }> = { ...task, schema: z.object({ title: z.string().min(1), company: z.string().default("") }) };
    const p = provider("gemini", ['{"title":"QA","company":null}']);
    const out = await runTask({ ledger, providers: [p] }, { ...input, task: t });
    expect(out.data).toEqual({ title: "QA", company: "" });
    expect(p.count()).toBe(1);
  });

  it("retries once on a bad shape, then succeeds", async () => {
    const ledger = fakeLedger();
    const p = provider("gemini", ['{"wrong":1}', '```json\n{"title":"QA"}\n```']);
    const out = await runTask({ ledger, providers: [p] }, input);
    expect(out.data.title).toBe("QA");
    expect(p.count()).toBe(2);
    expect(ledger.calls.at(-1)).toBe("commit:res-1:gemini:20:10");
  });

  it("refunds after two bad shapes and still reports the tokens spent", async () => {
    const ledger = fakeLedger();
    const p = provider("gemini", ["not json", '{"title":""}']);
    await expect(runTask({ ledger, providers: [p] }, input)).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    expect(ledger.calls).toEqual(["reserve:extract:1", "refund:res-1:SCHEMA_INVALID:20:10"]);
    expect(ledger.commit).not.toHaveBeenCalled();
  });

  it("falls back to the next provider on a retryable error", async () => {
    const ledger = fakeLedger();
    const gemini = provider("gemini", [new ProviderError("429", "RATE_LIMIT", "gemini", true)]);
    const openrouter = provider("openrouter", ['{"title":"SDET"}']);
    const out = await runTask({ ledger, providers: [gemini, openrouter] }, input);
    expect(out.provider).toBe("openrouter");
    expect(ledger.calls.at(-1)).toBe("commit:res-1:openrouter:10:5");
  });

  it("falls back even on a non-retryable error (another service may accept it)", async () => {
    const ledger = fakeLedger();
    const gemini = provider("gemini", [new ProviderError("blocked", "BLOCKED", "gemini", false, 7, 0)]);
    const openrouter = provider("openrouter", ['{"title":"SDET"}']);
    const out = await runTask({ ledger, providers: [gemini, openrouter] }, input);
    expect(out.provider).toBe("openrouter");
    expect(ledger.calls).toEqual(["reserve:extract:1", "commit:res-1:openrouter:17:5"]);
  });

  it("refunds when every provider refuses, and reports the last error", async () => {
    const ledger = fakeLedger();
    const gemini = provider("gemini", [new ProviderError("blocked", "BLOCKED", "gemini", false, 7, 0)]);
    const openrouter = provider("openrouter", [new ProviderError("bad", "BAD_RESPONSE", "openrouter", false)]);
    await expect(runTask({ ledger, providers: [gemini, openrouter], sleep: async () => {} }, input)).rejects.toBeInstanceOf(TaskError);
    expect([gemini.count(), openrouter.count()]).toEqual([1, 1]);
    expect(ledger.calls).toEqual(["reserve:extract:1", "refund:res-1:PROVIDER_BAD_RESPONSE:7:0"]);
  });

  it("walks gemini -> openrouter -> grok in order", async () => {
    const ledger = fakeLedger();
    const g = provider("gemini", [new ProviderError("429", "RATE_LIMIT", "gemini", true)]);
    const o = provider("openrouter", [new ProviderError("401", "AUTH", "openrouter", true)]);
    const x = provider("grok", ['{"title":"SDET"}']);
    const out = await runTask({ ledger, providers: [g, o, x] }, input);
    expect(out.provider).toBe("grok");
    expect([g.count(), o.count(), x.count()]).toEqual([1, 1, 1]);
    expect(ledger.calls.at(-1)).toBe("commit:res-1:grok:10:5");
  });

  it("retries a bad reply shape on a different provider first", async () => {
    const ledger = fakeLedger();
    const g = provider("gemini", ['{"wrong":1}', '{"title":"from gemini"}']);
    const o = provider("openrouter", ['{"title":"from openrouter"}']);
    const out = await runTask({ ledger, providers: [g, o] }, input);
    expect(out.data.title).toBe("from openrouter");
    expect([g.count(), o.count()]).toEqual([1, 1]);
  });

  it("gives three providers three tries at a usable reply", async () => {
    const ledger = fakeLedger();
    const g = provider("gemini", ["not json"]);
    const o = provider("openrouter", ['{"title":""}']);
    const x = provider("grok", ['{"title":"SDET"}']);
    const out = await runTask({ ledger, providers: [g, o, x] }, input);
    expect(out.provider).toBe("grok");
    expect(ledger.calls.at(-1)).toBe("commit:res-1:grok:30:15");
  });

  it("tries a provider that failed moments ago last, not first", async () => {
    const health = createProviderHealth(() => 1_000);
    health.markFailed("gemini", "RATE_LIMIT");
    const g = provider("gemini", ['{"title":"gemini"}']);
    const o = provider("openrouter", ['{"title":"openrouter"}']);
    const out = await runTask({ ledger: fakeLedger(), providers: [g, o], health }, input);
    expect(out.provider).toBe("openrouter");
    expect(g.count()).toBe(0);
  });

  it("still reaches a cooling provider when it's the only one left", async () => {
    const health = createProviderHealth(() => 1_000);
    health.markFailed("gemini", "RATE_LIMIT");
    const g = provider("gemini", ['{"title":"gemini"}']);
    const o = provider("openrouter", [new ProviderError("503", "UPSTREAM", "openrouter", true)]);
    const out = await runTask({ ledger: fakeLedger(), providers: [g, o], health, sleep: async () => {} }, input);
    expect(out.provider).toBe("gemini");
  });

  it("stops calling providers once the time budget is spent, and refunds", async () => {
    const ledger = fakeLedger();
    const g = provider("gemini", ['{"title":"SDET"}']);
    await expect(runTask({ ledger, providers: [g], budgetMs: 0 }, input)).rejects.toMatchObject({ code: "PROVIDER_FAILED" });
    expect(g.count()).toBe(0);
    expect(ledger.calls.at(-1)).toBe("refund:res-1:PROVIDER_TIMEOUT:0:0");
  });

  it("refunds when every provider is down, after one busy retry", async () => {
    const ledger = fakeLedger();
    const sleep = vi.fn(async () => {});
    const down = (n: ProviderName) => provider(n, [new ProviderError("503", "UPSTREAM", n, true)]);
    const g = down("gemini");
    const o = down("openrouter");
    await expect(runTask({ ledger, providers: [g, o], sleep }, input)).rejects.toMatchObject({
      code: "PROVIDER_FAILED",
    });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect([g.count(), o.count()]).toEqual([2, 2]);
    expect(ledger.calls.at(-1)).toBe("refund:res-1:PROVIDER_UPSTREAM:0:0");
  });

  it("recovers when a busy provider answers on the retry", async () => {
    const ledger = fakeLedger();
    const g = provider("gemini", [new ProviderError("503", "UPSTREAM", "gemini", true), '{"title":"SDET"}']);
    const out = await runTask({ ledger, providers: [g], sleep: async () => {} }, input);
    expect(out.data.title).toBe("SDET");
    expect(ledger.calls.at(-1)).toBe("commit:res-1:gemini:10:5");
  });

  it("does not retry an auth error", async () => {
    const ledger = fakeLedger();
    const sleep = vi.fn(async () => {});
    const g = provider("gemini", [new ProviderError("401", "AUTH", "gemini", true)]);
    await expect(runTask({ ledger, providers: [g], sleep }, input)).rejects.toBeInstanceOf(TaskError);
    expect(sleep).not.toHaveBeenCalled();
    expect(g.count()).toBe(1);
  });

  it("never calls a model when credits are out", async () => {
    const ledger = fakeLedger({ reserveError: new QuotaError("NO_CREDITS") });
    const p = provider("gemini", ['{"title":"SDET"}']);
    await expect(runTask({ ledger, providers: [p] }, input)).rejects.toBeInstanceOf(QuotaError);
    expect(p.count()).toBe(0);
    expect(ledger.refund).not.toHaveBeenCalled();
  });

  it("refunds and rethrows on an unexpected error", async () => {
    const ledger = fakeLedger();
    const broken: LlmProvider = {
      name: "gemini",
      async complete() {
        throw new TypeError("bug");
      },
    };
    await expect(runTask({ ledger, providers: [broken] }, input)).rejects.toBeInstanceOf(TypeError);
    expect(ledger.calls.at(-1)).toBe("refund:res-1:INTERNAL:0:0");
  });

  it("refuses to reserve when no provider is configured", async () => {
    const ledger = fakeLedger();
    await expect(runTask({ ledger, providers: [] }, input)).rejects.toBeInstanceOf(TaskError);
    expect(ledger.reserve).not.toHaveBeenCalled();
  });
});
