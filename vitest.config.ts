import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// I .test.ts che richiedono un DOM (window/sessionStorage/renderHook): girano
// nel progetto jsdom insieme a tutti i .test.tsx. Ogni altro .test.ts è
// server-side e gira nel più economico environment node — il pragma per-file
// `@vitest-environment` resta supportato e vince comunque sul progetto.
const JSDOM_TS_TESTS = [
  "src/hooks/use-cart-idempotency-key.test.ts",
  "src/hooks/use-cassa.test.ts",
  "src/lib/hash-target.test.ts",
  "src/lib/safe-storage.test.ts",
  "src/lib/deploy-skew.test.ts",
  "src/lib/pwa/install-prompt-store.test.ts",
  "src/lib/printing/support.test.ts",
  "src/lib/printing/printer-preferences.test.ts",
  "src/lib/printing/bluetooth-printer.test.ts",
  "src/hooks/use-printer.test.ts",
];

// I test che inizializzano un SDK vero con stato di thread: `Sentry.init`
// aggancia l'instrumentation HTTP (OpenTelemetry) al suo client per tutto il
// thread, e nessun reset fra file la sgancia. Con `isolate: false` un init
// precedente nello stesso worker rubava gli eventi a questo file (5 test
// rossi, 2 run su 20), e il suo init restava attivo per i file dopo. Qui
// girano in un worker loro.
const REAL_SDK_TESTS = ["tests/unit/sentry-data-collection.test.ts"];

