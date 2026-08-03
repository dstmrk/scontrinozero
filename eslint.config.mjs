import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Explicitly set react.version to avoid auto-detection overhead on every lint run.
    settings: {
      react: { version: "19" },
    },
    plugins: { prettier: prettierPlugin },
    rules: {
      "prettier/prettier": "error",
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
  prettierConfig,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Service worker generato da `serwist build` (bundle esbuild minificato +
    // precache manifest). Prima di REVIEW #84 non veniva mai emesso, quindi
    // non era mai presente nel working tree e nessuno se n'era accorto.
    "public/sw.js",
    "public/sw.js.map",
  ]),
]);

export default eslintConfig;
