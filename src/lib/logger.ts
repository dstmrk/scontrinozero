import * as Sentry from "@sentry/nextjs";
import { hostname } from "node:os";
import pino from "pino";
import { getAppRelease } from "./version";
import { getRequestContext } from "./request-context";

/**
 * Pino redaction paths. Censored during serialisation (`asJson`), so they are
 * stripped from BOTH the container stdout logs AND the Sentry Logs stream:
 * `Sentry.pinoIntegration()` taps the post-serialisation `pino_asJson` channel,
 * forwarding every NON-redacted field (a denylist). Any PII logged anywhere must
 * therefore live here — e.g. raw `ip`/`*.ip` (GDPR personal data, logged at warn
 * level by the changePassword rate limit and the CSP report endpoint). Use
 * `ipHash` for correlation instead.
 */
export const REDACT_PATHS = [
  "password",
  "pin",
  "credentials",
  "token",
  "secret",
  "authorization",
  "cookie",
  "ip",
  "codiceFiscale",
  "encryptedCodiceFiscale",
  "encryptedPassword",
  "encryptedPin",
  "keyHash",
  "apiKeyRaw",
  "actionLink",
  "resetLink",
  "tokenHash",
  "*.password",
  "*.pin",
  "*.credentials",
  "*.token",
  "*.secret",
  "*.ip",
  "*.codiceFiscale",
  "*.encryptedCodiceFiscale",
  "*.encryptedPassword",
  "*.encryptedPin",
  "*.keyHash",
  "*.apiKeyRaw",
  "*.actionLink",
  "*.resetLink",
  "*.tokenHash",
];

/**
 * Safe allowlist of context fields that may be sent to Sentry.
 * IMPORTANT: pino's redaction runs during serialisation, AFTER the logMethod
 * hook fires — so `inputArgs[0]` is the raw object at hook time.
 * This function must be called before any Sentry capture to prevent PII/secrets
 * (password, token, codiceFiscale, actionLink, cookie, …) from leaking to the
 * third-party observability platform.
 */
export function sanitizeForTelemetry(obj: unknown): Record<string, unknown> {
  if (typeof obj !== "object" || obj === null) return {};

  const raw = obj as Record<string, unknown>;

  // Only forward these safe, non-sensitive context keys.
  // NOTE: `ip` is intentionally excluded — raw IPs are personal data (GDPR) and must
  // never reach third-party telemetry. Use `ipHash` for correlation.
  const SAFE_KEYS: ReadonlyArray<string> = [
    "requestId",
    "path",
    "method",
    "userId",
    "eventType",
    "statusCode",
    "documentId",
    "businessId",
    "voidDocumentId",
    "saleDocumentId",
    "apiKeyId",
    "adeTransactionId",
    "adeProgressivo",
    "adeErrorCodes",
    "adeErrorDescriptions",
    "action",
    "ipHash",
    "errorClass",
    "captchaHostname",
    "critical",
    "sentinelId",
  ];

  const safe: Record<string, unknown> = {};
  for (const key of SAFE_KEYS) {
    if (key in raw) {
      safe[key] = raw[key];
    }
  }

  // Include error as {name, message} only — never the full stack or cause chain
  // which may embed sensitive request data.
  const rawErr = raw["err"];
  if (rawErr instanceof Error) {
    safe["err"] = { name: rawErr.name, message: rawErr.message };
  }

  return safe;
}

// pino numeric levels: error=50, fatal=60
const PINO_ERROR_LEVEL = 50;

function extractFingerprint(obj: unknown): string[] | null {
  if (typeof obj !== "object" || obj === null) return null;
  const fp = (obj as Record<string, unknown>)["sentryFingerprint"];
  if (!Array.isArray(fp) || fp.length === 0) return null;
  // Defensive: drop non-string entries before passing to Sentry, which would
  // otherwise stringify them in non-obvious ways and pollute the group key.
  const stringFp = fp.filter((x): x is string => typeof x === "string");
  return stringFp.length > 0 ? stringFp : null;
}

function doCapture(obj: unknown, msg?: string): void {
  const sanitized = sanitizeForTelemetry(obj);

  if (
    typeof obj === "object" &&
    obj !== null &&
    "err" in obj &&
    obj.err instanceof Error
  ) {
    Sentry.captureException(obj.err, {
      extra: sanitized,
    });
  } else if (obj instanceof Error) {
    Sentry.captureException(obj);
  } else {
    Sentry.captureMessage(String(msg ?? obj), "error");
  }
}

function captureToSentry(obj: unknown, msg?: string): void {
  const fingerprint = extractFingerprint(obj);
  const requestId = getRequestContext()?.requestId;
  if (!fingerprint && !requestId) {
    doCapture(obj, msg);
    return;
  }
  // Wrap the capture in a scope so fingerprint and tag only route THIS event
  // and don't leak into subsequent unrelated captures within the same async
  // context. Fingerprint: regola 23 di CLAUDE.md (SCONTRINOZERO-9/-A
  // grouping). Tag: il requestId v1 che l'integratore ci gira in un ticket.
  Sentry.withScope((scope) => {
    if (fingerprint) scope.setFingerprint(fingerprint);
    if (requestId) scope.setTag("requestId", requestId);
    doCapture(obj, msg);
  });
}

/**
 * Aggiunge il `requestId` della richiesta in corso (`src/lib/request-context.ts`)
 * a ogni riga di log scritta durante la richiesta, a qualunque profondità.
 * Solo il requestId: chiave e attività le portano già le righe che ne hanno
 * bisogno, e la riga di chiusura della richiesta v1 le riporta tutte.
 */
export function requestContextMixin(): { requestId?: string } {
  const requestId = getRequestContext()?.requestId;
  return requestId ? { requestId } : {};
}

export const logger = pino({
  level:
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === "production" ? "info" : "debug"),
  // `release` su ogni riga (docker logs + Sentry Logs) per legare un log al
  // commit in esecuzione (getAppRelease() = scontrinozero@<versione>+<sha>).
  // pid/hostname replicano il base di default di pino, che `base` sovrascrive.
  base: { pid: process.pid, hostname: hostname(), release: getAppRelease() },
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin: requestContextMixin,
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
  hooks: {
    logMethod(inputArgs, method, level) {
      if (level >= PINO_ERROR_LEVEL) {
        captureToSentry(
          inputArgs[0],
          typeof inputArgs[1] === "string" ? inputArgs[1] : undefined,
        );
      }
      return method.apply(this, inputArgs);
    },
  },
});
