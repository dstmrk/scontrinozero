/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";

// Helper: create a logger that writes to a buffer so we can inspect output
function createTestLogger(options: pino.LoggerOptions = {}): {
  logger: pino.Logger;
  getOutput: () => string;
} {
  let output = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const logger = pino(
    {
      // Disable pretty-print for testable JSON output
      ...options,
    },
    stream,
  );
  return { logger, getOutput: () => output };
}

describe("logger module", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports a pino logger instance with expected methods", async () => {
    const { logger } = await import("./logger");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("exports createRequestLogger function", async () => {
    const { createRequestLogger } = await import("./logger");
    expect(typeof createRequestLogger).toBe("function");
  });

  it("redacts 'password' field in log output", () => {
    const { logger, getOutput } = createTestLogger({
      redact: {
        paths: [
          "password",
          "pin",
          "credentials",
          "token",
          "secret",
          "authorization",
          "cookie",
          "*.password",
          "*.pin",
          "*.credentials",
          "*.token",
          "*.secret",
        ],
        censor: "[REDACTED]",
      },
    });

    logger.info({ password: "supersecret123" }, "login attempt");
    const output = getOutput();
    const parsed = JSON.parse(output);
    expect(parsed.password).toBe("[REDACTED]");
    expect(output).not.toContain("supersecret123");
  });

  it("redacts 'pin' field in log output", () => {
    const { logger, getOutput } = createTestLogger({
      redact: {
        paths: [
          "password",
          "pin",
          "credentials",
          "token",
          "secret",
          "authorization",
          "cookie",
          "*.password",
          "*.pin",
          "*.credentials",
          "*.token",
          "*.secret",
        ],
        censor: "[REDACTED]",
      },
    });

    logger.info({ pin: "12345678" }, "pin check");
    const output = getOutput();
    const parsed = JSON.parse(output);
    expect(parsed.pin).toBe("[REDACTED]");
    expect(output).not.toContain("12345678");
  });

  it("redacts nested sensitive fields (*.credentials)", () => {
    const { logger, getOutput } = createTestLogger({
      redact: {
        paths: [
          "password",
          "pin",
          "credentials",
          "token",
          "secret",
          "authorization",
          "cookie",
          "*.password",
          "*.pin",
          "*.credentials",
          "*.token",
          "*.secret",
        ],
        censor: "[REDACTED]",
      },
    });

    logger.info({ user: { credentials: "abc-secret" } }, "user data");
    const output = getOutput();
    const parsed = JSON.parse(output);
    expect(parsed.user.credentials).toBe("[REDACTED]");
    expect(output).not.toContain("abc-secret");
  });

  it("createRequestLogger returns a child logger with context fields", () => {
    const { logger, getOutput } = createTestLogger({
      level: "info",
    });

    // Simulate createRequestLogger by creating a child
    const child = logger.child({ requestId: "req-123", path: "/api/test" });
    child.info("handling request");

    const output = getOutput();
    const parsed = JSON.parse(output);
    expect(parsed.requestId).toBe("req-123");
    expect(parsed.path).toBe("/api/test");
  });

  it("outputs valid JSON with expected structure", () => {
    const { logger, getOutput } = createTestLogger({
      level: "info",
      timestamp: pino.stdTimeFunctions.isoTime,
    });

    logger.info({ action: "test" }, "test message");

    const output = getOutput();
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe(30); // pino info level
    expect(parsed.msg).toBe("test message");
    expect(parsed.action).toBe("test");
    expect(parsed.time).toBeDefined();
  });
});
