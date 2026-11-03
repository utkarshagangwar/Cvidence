// Every job board the worker knows. Adding a board = one adapter file + one line here.
// See lib/jobs/types.ts for the full checklist.

import { ashby } from "./adapters/ashby";
import { greenhouse } from "./adapters/greenhouse";
import { lever } from "./adapters/lever";
import { workable } from "./adapters/workable";
import type { SourceAdapter } from "./types";

export const ADAPTERS: readonly SourceAdapter[] = [greenhouse, lever, ashby, workable];

const byId = new Map(ADAPTERS.map((a) => [a.id, a]));

export function getAdapter(id: string): SourceAdapter | undefined {
  return byId.get(id);
}

export function adapterLabel(id: string): string {
  return byId.get(id)?.label ?? id;
}

/** Env vars an adapter still needs. Empty means it can run. */
export function missingEnv(adapter: SourceAdapter, env: Readonly<Record<string, string | undefined>>): string[] {
  return (adapter.requiredEnv ?? []).filter((name) => !env[name]);
}
