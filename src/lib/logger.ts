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

// pino numeric levels: error=50, fatal=60
const PINO_ERROR_LEVEL = 50;

function captureToSentry(obj: unknown, msg?: string): void {
  if (
    typeof obj === "object" &&
    obj !== null &&
    "err" in obj &&
    (obj as { err: unknown }).err instanceof Error
  ) {
    Sentry.captureException((obj as { err: Error }).err, {
      extra: obj as Record<string, unknown>,
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
