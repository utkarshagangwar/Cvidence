import { describe, expect, it } from "vitest";
import { ashby } from "@/lib/jobs/adapters/ashby";
import { greenhouse } from "@/lib/jobs/adapters/greenhouse";
import { lever } from "@/lib/jobs/adapters/lever";
import { workable } from "@/lib/jobs/adapters/workable";
import { fetchSource, SourceError } from "@/lib/jobs/fetch";
import { normaliseAll, normalisePosting } from "@/lib/jobs/normalise";
import { availableInIndia, prefilter, searchSchema, seniorityOf, titleMatcher } from "@/lib/jobs/prefilter";
import { ADAPTERS, getAdapter, missingEnv } from "@/lib/jobs/registry";
import { applySeniorityRules } from "@/lib/jobs/score-rules";
import { htmlToText } from "@/lib/jobs/text";
import type { SourceAdapter, SourceConfig } from "@/lib/jobs/types";

// Fixture dates are relative to now so the tests never go stale.
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const src = (adapter: string, slug = "acme"): SourceConfig => ({ id: "s1", adapter, slug, company: "Acme", config: {} });

describe("htmlToText", () => {
  it("decodes Greenhouse's double-escaped HTML into readable lines", () => {
    const html = "&lt;div&gt;&lt;strong&gt;About Groww:&lt;/strong&gt;&lt;/div&gt;&lt;ul&gt;&lt;li&gt;Python &amp;amp; SQL&lt;/li&gt;&lt;/ul&gt;";
    expect(htmlToText(html, { escaped: true })).toBe("About Groww:\n- Python & SQL");
  });
  it("drops scripts and styles instead of showing them", () => {
    expect(htmlToText("<p>Hi</p><script>alert(1)</script><style>p{}</style>")).toBe("Hi");
  });
  it("decodes numeric entities", () => {
    expect(htmlToText("Caf&#233; &#x2014; &rsquo;")).toBe("Café — '");
  });
});

describe("greenhouse parser", () => {
  const body = {
    jobs: [
      {
        id: 4970739101,
        title: "QA Automation Engineer",
        company_name: "Groww",
        location: { name: "Bengaluru, India" },
        absolute_url: "https://job-boards.greenhouse.io/groww/jobs/4970739101",
        content: "&lt;p&gt;Selenium &amp;amp; Python&lt;/p&gt;",
        first_published: daysAgo(3).toISOString(),
        updated_at: daysAgo(1).toISOString(),
      },
      { id: 2, title: "", absolute_url: "https://x.test" },
      "not an object",
    ],
    meta: { total: 3 },
  };
  it("reads fields, unescapes content and skips bad items", () => {
    const out = normaliseAll(greenhouse.parse(body, src("greenhouse", "groww")).postings, "Groww");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ externalId: "4970739101", title: "QA Automation Engineer", company: "Groww", description: "Selenium & Python", location: "Bengaluru, India" });
    expect(out[0]!.postedAt).toBe(daysAgo(3).toISOString().slice(0, 10) + out[0]!.postedAt!.slice(10));
  });
  it("builds the board URL with an encoded slug", () => {
    expect(greenhouse.request(src("greenhouse", "a/b"), 0, {}).url).toBe("https://boards-api.greenhouse.io/v1/boards/a%2Fb/jobs?content=true");
  });
});

describe("lever parser", () => {
  const created = daysAgo(2).getTime();
  const body = [
    {
      id: "aa98a938-af3a-45f5-851d-966b2b5bad33",
      text: "SDET II",
      categories: { commitment: "full time", location: "Bengaluru", allLocations: ["Bengaluru"] },
      createdAt: created,
      descriptionPlain: "Own our test suite.",
      lists: [{ text: "Requirements", content: "<ul><li>Selenium</li><li>Python</li></ul>" }],
      additionalPlain: "We offer health cover.",
      workplaceType: "remote",
      hostedUrl: "https://jobs.lever.co/cred/aa98a938",
      salaryRange: { currency: "INR", min: 2000000, max: 3000000, interval: "per-year-salary" },
    },
  ];
  it("treats createdAt as epoch ms and joins description, lists and additional text", () => {
    const [p] = normaliseAll(lever.parse(body, src("lever", "cred")).postings, "CRED");
    expect(p!.postedAt).toBe(new Date(created).toISOString());
    expect(p!.description).toBe("Own our test suite.\n\nRequirements\n- Selenium\n- Python\n\nWe offer health cover.");
    expect(p!.remote).toBe(true);
    expect(p!.salary).toBe("INR 2000000-3000000 per-year-salary");
    expect(p!.company).toBe("Acme"); // Lever has no company field: it comes from the catalog row
  });
});

