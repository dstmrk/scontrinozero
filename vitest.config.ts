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
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.{ts,mjs}"],
      exclude: [
        "src/components/ui/**",
        "src/db/schema/**", // Drizzle ORM declarations — pure config, no business logic
        "src/lib/contact.ts", // pure constant, no business logic
        "src/app/layout.tsx",
        "src/**/*.d.ts",
        "src/app/**/page.tsx", // UI page shells — pure presentation, no testable logic
        "src/app/**/layout.tsx", // layout shells — pure presentation, no testable logic
        "src/app/**/loading.tsx", // loading skeletons — pure UI, no logic
        // UI orchestration components — pure UI shells, no testable logic
        "src/app/onboarding/onboarding-form.tsx",
        "src/components/cassa/cassa-client.tsx",
        "src/components/cassa/receipt-success.tsx",
        "src/components/storico/storico-client.tsx",
        "src/components/storico/void-receipt-dialog.tsx",
        "src/components/providers.tsx",
        "src/components/marketing/**", // marketing UI components — tested via E2E
        "src/components/billing/checkout-button.tsx", // UI client component — pure fetch + redirect
        "src/components/settings/export-data-section.tsx", // UI client component — pure download trigger
        "src/components/settings/account-delete-section.tsx", // UI client component — mutation + dialog, pure UI
        "src/components/settings/api-key-section.tsx", // UI client component — mutation + dialog, pure UI
        "src/components/settings/ade-credentials-section.tsx", // UI client component — verify action + timer, pure UI
        "src/components/settings/change-password-section.tsx", // UI client component — form + dialog, pure UI
        "src/components/settings/edit-profile-section.tsx", // UI client component — form + dialog, pure UI
        "src/components/settings/edit-business-section.tsx", // UI client component — form + dialog, pure UI
        "src/components/settings/edit-settings-dialog.tsx", // UI client component — shared dialog shell, pure UI
        "src/sw.ts", // service worker entry point — pure infrastructure, no testable logic
        "src/app/offline/page.tsx", // static offline shell — pure UI, no logic
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
