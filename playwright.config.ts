import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Load .env.local so global-setup / teardown can access SUPABASE_SECRET_KEY
// when running locally without shell-level env vars.
loadEnv({ path: ".env.local", override: false });

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const useExistingServer = process.env.PLAYWRIGHT_USE_EXISTING_SERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  timeout: 20_000,

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  use: {
    baseURL,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: useExistingServer
    ? undefined
    : {
        // "next start" does not work with output:standalone — use the standalone server directly.
        command: "node .next/standalone/server.js",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
