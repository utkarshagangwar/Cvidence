import type { ProviderErrorCode, ProviderName } from "./types";

// Remembers, per server instance, which provider failed recently so the next
// request goes to a working one first instead of waiting on the broken one.
// A cooling provider is moved to the back of the queue, never removed, so a
// request can still reach it when everything else is down too.

const COOLDOWN_MS: Partial<Record<ProviderErrorCode, number>> = {
  RATE_LIMIT: 60_000,
  UPSTREAM: 30_000,
  TIMEOUT: 30_000,
  // A bad or expired key won't fix itself quickly.
  AUTH: 10 * 60_000,
};

export interface ProviderHealth {
  isCooling(name: ProviderName): boolean;
  markFailed(name: ProviderName, code: ProviderErrorCode): void;
  markOk(name: ProviderName): void;
}

export function createProviderHealth(now: () => number = Date.now): ProviderHealth {
  const until = new Map<ProviderName, number>();
  return {
    isCooling: (name) => (until.get(name) ?? 0) > now(),
    markFailed(name, code) {
      const ms = COOLDOWN_MS[code];
      if (ms) until.set(name, now() + ms);
    },
    markOk: (name) => {
      until.delete(name);
    },
  };
}

/** Shared by every request this server instance handles. */
export const sharedProviderHealth = createProviderHealth();
