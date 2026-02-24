import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/components/ui/**",
        "src/db/schema/**", // Drizzle ORM declarations — pure config, no business logic
        "src/app/layout.tsx",
        "src/**/*.d.ts",
        "src/app/**/page.tsx", // UI templates — tested via E2E
        "src/app/**/layout.tsx", // layout shells — tested via E2E
        // UI orchestration components — multi-step flows tested via E2E
        "src/app/onboarding/onboarding-form.tsx",
        "src/components/cassa/cassa-client.tsx",
        "src/components/cassa/receipt-success.tsx",
        "src/components/storico/storico-client.tsx",
        "src/components/storico/void-receipt-dialog.tsx",
        "src/components/providers.tsx",
      ],
    },
    reporters: ["default", "vitest-sonar-reporter"],
    outputFile: {
      "vitest-sonar-reporter": "test-report.xml",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
