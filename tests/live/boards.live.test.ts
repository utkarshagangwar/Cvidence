// Live check of every seeded board through the real adapters. Network only, no
// database. Opt-in: LIVE=1 npx vitest run --config vitest.eval.config.mts tests/live
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fetchSource } from "@/lib/jobs/fetch";
import { availableInIndia } from "@/lib/jobs/prefilter";
import { getAdapter } from "@/lib/jobs/registry";

const enabled = process.env.LIVE === "1";
const seed = [...readFileSync("supabase/migrations/20261103000004_jobs.sql", "utf8").matchAll(/\('([a-z_]+)', '([^']+)', '([^']+)'\)/g)].map((m) => ({
  adapter: m[1]!,
  slug: m[2]!,
  company: m[3]!,
}));

describe.skipIf(!enabled)("live boards", () => {
  it("parses every seeded board", { timeout: 600_000 }, async () => {
    const rows: string[] = [];
    let failures = 0;
    for (const s of seed) {
      const adapter = getAdapter(s.adapter)!;
      try {
        const { postings } = await fetchSource(adapter, { id: "live", ...s, config: {} }, {});
        const india = postings.filter(availableInIndia).length;
        const noDesc = postings.filter((p) => p.description.length < 100).length;
        const noDate = postings.filter((p) => !p.postedAt).length;
        rows.push(`${s.adapter.padEnd(10)} ${s.slug.padEnd(12)} jobs=${postings.length} india=${india} shortDesc=${noDesc} noDate=${noDate}`);
      } catch (err) {
        failures++;
        rows.push(`${s.adapter.padEnd(10)} ${s.slug.padEnd(12)} ERROR ${(err as Error).message}`);
      }
    }
    process.stderr.write("\n" + rows.join("\n") + "\n");
    expect(seed.length).toBe(36);
    expect(failures, rows.join("\n")).toBeLessThanOrEqual(2);
  });
});
