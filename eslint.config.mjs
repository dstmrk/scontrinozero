import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";
import vitest from "@vitest/eslint-plugin";
import sonarjs from "eslint-plugin-sonarjs";

// Le regole SonarJS che giravano su SonarCloud, ora in locale (SonarCloud
// non c'è più). Il perimetro ricalca quello che aveva lo scan, solo `src/`:
// `scripts/` e i file di config restano fuori.
// Le 18 regole `aws-*` controllano stack AWS CDK che qui non esistono, e una
// da sola costava 7,6 s di lint.
const SONAR_TEST_RULE =
  /assert|test|no-skipped|no-exclusive|no-fixed-wait|stable-tests|vitest-mock|testing-library/;
const sonarRecommended = sonarjs.configs.recommended.rules;
const sonarProdRules = Object.fromEntries(
  Object.entries(sonarRecommended).map(([rule, level]) => [
    rule,
    rule.startsWith("sonarjs/aws-") ? "off" : level,
  ]),
);
// Sui test solo le regole pensate per i test (asserzioni, titoli duplicati,
// test saltati): le altre, applicate a fixture e mock, segnalano IP e
// password finte e confronti esatti tra float voluti.
const sonarTestRules = Object.fromEntries(
  Object.entries(sonarRecommended).filter(([rule]) =>
    SONAR_TEST_RULE.test(rule.slice("sonarjs/".length)),
  ),
);
const TEST_FILES = ["**/*.test.{ts,tsx}", "tests/**/*.{ts,tsx}"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Explicitly set react.version to avoid auto-detection overhead on every lint run.
    settings: {
      react: { version: "19" },
    },
    rules: {
      // Honor the `_` prefix convention for intentionally unused variables/args.
      // Required when an interface or signature forces a parameter name (e.g.
      // route handlers `GET(_req)`, mock client `submitSale(_payload)`).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: TEST_FILES,
    plugins: { sonarjs },
    rules: sonarProdRules,
  },
  {
    // Un `it()` senza `expect()` passa `npm run test`: Vitest lo conta come
    // verde. Le altre due trappole storiche (mock di classi con arrow,
    // variabili senza prefisso `mock` nei factory `vi.mock`) fanno già
    // fallire il test run con un errore esplicito — `TypeError: X is not a
    // constructor` e il messaggio di hoisting di Vitest. Misurato, non
    // dedotto (PR #904).
    files: TEST_FILES,
    plugins: { vitest, sonarjs },
    rules: { "vitest/expect-expect": "error", ...sonarTestRules },
  },
  prettierConfig,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Service worker generato da `serwist build` (bundle esbuild minificato +
    // precache manifest). Prima della PR #790 non veniva mai emesso, quindi
    // non era mai presente nel working tree e nessuno se n'era accorto.
    "public/sw.js",
    // Progetti nativi generati da `cap add` e asset copiati da `cap sync`
    // (native-bridge.js): non sono codice nostro.
    "mobile/ios/**",
    "mobile/android/**",
    "public/sw.js.map",
    // Copia vendorizzata di cloudflare/security-audit-skill (MIT): i validator
    // .cjs restano identici all'upstream, vedi UPSTREAM.md nella directory.
    ".claude/skills/security-audit/**",
  ]),
]);

export default eslintConfig;
