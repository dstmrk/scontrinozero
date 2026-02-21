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
  "*.password",
  "*.pin",
  "*.credentials",
  "*.token",
  "*.secret",
  "*.codiceFiscale",
  "*.encryptedCodiceFiscale",
  "*.encryptedPassword",
  "*.encryptedPin",
];

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
});

/**
 * Create a child logger with request-scoped context.
 * Use in API routes and server actions.
 */
export function createRequestLogger(context: LogContext): pino.Logger {
  return logger.child(context);
}