describe("ashby parser", () => {
  const body = {
    apiVersion: "1",
    jobs: [
      { id: "c6bb", title: "Data Engineer", location: "India", secondaryLocations: [{ location: "Remote" }], isListed: true, isRemote: true, employmentType: "FullTime", jobUrl: "https://jobs.ashbyhq.com/atlan/c6bb", descriptionPlain: "Build pipelines.", publishedAt: daysAgo(5).toISOString() },
      { id: "hidden", title: "Secret role", isListed: false, jobUrl: "https://jobs.ashbyhq.com/atlan/hidden" },
    ],
  };
  it("skips unlisted jobs", () => {
    const out = normaliseAll(ashby.parse(body, src("ashby", "atlan")).postings, "Atlan");
    expect(out.map((p) => p.externalId)).toEqual(["c6bb"]);
    expect(out[0]).toMatchObject({ location: "India, Remote", remote: true, employmentType: "Full Time" });
  });
});

describe("workable parser", () => {
  const body = {
    name: "apna",
    jobs: [
      { title: "Backend Engineer", shortcode: "ABC123", employment_type: "Full-time", telecommuting: false, url: "https://apply.workable.com/j/ABC123", published_on: daysAgo(4).toISOString().slice(0, 10), city: "Mumbai", state: "Maharashtra", country: "India", description: "<p>Node.js</p>" },
      { title: "Remote QA", shortcode: "Q1", telecommuting: true, url: "https://apply.workable.com/j/Q1", locations: [{ city: "", country: "India" }] },
    ],
  };
  it("reads city, state and country, and telecommuting as remote", () => {
    const out = normaliseAll(workable.parse(body, src("workable", "apna")).postings, "apna");
    expect(out[0]).toMatchObject({ externalId: "ABC123", location: "Mumbai, Maharashtra, India", remote: null, description: "Node.js" });
    expect(out[1]).toMatchObject({ location: "India", remote: true });
  });
});

describe("normalisePosting", () => {
  it("refuses non-https links and missing titles", () => {
    expect(normalisePosting({ externalId: "1", title: "QA", url: "javascript:alert(1)" }, "X")).toBeNull();
    expect(normalisePosting({ externalId: "1", title: "QA", url: "http://insecure.test/job" }, "X")).toBeNull();
    expect(normalisePosting({ externalId: "1", title: "  ", url: "https://ok.test/job" }, "X")).toBeNull();
  });
  it("drops impossible dates", () => {
    expect(normalisePosting({ externalId: "1", title: "QA", url: "https://ok.test", postedAt: "1970-01-01" }, "X")!.postedAt).toBeNull();
    expect(normalisePosting({ externalId: "1", title: "QA", url: "https://ok.test", postedAt: Date.now() + 9e9 }, "X")!.postedAt).toBeNull();
  });
  it("drops duplicate ids within a page", () => {
    const p = { externalId: "1", title: "QA", url: "https://ok.test" };
    expect(normaliseAll([p, p], "X")).toHaveLength(1);
  });
});

describe("registry", () => {
  it("has unique, valid adapter ids", () => {
    const ids = ADAPTERS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]{2,40}$/);
    expect(getAdapter("greenhouse")).toBe(greenhouse);
  });
  it("reports missing keys for paid boards by name", () => {
    const paid: SourceAdapter = { id: "paid_board", label: "Paid", requiredEnv: ["PAID_KEY"], request: () => ({ url: "https://x.test" }), parse: () => ({ postings: [] }) };
    expect(missingEnv(paid, {})).toEqual(["PAID_KEY"]);
    expect(missingEnv(paid, { PAID_KEY: "k" })).toEqual([]);
  });
});

describe("fetchSource", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("follows pages until the adapter says stop, and passes keys only through env", async () => {
    const seen: string[] = [];
    const paged: SourceAdapter = {
      id: "paged",
      label: "Paged",
      maxPages: 5,
      requiredEnv: ["PAGED_KEY"],
      request: (_s, page, env) => ({ url: `https://api.paged.test/jobs?page=${page}`, headers: { authorization: `Bearer ${env.PAGED_KEY}` } }),
      parse: (body) => {
        const b = body as { page: number };
        return { postings: [{ externalId: `j${b.page}`, title: `Job ${b.page}`, url: `https://paged.test/${b.page}` }], more: b.page < 2 };
      },
    };
    const fake = (async (url: string, init?: RequestInit) => {
      seen.push(`${url} ${(init?.headers as Record<string, string>).authorization}`);
      return json({ page: Number(new URL(url).searchParams.get("page")) });
    }) as typeof fetch;
    const out = await fetchSource(paged, src("paged"), { PAGED_KEY: "k1" }, fake);
    expect(out.postings.map((p) => p.externalId)).toEqual(["j0", "j1", "j2"]);
    expect(out.complete).toBe(true);
    expect(seen).toEqual(["https://api.paged.test/jobs?page=0 Bearer k1", "https://api.paged.test/jobs?page=1 Bearer k1", "https://api.paged.test/jobs?page=2 Bearer k1"]);
  });

  it("marks the run incomplete when it hits maxPages, so nothing gets closed", async () => {
    const endless: SourceAdapter = { id: "endless", label: "E", maxPages: 2, request: (_s, p) => ({ url: `https://e.test/${p}` }), parse: () => ({ postings: [], more: true }) };
    const out = await fetchSource(endless, src("endless"), {}, (async () => json({})) as typeof fetch);
    expect(out.complete).toBe(false);
  });

  it("turns 429 and 404 into typed errors", async () => {
    await expect(fetchSource(greenhouse, src("greenhouse"), {}, (async () => json({}, 429)) as typeof fetch)).rejects.toMatchObject({ code: "RATE_LIMIT", retryable: true });
    await expect(fetchSource(greenhouse, src("greenhouse"), {}, (async () => json({}, 404)) as typeof fetch)).rejects.toMatchObject({ code: "NOT_FOUND", retryable: false });
  });

  it("rejects non-JSON bodies and adapters that build http URLs", async () => {
    await expect(fetchSource(greenhouse, src("greenhouse"), {}, (async () => new Response("<html>")) as typeof fetch)).rejects.toBeInstanceOf(SourceError);
    const bad: SourceAdapter = { id: "bad", label: "B", request: () => ({ url: "http://169.254.169.254/latest" }), parse: () => ({ postings: [] }) };
    await expect(fetchSource(bad, src("bad"), {}, (async () => json({})) as typeof fetch)).rejects.toMatchObject({ code: "HTTP" });
  });
});

