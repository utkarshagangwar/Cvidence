import { describe, expect, it } from "vitest";
import { buildDigest } from "@/lib/agent/digest";
import { creditsPerRun, DEFAULT_AGENT, parseAgentSettings } from "@/lib/agent/settings";

describe("agent settings", () => {
  it("is off by default and falls back to defaults on bad rows", () => {
    expect(DEFAULT_AGENT.enabled).toBe(false);
    expect(parseAgentSettings(null)).toEqual(DEFAULT_AGENT);
    expect(parseAgentSettings({ enabled: true, filters: {}, threshold: 300, max_drafts: 3, digest: true })).toEqual(DEFAULT_AGENT);
  });
  it("keeps valid saved filters and drops unknown levels", () => {
    const s = parseAgentSettings({ enabled: true, filters: { q: "sdet", exclude: ["senior", "boss"] }, threshold: 75, max_drafts: 2, digest: false });
    expect(s).toMatchObject({ enabled: true, threshold: 75, max_drafts: 2, digest: false });
    expect(s.filters.q).toBe("sdet");
    expect(s.filters.exclude).toEqual([]); // one bad value fails the list safely
  });
  it("states the worst-case credit cost", () => {
    expect(creditsPerRun(3)).toBe(17);
    expect(creditsPerRun(5)).toBe(27);
  });
});

describe("buildDigest", () => {
  const base = { name: "Riya Sharma", siteUrl: "https://app.example/", found: 12, note: null };

  it("lists drafts with links, says nothing was sent, and escapes titles", () => {
    const d = buildDigest({ ...base, drafts: [{ applicationId: "abc", title: "QA <script>", company: "Acme & Co", score: 82 }], matches: [] });
    expect(d.subject).toBe("1 draft ready to review");
    expect(d.text).toContain("https://app.example/applications/abc");
    expect(d.text).toContain("nothing has been sent");
    expect(d.html).toContain("QA &lt;script&gt;");
    expect(d.html).toContain("Acme &amp; Co");
    expect(d.html).not.toContain("<script>");
    expect(d.text).toContain("Good morning, Riya.");
  });

  it("has an off switch link and a plain subject when nothing was drafted", () => {
    const d = buildDigest({ ...base, drafts: [], matches: [{ title: "SDET", company: "X", score: 66 }] });
    expect(d.subject).toBe("1 new job worth a look");
    expect(d.text).toContain("https://app.example/settings");
    expect(buildDigest({ ...base, drafts: [], matches: [] }).subject).toBe("No new matches today");
  });
});
