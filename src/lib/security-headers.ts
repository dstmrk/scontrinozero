import { buildCsp, buildReportingEndpoints } from "./csp";

export type SecurityHeader = { key: string; value: string };

export type BuildSecurityHeadersOptions = {
  readonly nodeEnv: string | undefined;
  readonly allowedOrigin: string;
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
 *  - regression test che `Reporting-Endpoints` usi URL assoluto
 *
 * La policy CSP è generata in `src/lib/csp.ts`. Vedi commento head di quel file
 * per lo storico del rollout (B14 chiuso in v1.2.10).
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
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    },
    { key: cspKey, value: buildCsp() },
    {
      key: "Reporting-Endpoints",
      value: buildReportingEndpoints(opts.allowedOrigin),
    },
  ];

  if (isProduction) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }

  return headers;
}
