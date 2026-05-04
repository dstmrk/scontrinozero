import * as Sentry from "@sentry/nextjs";
import pino from "pino";

export type LogContext = {
  requestId?: string;
  path?: string;
  method?: string;
  userId?: string;
  [key: string]: unknown;
};

const REDACT_PATHS = [
  "password",
  "pin",
  "credentials",
  "token",
  "secret",
  "authorization",
  "cookie",
  "codiceFiscale",
  "encryptedCodiceFiscale",
  "encryptedPassword",
  "encryptedPin",
  "keyHash",
  "apiKeyRaw",
  "actionLink",
  "resetLink",
  "*.password",
  "*.pin",
  "*.credentials",
  "*.token",
  "*.secret",
  "*.codiceFiscale",
  "*.encryptedCodiceFiscale",
  "*.encryptedPassword",
  "*.encryptedPin",
  "*.keyHash",
  "*.apiKeyRaw",
  "*.actionLink",
  "*.resetLink",
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
    "action",
    "ip",
    "ipHash",
    "errorClass",
    "captchaHostname",
    "critical",
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

function captureToSentry(obj: unknown, msg?: string): void {
  const sanitized = sanitizeForTelemetry(obj);

  if (
    typeof obj === "object" &&
    obj !== null &&
    "err" in obj &&
    (obj as { err: unknown }).err instanceof Error
  ) {
    Sentry.captureException((obj as { err: Error }).err, {
      extra: sanitized,
    });
  } else if (obj instanceof Error) {
    Sentry.captureException(obj);
  } else {
    Sentry.captureMessage(String(msg ?? obj), "error");
  }
}

export const logger = pino({
  level:
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === "production" ? "info" : "debug"),
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
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

/**
 * Create a child logger with request-scoped context.
 * Use in API routes and server actions.
 */
export function createRequestLogger(context: LogContext): pino.Logger {
  return logger.child(context);
}
