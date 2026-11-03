import { z } from "zod";
import { searchSchema } from "@/lib/jobs/prefilter";

// Saved search for the agent: the Find Jobs filters minus the view.
export const agentFiltersSchema = searchSchema.omit({ view: true });

export const agentSettingsSchema = z.object({
  enabled: z.boolean(),
  filters: agentFiltersSchema,
  threshold: z.coerce.number().int().min(40).max(95),
  max_drafts: z.coerce.number().int().min(1).max(5),
  digest: z.boolean(),
});
export type AgentSettings = z.infer<typeof agentSettingsSchema>;

export const DEFAULT_AGENT: AgentSettings = {
  enabled: false,
  filters: agentFiltersSchema.parse({}),
  threshold: 70,
  max_drafts: 3,
  digest: true,
};

/** Worst case per run: 2 credits to score 16 jobs + 5 per draft (read 1, match 1, tailor 3). */
export const SCORE_PER_RUN = 16;
export const creditsPerRun = (maxDrafts: number) => 2 + maxDrafts * 5;

export function parseAgentSettings(row: Record<string, unknown> | null): AgentSettings {
  if (!row) return DEFAULT_AGENT;
  const parsed = agentSettingsSchema.safeParse({ ...row, filters: agentFiltersSchema.parse(row.filters ?? {}) });
  return parsed.success ? parsed.data : DEFAULT_AGENT;
}