describe("prefilter", () => {
  const post = (title: string, location = "Bengaluru, India", remote: boolean | null = false, ageDays = 1) => ({
    title,
    location,
    remote,
    posted_at: daysAgo(ageDays).toISOString(),
    first_seen_at: daysAgo(ageDays).toISOString(),
  });
  const f = (over: Record<string, unknown> = {}) => searchSchema.parse(over);

  it("matches sde as a whole word and its spelled-out forms", () => {
    const m = titleMatcher("sde");
    expect(m("SDE II, Payments")).toBe(true);
    expect(m("Software Development Engineer")).toBe(true);
    expect(m("Senior Software Engineer")).toBe(true);
    expect(m("Outside Sales")).toBe(false); // "sde" inside "outSiDE" doesn't count
  });

  it("treats commas as OR", () => {
    const m = titleMatcher("qa, sdet");
    expect(m("Quality Assurance Analyst")).toBe(true);
    expect(m("SDET")).toBe(true);
    expect(m("Product Designer")).toBe(false);
  });

  it("keeps India jobs and remote jobs open to India, drops remote-US", () => {
    expect(availableInIndia({ location: "Pune", remote: false })).toBe(true);
    expect(availableInIndia({ location: "Remote", remote: true })).toBe(true);
    expect(availableInIndia({ location: "Remote - APAC", remote: true })).toBe(true);
    expect(availableInIndia({ location: "Remote, US", remote: true })).toBe(false);
    expect(availableInIndia({ location: "San Francisco, CA", remote: false })).toBe(false);
  });

  it("filters by age, remote, city spelling and seniority", () => {
    const list = [post("QA Engineer"), post("QA Engineer", "Bangalore"), post("QA Lead"), post("QA Engineer", "Remote", true), post("QA Engineer", "Mumbai"), post("QA Engineer", "Pune", false, 45)];
    expect(prefilter(list, f({ q: "qa" }))).toHaveLength(5);
    expect(prefilter(list, f({ q: "qa", location: "bengaluru" })).map((p) => p.location)).toEqual(["Bengaluru, India", "Bangalore", "Bengaluru, India", "Remote"]);
    expect(prefilter(list, f({ q: "qa", exclude: "lead" })).some((p) => p.title === "QA Lead")).toBe(false);
    expect(prefilter(list, f({ q: "qa", remote: "remote" }))).toHaveLength(1);
    expect(prefilter(list, f({ q: "qa", days: 60 }))).toHaveLength(6);
  });

  it("falls back to safe defaults on bad query params", () => {
    expect(searchSchema.parse({ days: "999", view: "hack", source: "../x", exclude: "boss" })).toMatchObject({ days: 30, view: "all", source: "", exclude: [] });
  });

  it("reads seniority from titles", () => {
    expect(seniorityOf("Sr. SDET")).toEqual(["senior"]);
    expect(seniorityOf("Staff Engineer")).toEqual(["staff"]);
    expect(seniorityOf("QA Intern")).toEqual(["intern"]);
  });
});

describe("applySeniorityRules", () => {
  const s = { score: 90, reasons: ["Selenium"], redFlags: [] };
  it("caps senior titles for people with little experience and says why", () => {
    expect(applySeniorityRules("Senior QA Engineer", 2.2, s)).toEqual({ score: 45, reasons: ["Selenium"], redFlags: ["Senior-level title; you have 2.2 years of experience"] });
    expect(applySeniorityRules("Staff SDET", 5, s).score).toBe(35);
    expect(applySeniorityRules("Director of QA", 8, s).score).toBe(25);
  });
  it("leaves matching levels and low scores alone", () => {
    expect(applySeniorityRules("Senior QA Engineer", 6, s)).toEqual(s);
    expect(applySeniorityRules("Senior QA Engineer", 1, { ...s, score: 30 }).score).toBe(30);
    expect(applySeniorityRules("QA Intern", 3, s).score).toBe(40);
  });
});
