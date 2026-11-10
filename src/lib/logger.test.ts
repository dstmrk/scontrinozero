/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";

const mockCaptureException = vi.fn();
const mockCaptureMessage = vi.fn();
const mockSetFingerprint = vi.fn();
const mockSetTag = vi.fn();
const mockWithScope = vi.fn(
  (
    cb: (scope: {
      setFingerprint: typeof mockSetFingerprint;
      setTag: typeof mockSetTag;
    }) => void,
  ) => {
    cb({ setFingerprint: mockSetFingerprint, setTag: mockSetTag });
  },
);

vi.mock("@sentry/nextjs", () => ({
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
  withScope: mockWithScope,
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
    mockSetFingerprint.mockReset();
    mockWithScope.mockClear();
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

  it("R23: logger.error with sentryFingerprint wraps captureException in withScope+setFingerprint", async () => {
    // SCONTRINOZERO-9/-A condividevano trace_id ma generavano 2 issue Sentry
    // distinte perche' i message ("wizardTemplate failed 500" vs
    // "setUserChoice failed 500") rompevano il grouping di default. Un
    // fingerprint esplicito sul flow li riunisce in un singolo group.
    const { logger } = await import("./logger");
    const err = new Error("AdE wizardTemplate failed");
    logger.error(
      {
        err,
        businessId: "biz-1",
        sentryFingerprint: ["onboarding-verify", "ade_failure"],
      },
      "AdE credential verification failed",
    );
    expect(mockWithScope).toHaveBeenCalledOnce();
    expect(mockSetFingerprint).toHaveBeenCalledWith([
      "onboarding-verify",
      "ade_failure",
    ]);
    expect(mockCaptureException).toHaveBeenCalledWith(err, {
      extra: expect.objectContaining({
        err: { name: "Error", message: "AdE wizardTemplate failed" },
        businessId: "biz-1",
      }),
    });
    // sentryFingerprint is routing metadata, NOT payload — keep it out of extra
    // so Sentry doesn't echo the fingerprint string back into the issue context.
    const extra = mockCaptureException.mock.calls[0]?.[1]?.extra as
      Record<string, unknown> | undefined;
    expect(extra).not.toHaveProperty("sentryFingerprint");
  });

  it("R23: logger.error without sentryFingerprint does NOT call withScope (back-compat)", async () => {
    const { logger } = await import("./logger");
    logger.error(
      { err: new Error("boom"), businessId: "biz-2" },
      "generic failure",
    );
    expect(mockWithScope).not.toHaveBeenCalled();
    expect(mockSetFingerprint).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledOnce();
  });

  it("R23: logger.error with empty sentryFingerprint array does NOT call withScope", async () => {
    const { logger } = await import("./logger");
    logger.error(
      { err: new Error("boom"), sentryFingerprint: [] },
      "still groups by default",
    );
    expect(mockWithScope).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledOnce();
  });

  it("R23: logger.error with non-array sentryFingerprint is ignored", async () => {
    const { logger } = await import("./logger");
    logger.error(
      {
        err: new Error("boom"),
        sentryFingerprint: "not-an-array" as unknown as string[],
      },
      "still groups by default",
    );
    expect(mockWithScope).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledOnce();
  });

  it("R23: sentryFingerprint also wraps captureMessage path (plain err-less log)", async () => {
    const { logger } = await import("./logger");
    logger.error(
      {
        sentryFingerprint: ["onboarding-verify", "missing_credentials"],
        businessId: "biz-3",
      },
      "Credenziali AdE non trovate",
    );
    expect(mockWithScope).toHaveBeenCalledOnce();
    expect(mockSetFingerprint).toHaveBeenCalledWith([
      "onboarding-verify",
      "missing_credentials",
    ]);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      "Credenziali AdE non trovate",
      "error",
    );
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
});

// The Sentry pino integration (Sentry.pinoIntegration) forwards the *serialised*
// log object to Sentry Logs — i.e. the output produced AFTER pino's redaction
// runs (it taps the `pino_asJson` diagnostics channel). Unlike the exception
// bridge (sanitizeForTelemetry, an allowlist), the Logs path is a DENYLIST:
// every field that is NOT redacted is forwarded. Raw `ip` is GDPR personal data
// and is logged at warn level (profile-actions changePassword rate limit,
// csp-report), so it MUST be in REDACT_PATHS or it would leak to Sentry Logs.
describe("logger REDACT_PATHS — Sentry Logs (pino integration) safety", () => {
  it("REDACT_PATHS includes 'ip' and '*.ip' so raw IPs never reach Sentry Logs", async () => {
    const { REDACT_PATHS } = await import("./logger");
    expect(REDACT_PATHS).toContain("ip");
    expect(REDACT_PATHS).toContain("*.ip");
  });

  it("a logger built with the real REDACT_PATHS censors top-level and nested 'ip'", async () => {
    const { REDACT_PATHS } = await import("./logger");
    const { logger, getOutput } = createTestLogger({
      redact: { paths: [...REDACT_PATHS], censor: "[REDACTED]" },
    });

    logger.warn(
      { userId: "u1", ip: "1.2.3.4", session: { ip: "5.6.7.8" } },
      "changePassword rate limit exceeded",
    );

    const output = getOutput();
    const parsed = JSON.parse(output);
    expect(parsed.ip).toBe("[REDACTED]");
    expect(parsed.session.ip).toBe("[REDACTED]");
    expect(parsed.userId).toBe("u1");
    expect(output).not.toContain("1.2.3.4");
    expect(output).not.toContain("5.6.7.8");
  });

  it("the root logger carries the app release in its base bindings", async () => {
    const { logger } = await import("./logger");
    const { getAppRelease } = await import("./version");
    expect(logger.bindings().release).toBe(getAppRelease());
  });

  it("redacting 'ip' does NOT affect the safe 'ipHash' correlation field", async () => {
    const { REDACT_PATHS } = await import("./logger");
    const { logger, getOutput } = createTestLogger({
      redact: { paths: [...REDACT_PATHS], censor: "[REDACTED]" },
    });

    logger.warn({ ipHash: "abc123", ip: "1.2.3.4" }, "rate limit");

    const parsed = JSON.parse(getOutput());
    expect(parsed.ipHash).toBe("abc123");
    expect(parsed.ip).toBe("[REDACTED]");
  });

  // Issue #1159: il token_hash del reset password è una credenziale
  // monouso. Il codice non lo logga, ma se un giorno finisse in un
  // oggetto di log deve uscire censurato, come `token`.
  it("censors 'tokenHash' top-level and nested", async () => {
    const { REDACT_PATHS } = await import("./logger");
    const { logger, getOutput } = createTestLogger({
      redact: { paths: [...REDACT_PATHS], censor: "[REDACTED]" },
    });

    logger.warn(
      { tokenHash: "RESET-SECRET", form: { tokenHash: "NESTED-SECRET" } },
      "reset",
    );

    const output = getOutput();
    expect(output).not.toContain("RESET-SECRET");
    expect(output).not.toContain("NESTED-SECRET");
  });
});

/**
 * Il `requestId` della Developer API su ogni riga di log della richiesta e su
 * ogni evento Sentry: è il filo fra la segnalazione di un integratore e i
 * nostri log. Il 10/11/2026 due requestId girati da un esercente non
 * comparivano da nessuna parte.
 */
describe("logger e contesto della richiesta", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCaptureException.mockReset();
    mockSetFingerprint.mockReset();
    mockSetTag.mockReset();
    mockWithScope.mockClear();
  });

  it("il mixin aggiunge il requestId dentro una richiesta e niente fuori", async () => {
    const { requestContextMixin } = await import("./logger");
    const { runWithRequestContext } = await import("./request-context");
    const { logger, getOutput } = createTestLogger({
      mixin: requestContextMixin,
    });

    logger.info({ documentId: "doc-1" }, "fuori");
    runWithRequestContext("req-1", () => {
      logger.info({ documentId: "doc-1" }, "dentro");
    });

    const [outside, inside] = getOutput()
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(outside).not.toHaveProperty("requestId");
    expect(inside).toMatchObject({ requestId: "req-1", documentId: "doc-1" });
  });

  it("il mixin non duplica chiave e attività, che le righe portano già dove servono", async () => {
    const { requestContextMixin } = await import("./logger");
    const { annotateRequestContext, runWithRequestContext } =
      await import("./request-context");
    runWithRequestContext("req-1", () => {
      annotateRequestContext({ apiKeyId: "key-1", businessId: "biz-1" });
      expect(requestContextMixin()).toEqual({ requestId: "req-1" });
    });
  });

  it("il logger dell'app usa il mixin", async () => {
    const { logger, requestContextMixin } = await import("./logger");
    const mixin = (logger as unknown as Record<symbol, unknown>)[
      pino.symbols.mixinSym
    ];
    expect(mixin).toBeTypeOf("function");
    expect(mixin).toBe(requestContextMixin);
  });

  it("un errore dentro una richiesta porta il requestId come tag Sentry", async () => {
    const { logger } = await import("./logger");
    const { runWithRequestContext } = await import("./request-context");
    const err = new Error("boom");
    runWithRequestContext("req-1", () => {
      logger.error({ err }, "failed");
    });
    expect(mockWithScope).toHaveBeenCalledOnce();
    expect(mockSetTag).toHaveBeenCalledWith("requestId", "req-1");
    expect(mockSetFingerprint).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledOnce();
  });

  it("requestId e fingerprint convivono nello stesso scope", async () => {
    const { logger } = await import("./logger");
    const { runWithRequestContext } = await import("./request-context");
    runWithRequestContext("req-1", () => {
      logger.error(
        {
          err: new Error("boom"),
          sentryFingerprint: ["emit-receipt", "ade_failure"],
        },
        "emitReceiptForBusiness failed",
      );
    });
    expect(mockWithScope).toHaveBeenCalledOnce();
    expect(mockSetTag).toHaveBeenCalledWith("requestId", "req-1");
    expect(mockSetFingerprint).toHaveBeenCalledWith([
      "emit-receipt",
      "ade_failure",
    ]);
  });
});
