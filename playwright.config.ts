import { defineConfig, devices } from "@playwright/test";

// Uses the installed Microsoft Edge (channel "msedge"), so no browser download.
// Start the app first (`npm run dev`), or set E2E_BASE_URL to a preview deploy.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    channel: "msedge",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      dependencies: ["setup"],
      use: { ...devices["Desktop Edge"], viewport: { width: 1440, height: 900 }, storageState: "tests/e2e/.auth/user.json" },
    },
    {
      name: "phone",
      dependencies: ["setup"],
      use: {
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        storageState: "tests/e2e/.auth/user.json",
      },
    },
  ],
});
