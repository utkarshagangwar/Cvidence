import { expect, test, type Page } from "@playwright/test";

// Layout checks for every screen: no sideways scroll, nothing wider than the
// viewport, main content blocks share one left edge and one max width.
// Also saves a full-page screenshot per screen for a human look.

const APP_PAGES = ["/dashboard", "/jobs", "/jobs/sources", "/jobs?view=saved", "/applications", "/applications?view=table", "/applications/new", "/profile", "/settings"];

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const r = el.getBoundingClientRect();
      // Fixed bars and screen-reader-only content (clipped to 1px) can't push the page sideways.
      if (r.width === 0 || getComputedStyle(el).position === "fixed" || el.closest(".sr-only")) continue;
      if (r.right > vw + 1 || r.left < -1) {
        offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} (${Math.round(r.left)}→${Math.round(r.right)} of ${vw})`);
      }
    }
    return { scroll: document.documentElement.scrollWidth > vw + 1, offenders: offenders.slice(0, 8) };
  });
}

/** Left edges and widths of the blocks in the shared page column. */
async function mainColumns(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main [data-page]");
    if (!main) return [];
    return Array.from(main.children).map((c) => {
      const r = (c as HTMLElement).getBoundingClientRect();
      return { left: Math.round(r.left), width: Math.round(r.width) };
    });
  });
}

for (const path of APP_PAGES) {
  test(`app page ${path} fits and lines up`, async ({ page }, info) => {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await page.screenshot({ path: `test-results/shots/${info.project.name}${path.replace(/[/?=&]/g, "_")}.png`, fullPage: true });

    const overflow = await horizontalOverflow(page);
    expect(overflow.offenders, "elements sticking out of the viewport").toEqual([]);
    expect(overflow.scroll, "page scrolls sideways").toBe(false);

    const cols = await mainColumns(page);
    const lefts = new Set(cols.map((c) => c.left));
    expect([...lefts], "main blocks should share one left edge").toHaveLength(1);
    const widths = new Set(cols.map((c) => c.width));
    expect([...widths], "main blocks should share one width").toHaveLength(1);
  });
}

test("home page fits with no sideways scroll", async ({ browser }, info) => {
  const ctx = await browser.newContext({ ...info.project.use, storageState: undefined, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("backed by your profile");
  await page.screenshot({ path: `test-results/shots/${info.project.name}_home.png`, fullPage: true });
  const overflow = await horizontalOverflow(page);
  expect(overflow.offenders).toEqual([]);
  expect(overflow.scroll).toBe(false);
  // Primary call to action is visible without scrolling.
  await expect(page.getByRole("main").getByRole("link", { name: "Start free" }).first()).toBeInViewport();
  await ctx.close();
});

test("login page fits and is centred", async ({ browser }, info) => {
  const ctx = await browser.newContext({ ...info.project.use, storageState: undefined });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.screenshot({ path: `test-results/shots/${info.project.name}_login.png`, fullPage: true });
  const overflow = await horizontalOverflow(page);
  expect(overflow.offenders).toEqual([]);
  const box = await page.getByRole("region", { name: "Sign in" }).boundingBox();
  const vw = page.viewportSize()!.width;
  expect(box).not.toBeNull();
  expect(Math.abs(box!.x + box!.width / 2 - vw / 2)).toBeLessThanOrEqual(2);
  await ctx.close();
});

for (const path of ["/privacy", "/terms"]) {
  test(`public page ${path} fits`, async ({ browser }, info) => {
    const ctx = await browser.newContext({ ...info.project.use, storageState: undefined });
    const page = await ctx.newPage();
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({ path: `test-results/shots/${info.project.name}${path.replace(/[/?=&]/g, "_")}.png`, fullPage: true });
    const overflow = await horizontalOverflow(page);
    expect(overflow.offenders).toEqual([]);
    await ctx.close();
  });
}

test("skip link jumps to the page content", async ({ page }) => {
  await page.goto("/dashboard");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});
