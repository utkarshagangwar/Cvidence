import { expect, test } from "@playwright/test";

// The whole Phase 1 flow in the real app, with the real AI:
// import a resume -> save the profile -> paste a job post -> tailor -> edit a
// line -> undo -> export. Spends about 7 of the test user's 25 daily credits,
// so it only runs when asked: set E2E_AI=1.

test.skip(process.env.E2E_AI !== "1", "spends AI credits; set E2E_AI=1 to run");
test.describe.configure({ mode: "serial" });

const RESUME = `Riya Sharma
QA Automation Engineer | Bengaluru | +91 98450 00000

Summary
QA engineer with 4 years of manual and automated testing across logistics and edtech.

Experience
QA Automation Engineer, Northwind Logistics - Bengaluru            Mar 2022 - Present
- Built a Selenium WebDriver and Python suite on the Page Object Model covering 320 regression cases.
- Cut regression time from 2 days to 5 hours by running tests in parallel in GitHub Actions.
QA Engineer, Learnly Edtech - Pune                                  07/2020 - 02/2022
- Wrote 600 manual test cases for the parent app and logged defects in Jira.
- Automated smoke tests with Robot Framework.

Education
B.E. Computer Science, PES University, 2016 - 2020

Skills: Selenium, Python, Pytest, Robot Framework, Postman, SQL, Git, Jira, GitHub Actions
Languages: English, Hindi`;

const JD = `QA Automation Engineer II - Kitebird Payments, Bengaluru (hybrid)
We are hiring a QA engineer to own our web regression suite.
Must have: Selenium WebDriver with Python, Pytest, REST API testing with Postman, SQL, 3+ years in test automation.
Nice to have: Appium, payments domain experience, Hindi.`;

test("import, tailor, edit, undo and export", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough");
  test.setTimeout(300_000);

  // 1. Import a resume file and save it as the profile.
  await page.goto("/profile");
  await page.locator("#resume-file").setInputFiles({ name: "riya.md", mimeType: "text/markdown", buffer: Buffer.from(RESUME) });
  await expect(page.getByText(/Draft from/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByLabel("Full name")).toHaveValue("Riya Sharma");
  await page.getByRole("button", { name: "Save imported profile" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 30_000 });

  // The save really landed: a reload shows the imported roles.
  await page.reload();
  await expect(page.getByLabel("Company").first()).toHaveValue(/Northwind/);

  // 2. Paste a job post and read it.
  await page.goto("/applications/new");
  await page.getByLabel("Job description").fill(JD);
  await page.getByRole("button", { name: /Read and match/ }).click();
  await page.waitForURL(/\/applications\/[0-9a-f-]{36}$/, { timeout: 120_000 });
  await expect(page.getByText(/Selenium/).first()).toBeVisible();

  // 3. Tailor.
  await page.getByRole("button", { name: /Tailor resume/ }).click();
  const editButtons = page.getByRole("button", { name: /^Edit line/ });
  await expect(editButtons.first()).toBeVisible({ timeout: 150_000 });
  await expect(page.getByRole("region", { name: "Versions" })).toContainText("v1");

  // 4. Edit one line by hand.
  const marker = "Edited by the end-to-end test.";
  await editButtons.first().click();
  const box = page.getByLabel("Edit this line");
  const original = await box.inputValue();
  await box.fill(marker);
  await page.getByRole("button", { name: "Save line" }).click();
  // The edit box holds the marker too, so wait for it to close (save finished) first.
  await expect(box).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText(marker)).toBeVisible();
  await expect(page.getByRole("region", { name: "Versions" })).toContainText("v2", { timeout: 15_000 });

  // 5. Undo brings the original line back as a new version (history is never rewritten).
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect(page.getByText(marker)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText(original.slice(0, 40)).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Versions" })).toContainText("v3", { timeout: 15_000 });

  // 6. Export: DOCX downloads, the PDF page renders the resume.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "DOCX" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.docx$/);

  // Open the PDF link's address directly: Edge opens its own Downloads tab after
  // the DOCX download, so "the next new tab" isn't reliably the print page.
  const href = await page.getByRole("link", { name: "PDF" }).getAttribute("href");
  expect(href).toMatch(/^\/print\/applications\//);
  const print = await page.context().newPage();
  await print.goto(href!);
  await expect(print.getByText("Riya Sharma").first()).toBeVisible();
  await print.screenshot({ path: "test-results/shots/flow_print.png", fullPage: true });
});
