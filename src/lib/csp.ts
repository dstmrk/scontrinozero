/**
 * Content-Security-Policy in modalità Report-Only.
 *
 * Strategia di rollout (vedi PLAN.md backlog B14):
 *  1. Deploy con header `Content-Security-Policy-Report-Only` in produzione.
 *  2. Raccolta violazioni reali via `/api/csp-report` per ≥ 1 settimana.
 *  3. Promozione a `Content-Security-Policy` (enforce) in PR follow-up dopo
 *     zero violation reali.
 *
 * Limitazioni note di questa fase:
 *  - `script-src 'unsafe-inline'` è temporaneo: serve per i payload JSON-LD
 *    inseriti via `dangerouslySetInnerHTML` in `src/components/json-ld.tsx`.
 *    I contenuti sono già escaped (`safeJsonLd`), quindi sicuri. La migrazione
 *    a nonce-based è scope di una PR successiva (richiede tocco di tutti gli
 *    inserimenti `<JsonLd>` per ricevere il nonce dal middleware).
 *  - `style-src 'unsafe-inline'` resta: Tailwind 4 inline + Radix UI portali
 *    iniettano style runtime non isolabili senza nonce dinamico.
 */

const SUPABASE_HOSTS = [
  "https://*.supabase.co",
  "wss://*.supabase.co",
] as const;
const SENTRY_HOSTS = ["https://*.ingest.sentry.io"] as const;
const TURNSTILE_HOSTS = ["https://challenges.cloudflare.com"] as const;

const CSP_REPORT_PATH = "/api/csp-report";

const DIRECTIVES: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ["default-src", ["'self'"]],
  ["script-src", ["'self'", "'unsafe-inline'", "challenges.cloudflare.com"]],
  ["style-src", ["'self'", "'unsafe-inline'"]],
  ["img-src", ["'self'", "data:"]],
  ["font-src", ["'self'", "data:"]],
  [
    "connect-src",
    ["'self'", ...SUPABASE_HOSTS, ...SENTRY_HOSTS, ...TURNSTILE_HOSTS],
  ],
  ["frame-src", ["'self'", ...TURNSTILE_HOSTS]],
  ["frame-ancestors", ["'none'"]],
  ["base-uri", ["'self'"]],
  ["form-action", ["'self'"]],
  ["object-src", ["'none'"]],
  // CSP3: report-uri ammette URL relativi, risolti rispetto al documento.
  ["report-uri", [CSP_REPORT_PATH]],
  // Reporting API: il token deve combaciare con una entry dell'header
  // `Reporting-Endpoints` (vedi buildReportingEndpoints), che richiede URL
  // assoluto.
  ["report-to", ["csp-endpoint"]],
];

/**
 * Costruisce la stringa CSP report-only deterministica.
 *
 * Output esempio:
 *   default-src 'self'; script-src 'self' 'unsafe-inline' challenges.cloudflare.com; ...
 */
export function buildCspReportOnly(): string {
  return DIRECTIVES.map(
    ([directive, sources]) => `${directive} ${sources.join(" ")}`,
  ).join("; ");
}

/**
 * Costruisce il valore dell'header `Reporting-Endpoints`.
 *
 * La spec Reporting API richiede URL assoluti (potentially-trustworthy):
 * un valore relativo viene parseato dal browser ma il delivery dei report
 * fallisce silenziosamente. Chrome prioritizza `report-to` su `report-uri`,
 * quindi senza URL assoluto le violation reports della maggioranza del
 * traffico vanno perse.
 */
export function buildReportingEndpoints(appUrl: string): string {
  const base = appUrl.endsWith("/") ? appUrl.slice(0, -1) : appUrl;
  return `csp-endpoint="${base}${CSP_REPORT_PATH}"`;
}

// ---------------------------------------------------------------------------
// Sanitizzazione violation report
// ---------------------------------------------------------------------------

const MAX_FIELD_LENGTH = 1024;

/**
 * Mapping da chiavi sorgente (legacy `csp-report` + Reporting API moderna)
 * verso chiavi camelCase normalizzate in output.
 *
 * Allowlist esplicita: tutto ciò che non è qui dentro viene scartato. Evita
 * di propagare campi rumorosi o sensibili (`source-file`, `script-sample`,
 * `line-number`, ecc.) nei log strutturati e in Sentry.
 */
const FIELD_ALIASES: Record<string, "string" | "number"> = {
  // legacy "csp-report" formato Chrome/Firefox/Safari
  "blocked-uri": "string",
  "document-uri": "string",
  "violated-directive": "string",
  "effective-directive": "string",
  "original-policy": "string",
  referrer: "string",
  disposition: "string",
  "status-code": "number",
  // Reporting API (camelCase / URL form)
  blockedURL: "string",
  documentURL: "string",
  violatedDirective: "string",
  effectiveDirective: "string",
  originalPolicy: "string",
  statusCode: "number",
};

const OUTPUT_KEYS: Record<string, string> = {
  "blocked-uri": "blockedUri",
  "document-uri": "documentUri",
  "violated-directive": "violatedDirective",
  "effective-directive": "effectiveDirective",
  "original-policy": "originalPolicy",
  referrer: "referrer",
  disposition: "disposition",
  "status-code": "statusCode",
  blockedURL: "blockedUri",
  documentURL: "documentUri",
  violatedDirective: "violatedDirective",
  effectiveDirective: "effectiveDirective",
  originalPolicy: "originalPolicy",
  statusCode: "statusCode",
};

function truncate(value: string): string {
  return value.length > MAX_FIELD_LENGTH
    ? value.slice(0, MAX_FIELD_LENGTH)
    : value;
}

/**
 * Estrae i campi safe da una violation report (legacy o Reporting API),
 * scartando tutto ciò che non è in allowlist e troncando le stringhe lunghe.
 */
export function sanitizeCspViolation(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null) return {};
  const raw = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [sourceKey, expectedType] of Object.entries(FIELD_ALIASES)) {
    if (!(sourceKey in raw)) continue;
    const value = raw[sourceKey];
    const outKey = OUTPUT_KEYS[sourceKey];
    if (expectedType === "string" && typeof value === "string") {
      out[outKey] = truncate(value);
    } else if (expectedType === "number" && typeof value === "number") {
      out[outKey] = value;
    }
    // altri tipi (oggetti, array, boolean) sono scartati silenziosamente
  }

  return out;
}
