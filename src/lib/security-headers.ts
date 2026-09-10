import { buildCsp } from "./csp";

export type SecurityHeader = { key: string; value: string };

export type BuildSecurityHeadersOptions = {
  readonly nodeEnv: string | undefined;
};

/**
 * Costruisce la lista di security headers applicati a ogni response.
 *
 * Estratto da `next.config.ts` per essere unit-testabile:
 *  - regression test che la CSP sia in modalità enforce in production
 *  - regression test che la CSP sia in modalità Report-Only in dev/test
 *    (Next.js dev + Turbopack/HMR + React error overlay usano `eval()`, che
 *    richiederebbe `'unsafe-eval'` in `script-src` — preferibile non
 *    enforcearli in locale per non sporcare la console di dev)
 *  - regression test che HSTS sia condizionale a `NODE_ENV === "production"`
 *
 * `Reporting-Endpoints` NON è qui: la Reporting API lo pretende assoluto, e
 * un URL assoluto costruito al build sarebbe quello di produzione anche
 * nell'immagine che serve la sandbox. Lo calcola `src/proxy.ts` a runtime,
 * dove `APP_HOSTNAME` distingue gli ambienti (REVIEW.md #93).
 *
 * La policy CSP è generata in `src/lib/csp.ts`. Vedi CLAUDE.md per il
 * razionale CSP (Report-Only → Enforce).
 */
export function buildSecurityHeaders(
  opts: BuildSecurityHeadersOptions,
): SecurityHeader[] {
  const isProduction = opts.nodeEnv === "production";
  const cspKey = isProduction
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";

  const headers: SecurityHeader[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      // `bluetooth=(self)` è dichiarato esplicitamente: coincide col default
      // di spec, ma la stampa scontrino su termica dipende da
      // `navigator.bluetooth` e un domani una policy più larga (o un
      // `bluetooth=()` copiato per abitudine dalle altre voci) la spegnerebbe
      // in silenzio — `getAvailability()` lancerebbe SecurityError e la
      // feature risulterebbe "non supportata" senza spiegazione.
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(), geolocation=(), interest-cohort=(), bluetooth=(self)",
    },
    { key: cspKey, value: buildCsp() },
  ];

  if (isProduction) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }

  return headers;
}
