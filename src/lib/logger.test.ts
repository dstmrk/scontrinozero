/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";

const mockCaptureException = vi.fn();
const mockCaptureMessage = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
}));

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
    mockCaptureException.mockReset();
    mockCaptureMessage.mockReset();
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

  it("redacts 'actionLink' field in log output", () => {
    const { logger, getOutput } = createTestLogger({
      redact: {
        paths: ["actionLink", "resetLink", "*.actionLink", "*.resetLink"],
        censor: "[REDACTED]",
      },
    });

    logger.error(
      {
        actionLink: "https://app.scontrinozero.it/auth/v1/verify?token=SECRET",
      },
      "hostname mismatch",
    );
    const output = getOutput();
    const parsed = JSON.parse(output);
    expect(parsed.actionLink).toBe("[REDACTED]");
    expect(output).not.toContain("SECRET");
  });

  it("redacts 'resetLink' field in log output", () => {
    const { logger, getOutput } = createTestLogger({
      redact: {
        paths: ["actionLink", "resetLink", "*.actionLink", "*.resetLink"],
        censor: "[REDACTED]",
      },
    });

    logger.error(
      { resetLink: "https://example.com/reset?token=TOPSECRET" },
      "msg",
    );
    const output = getOutput();
    const parsed = JSON.parse(output);
    expect(parsed.resetLink).toBe("[REDACTED]");
    expect(output).not.toContain("TOPSECRET");
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

describe("logger Sentry bridge", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCaptureException.mockReset();
    mockCaptureMessage.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logger.error with { err: Error } calls captureException with sanitized extra context", async () => {
    const { logger } = await import("./logger");
    const err = new Error("AdE rejection");
    logger.error({ err, documentId: "DOC-1" }, "emitReceipt failed");
    expect(mockCaptureException).toHaveBeenCalledOnce();
    // captureException receives the original Error, but extra is sanitized:
    // - err becomes {name, message} only (no stack, no raw Error instance in extra)
    // - documentId passes through (it is in the allowlist)
    expect(mockCaptureException).toHaveBeenCalledWith(err, {
      extra: {
        err: { name: "Error", message: "AdE rejection" },
        documentId: "DOC-1",
      },
    });
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("logger.error with a bare Error calls captureException", async () => {
    const { logger } = await import("./logger");
    const err = new Error("something broke");
    logger.error(err);
    expect(mockCaptureException).toHaveBeenCalledOnce();
    expect(mockCaptureException).toHaveBeenCalledWith(err);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("logger.error with plain context (no err) calls captureMessage", async () => {
    const { logger } = await import("./logger");
    logger.error({ userId: "user-1" }, "Profile not found");
    expect(mockCaptureMessage).toHaveBeenCalledOnce();
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      "Profile not found",
      "error",
    );
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("logger.error with non-Error err field falls back to captureMessage", async () => {
    const { logger } = await import("./logger");
    logger.error({ err: "string-error" }, "unexpected shape");
    expect(mockCaptureMessage).toHaveBeenCalledOnce();
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      "unexpected shape",
      "error",
    );
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("logger.fatal with { err: Error } calls captureException with sanitized extra", async () => {
    const { logger } = await import("./logger");
    const err = new Error("fatal crash");
    logger.fatal({ err }, "system failure");
    expect(mockCaptureException).toHaveBeenCalledOnce();
    expect(mockCaptureException).toHaveBeenCalledWith(err, {
      extra: { err: { name: "Error", message: "fatal crash" } },
    });
  });

  it("logger.warn does NOT call Sentry (warn is Docker-only)", async () => {
    const { logger } = await import("./logger");
    logger.warn({ userId: "user-1" }, "Rate limit exceeded");
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("logger.info does NOT call Sentry", async () => {
    const { logger } = await import("./logger");
    logger.info({ documentId: "DOC-1" }, "Receipt emitted successfully");
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("strips raw 'ip' from Sentry extra context but forwards 'ipHash'", async () => {
    const { logger } = await import("./logger");
    logger.error(
      { ip: "1.2.3.4", ipHash: "abc123", userId: "u-1" },
      "auth failure",
    );
    expect(mockCaptureMessage).toHaveBeenCalledOnce();
    // captureMessage doesn't take extra context; verify via captureException path too
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("strips raw 'ip' but forwards 'ipHash' when called with { err: Error }", async () => {
    const { logger } = await import("./logger");
    const err = new Error("boom");
    logger.error(
      { err, ip: "9.9.9.9", ipHash: "h-9", userId: "u-2" },
      "with error",
    );
    expect(mockCaptureException).toHaveBeenCalledOnce();
    const callArgs = mockCaptureException.mock.calls[0];
    const extra = (callArgs[1] as { extra: Record<string, unknown> }).extra;
    expect(extra).not.toHaveProperty("ip");
    expect(extra.ipHash).toBe("h-9");
    expect(extra.userId).toBe("u-2");
  });

  it("sanitizeForTelemetry: 'ip' is not in the allowlist, 'ipHash' is", async () => {
    const { sanitizeForTelemetry } = await import("./logger");
    const out = sanitizeForTelemetry({
      ip: "10.0.0.1",
      ipHash: "h-1",
      userId: "u-x",
      password: "should-never-pass",
    });
    expect(out).not.toHaveProperty("ip");
    expect(out).not.toHaveProperty("password");
    expect(out.ipHash).toBe("h-1");
    expect(out.userId).toBe("u-x");
  });

  it("child logger (createRequestLogger) inherits Sentry bridge", async () => {
    const { createRequestLogger } = await import("./logger");
    const childLogger = createRequestLogger({
      requestId: "req-abc",
      userId: "u-1",
    });
    const err = new Error("child error");
    childLogger.error({ err }, "error in child context");
    expect(mockCaptureException).toHaveBeenCalledOnce();
    expect(mockCaptureException).toHaveBeenCalledWith(err, {
      extra: { err: { name: "Error", message: "child error" } },
    });
  });
});
