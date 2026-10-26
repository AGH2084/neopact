import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Browser UI tests against a production build with every API call mocked; no backend needed.
export default defineConfig({
  ...base,
  testMatch: [
    "guidance.spec.ts",
    "conversation.spec.ts",
    "negotiator-prompt.spec.ts",
    "rules.spec.ts",
  ],
  use: {
    ...base.use,
    baseURL: process.env.FRONTEND_URL || "http://127.0.0.1:3171",
  },
  webServer: process.env.FRONTEND_URL
    ? undefined
    : {
        command: "npx next start --hostname 127.0.0.1 --port 3171",
        url: "http://127.0.0.1:3171",
        reuseExistingServer: false,
        env: { API_INTERNAL_URL: "http://127.0.0.1:1" },
        timeout: 60000,
      },
});