export default defineConfig({
  plugins: [react()],
  test: {
    testTimeout: 15000,
    // Ordine casuale dei test dentro ogni file, a ogni run: un test che
    // dipende dallo stato lasciato da un altro (code mockReturnValueOnce non
    // consumate, mock configurati da un describe vicino) fallisce qui invece
    // di restare verde per caso. Il seed è in testa all'output ("Running
    // tests with seed ..."): si riproduce con `--sequence.seed=<seed>`.
    // I file restano nell'ordine per durata di Vitest: mescolarli costava
    // ~60s contro ~26s (i file lunghi finivano in coda), e i leak fra file
    // emergono comunque, perché l'assegnazione dei file ai worker cambia a
    // ogni run. Skill `testing-patterns`.
    sequence: { shuffle: { files: false, tests: true } },
    // Un solo contesto per worker invece di uno per file: setup di modulo,
    // jsdom e import pesanti si pagano una volta. Lo stato che un file
    // lascia al successivo lo azzera tests/reset-between-files.ts.
    pool: "threads",
    isolate: false,
    // Node ≥ 25 espone localStorage/sessionStorage su globalThis di default,
    // e populateGlobal di vitest salta le chiavi già presenti sul global: lo
    // Storage di jsdom non verrebbe mai installato e i test vedrebbero lo
    // stub di Node (senza --localstorage-file è un oggetto senza metodi →
    // "localStorage.clear is not a function"). Il flag — accettato anche da
    // Node 22 e 26 — riporta i worker al comportamento pre-25. Guard fail-fast:
    // tests/setup.ts → tests/_helpers/assert-functional-web-storage.ts.
    execArgv: ["--no-experimental-webstorage"],
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
        "src/app/**/opengraph-image.tsx", // OG route files — thin next/og wrappers, render covered via og-image-template
        "src/app/twitter-image.tsx", // thin next/og wrapper, come gli opengraph-image
        "src/app/global-error.tsx", // fallback di ultima istanza di Next: render statico + Sentry.captureException
        // Wizard di onboarding: l'orchestrazione della verifica AdE È testata
        // (onboarding-form.test.tsx), i tre submit di step 0/1 no. L'esclusione
        // resta finché non lo sono; la motivazione storica "nessuna logica
        // testabile" era falsa (issue #989).
        "src/app/onboarding/onboarding-form.tsx",
        // Auth form shell (Turnstile + react-hook-form), già escluso quando era
        // register/page.tsx; la logica force+lock è verificata server-side in
        // auth-actions.test.ts (enforcePartnerReferral).
        "src/app/(auth)/register/register-form.tsx",
        "src/components/cassa/cassa-client.tsx",
        "src/components/catalogo/catalogo-client.tsx", // UI orchestrator — pure render + setState, same pattern as cassa-client
        "src/lib/ade/types.ts", // pure type declarations + 1 regex constant (covered indirectly via validation)
        "src/app/(marketing)/termini/v01/page.tsx", // static legal text — pure UI, no logic (same as privacy/v01)
        "src/app/(marketing)/condizioni-collaboratori/v01/page.tsx", // static legal text, as termini/v01
        "src/components/cassa/receipt-success.tsx",
        "src/components/storico/storico-client.tsx",
        "src/components/storico/void-receipt-dialog.tsx",
        "src/components/analytics/analytics-client.tsx", // UI orchestrator — pure render + setState
        // Recharts wrappers: il mapping label testabile e' coperto in
        // src/components/analytics/*.chart.test.tsx, ma i Tooltip/Axis formatter
        // non sono raggiungibili in jsdom senza mockare l'intero recharts.
        "src/components/analytics/revenue-sparkline.tsx",
        "src/components/analytics/payment-breakdown.tsx",
        "src/components/analytics/product-breakdown.tsx",
        "src/components/providers.tsx",
        "src/components/marketing/**", // marketing UI components — tested via E2E
        "src/components/billing/checkout-button.tsx", // UI client component — pure fetch + redirect
        "src/components/settings/api-key-section.tsx", // UI client component — mutation + dialog, pure UI
        "src/components/settings/ade-credentials-section.tsx", // UI client component — verify action + timer, pure UI
        "src/components/settings/change-password-section.tsx", // UI client component — form + dialog, pure UI
        "src/components/settings/edit-profile-section.tsx", // UI client component — form + dialog, pure UI
        "src/components/settings/edit-business-section.tsx", // UI client component — form + dialog, pure UI
        "src/components/settings/edit-settings-dialog.tsx", // UI client component — shared dialog shell, pure UI
        "src/components/settings/edit-ade-credentials-section.tsx", // UI client component — form + dialog, pure UI
        "src/components/ade/change-ade-password-dialog.tsx", // UI client component — form + dialog, pure UI
        "src/app/offline/page.tsx", // static offline shell — pure UI, no logic
      ],
      // Il gate di coverage (prima lo applicava SonarCloud, 80% sul codice
      // nuovo): `npm run test:coverage` esce con codice 1.
      // - per file, ogni sorgente di src/ copre almeno l'80% delle righe: un
      //   file nuovo senza test non passa, qualunque sia la media;
      // - in aggregato, una rete sotto i valori attuali (97,7% righe, 97,3%
      //   statement, 94,4% branch, 96,9% funzioni al 2026-11-17) contro
      //   l'erosione lenta, distribuita su file che restano sopra l'80%.
      // scripts/ resta fuori dal per-file (non lo analizzava neanche Sonar),
      // ma conta nell'aggregato.
      thresholds: {
        lines: 95,
        statements: 95,
        branches: 92,
        functions: 95,
        "src/**": { perFile: { lines: 80 } },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
          // L'override di `exclude` scarta i default di Vitest (node_modules,
          // dist, ...): vanno re-inclusi esplicitamente.
          exclude: [
            ...configDefaults.exclude,
            ...JSDOM_TS_TESTS,
            ...REAL_SDK_TESTS,
          ],
          setupFiles: ["./tests/reset-between-files.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "node-isolated",
          environment: "node",
          include: REAL_SDK_TESTS,
          isolate: true,
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          setupFiles: ["./tests/reset-between-files.ts", "./tests/setup.ts"],
          include: [
            "src/**/*.test.tsx",
            "tests/**/*.test.tsx",
            ...JSDOM_TS_TESTS,
          ],
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `@point-of-sale/webbluetooth-receipt-printer@2` dichiara negli exports
      // la SOLA condition "browser": Vitest risolve con ["node","import"] e
      // fallisce con "not exported under the conditions" — prima ancora che
      // vi.mock possa intercettare. L'alias punta al build ESM, lo stesso che
      // riceve il browser (dove la condition "browser" si applica davvero).
      "@point-of-sale/webbluetooth-receipt-printer": path.resolve(
        __dirname,
        "./node_modules/@point-of-sale/webbluetooth-receipt-printer/dist/webbluetooth-receipt-printer.esm.js",
      ),
    },
  },
});
