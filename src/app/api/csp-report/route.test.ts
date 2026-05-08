// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRateLimiterCheck, mockLoggerWarn } = vi.hoisted(() => ({
  mockRateLimiterCheck: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: mockLoggerWarn },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimiterCheck.mockReturnValue({
    success: true,
    remaining: 59,
    resetAt: Date.now() + 60_000,
  });
});

function makeRequest(body: string, contentType: string): Request {
  return new Request("https://scontrinozero.it/api/csp-report", {
    method: "POST",
    headers: {
      "content-type": contentType,
      "cf-connecting-ip": "203.0.113.10",
    },
    body,
  });
}

describe("POST /api/csp-report", () => {
  it("ritorna 204 e logga la violation legacy (application/csp-report)", async () => {
    const { POST } = await import("./route");
    const body = JSON.stringify({
      "csp-report": {
        "blocked-uri": "https://evil.example/script.js",
        "document-uri": "https://scontrinozero.it/",
        "violated-directive": "script-src",
        "effective-directive": "script-src-elem",
        "original-policy": "default-src 'self'",
        disposition: "report",
      },
    });
    const res = await POST(makeRequest(body, "application/csp-report"));
    expect(res.status).toBe(204);
    expect(mockLoggerWarn).toHaveBeenCalledOnce();
    const [ctx, msg] = mockLoggerWarn.mock.calls[0];
    expect(msg).toMatch(/csp/i);
    expect(ctx).toMatchObject({
      cspViolation: expect.objectContaining({
        blockedUri: "https://evil.example/script.js",
        violatedDirective: "script-src",
      }),
    });
  });

  it("ritorna 204 e logga la violation Reporting API (application/reports+json)", async () => {
    const { POST } = await import("./route");
    const body = JSON.stringify([
      {
        type: "csp-violation",
        age: 0,
        url: "https://scontrinozero.it/",
        body: {
          blockedURL: "https://evil.example/script.js",
          documentURL: "https://scontrinozero.it/",
          violatedDirective: "script-src",
          effectiveDirective: "script-src-elem",
          originalPolicy: "default-src 'self'",
          disposition: "report",
          statusCode: 200,
        },
      },
    ]);
    const res = await POST(makeRequest(body, "application/reports+json"));
    expect(res.status).toBe(204);
    expect(mockLoggerWarn).toHaveBeenCalledOnce();
    const [ctx] = mockLoggerWarn.mock.calls[0];
    expect(ctx.cspViolation).toMatchObject({
      blockedUri: "https://evil.example/script.js",
      violatedDirective: "script-src",
    });
  });

  it("supporta più report nel body Reporting API (loggandoli tutti)", async () => {
    const { POST } = await import("./route");
    const body = JSON.stringify([
      {
        type: "csp-violation",
        body: {
          blockedURL: "https://a.example/",
          violatedDirective: "img-src",
        },
      },
      {
        type: "csp-violation",
        body: {
          blockedURL: "https://b.example/",
          violatedDirective: "script-src",
        },
      },
    ]);
    const res = await POST(makeRequest(body, "application/reports+json"));
    expect(res.status).toBe(204);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(2);
  });

  it("ignora report non csp-violation nel batch Reporting API", async () => {
    const { POST } = await import("./route");
    const body = JSON.stringify([
      {
        type: "deprecation",
        body: { id: "deprecated-feature" },
      },
      {
        type: "csp-violation",
        body: {
          blockedURL: "https://a.example/",
          violatedDirective: "img-src",
        },
      },
    ]);
    const res = await POST(makeRequest(body, "application/reports+json"));
    expect(res.status).toBe(204);
    expect(mockLoggerWarn).toHaveBeenCalledOnce();
  });

  it("ritorna 415 su content-type sconosciuto", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("{}", "application/json"));
    expect(res.status).toBe(415);
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("ritorna 400 su JSON malformato", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("not-json{{", "application/csp-report"));
    expect(res.status).toBe(400);
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("ritorna 413 su body > 8KB", async () => {
    const { POST } = await import("./route");
    const big = JSON.stringify({ "csp-report": { x: "a".repeat(10_000) } });
    const res = await POST(makeRequest(big, "application/csp-report"));
    expect(res.status).toBe(413);
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("ritorna 429 quando il rate limit è superato", async () => {
    mockRateLimiterCheck.mockReturnValue({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });
    const { POST } = await import("./route");
    const body = JSON.stringify({ "csp-report": { "blocked-uri": "x" } });
    const res = await POST(makeRequest(body, "application/csp-report"));
    expect(res.status).toBe(429);
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("non logga se la violation, dopo sanitizzazione, è vuota", async () => {
    const { POST } = await import("./route");
    // Tutti campi non-allowlist
    const body = JSON.stringify({
      "csp-report": { "source-file": "/x", "script-sample": "y" },
    });
    const res = await POST(makeRequest(body, "application/csp-report"));
    expect(res.status).toBe(204);
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("usa il rate-limit chiave per IP (CF-Connecting-IP)", async () => {
    const { POST } = await import("./route");
    const body = JSON.stringify({ "csp-report": { "blocked-uri": "x" } });
    await POST(makeRequest(body, "application/csp-report"));
    expect(mockRateLimiterCheck).toHaveBeenCalledWith(
      expect.stringContaining("203.0.113.10"),
    );
  });
});
