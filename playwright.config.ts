import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Load .env.local so global-setup / teardown can access SUPABASE_SECRET_KEY
// when running locally without shell-level env vars.
loadEnv({ path: ".env.local", override: false });

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],

  webServer: {
    // In CI the build uses output: standalone — next start does not work with it.
    // Use node .next/standalone/server.js directly (requires static assets to be
    // copied beforehand; see the e2e CI job in .github/workflows/ci.yml).
    // Locally, reuse an already-running dev/prod server.
    command: process.env.CI ? "node .next/standalone/server.js" : "npm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
