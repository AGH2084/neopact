import { defineConfig } from "@playwright/test";

// Uses Playwright's bundled Chromium unless CHROME_PATH points at a local browser.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.FRONTEND_URL || "http://localhost:3100",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {},
  },
});
