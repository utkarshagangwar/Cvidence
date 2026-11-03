// Fetches every page of one source through its adapter. No database here, so it
// can be tested with a fake fetch.

import { normaliseAll } from "./normalise";
import type { Posting, SourceAdapter, SourceConfig } from "./types";

export type SourceErrorCode = "RATE_LIMIT" | "NOT_FOUND" | "HTTP" | "TIMEOUT" | "NETWORK" | "BAD_JSON" | "TOO_BIG";

export class SourceError extends Error {
  constructor(
    readonly code: SourceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SourceError";
  }
  /** Worth trying again later. */
  get retryable() {
    return this.code === "RATE_LIMIT" || this.code === "TIMEOUT" || this.code === "NETWORK" || this.code === "HTTP";
  }
}

const MAX_BYTES = 40 * 1024 * 1024; // Databricks-size boards with full descriptions run to ~15 MB.
const TIMEOUT_MS = 30_000;
const USER_AGENT = "Cvidence job search (+https://cvidence.com)";

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new SourceError("TOO_BIG", `Response over ${MAX_BYTES / 1024 / 1024} MB`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export interface FetchResult {
  postings: Posting[];
  /** False when we stopped at maxPages, so missing jobs must not be marked closed. */
  complete: boolean;
}

export async function fetchSource(
  adapter: SourceAdapter,
  source: SourceConfig,
  env: Readonly<Record<string, string>>,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchResult> {
  const maxPages = Math.max(1, Math.min(adapter.maxPages ?? 1, 50));
  const raws = [];
  let complete = true;

  for (let page = 0; page < maxPages; page++) {
    const req = adapter.request(source, page, env);
    if (!req.url.startsWith("https://")) throw new SourceError("HTTP", "Adapter built a non-https URL");

    let res: Response;
    try {
      res = await fetchImpl(req.url, {
        method: req.method ?? "GET",
        headers: { accept: "application/json", "user-agent": USER_AGENT, ...req.headers },
        body: req.body,
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new SourceError(timedOut ? "TIMEOUT" : "NETWORK", timedOut ? "Timed out" : "Could not reach the board");
    }

    if (res.status === 429) throw new SourceError("RATE_LIMIT", "Rate limited (HTTP 429)");
    if (res.status === 404) throw new SourceError("NOT_FOUND", "Board not found (HTTP 404)");
    if (!res.ok) throw new SourceError("HTTP", `HTTP ${res.status}`);

    let body: unknown;
    try {
      body = JSON.parse(await readCapped(res));
    } catch (err) {
      if (err instanceof SourceError) throw err;
      throw new SourceError("BAD_JSON", "The board didn't return JSON");
    }

    const parsed = adapter.parse(body, source);
    raws.push(...parsed.postings);
    if (!parsed.more) break;
    if (page === maxPages - 1) complete = false;
  }

  return { postings: normaliseAll(raws, source.company), complete };
}
