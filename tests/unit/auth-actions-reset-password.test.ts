// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks ---

const {
  mockGenerateLink,
  mockRateLimiterCheck,
  mockSendEmail,
  mockRedirect,
  mockLoggerError,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockGenerateLink: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
  mockSendEmail: vi.fn(),
  mockRedirect: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("next/headers", () => ({
  headers: vi
    .fn()
    .mockResolvedValue(new Headers({ "cf-connecting-ip": "1.2.3.4" })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    auth: {
      admin: {
        generateLink: mockGenerateLink,
      },
    },
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: mockSendEmail,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
    info: vi.fn(),
  },
}));

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

// --- Helpers ---

function makeFormData(email: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  // P2-02: resetPassword now requires Turnstile token
  fd.set("captchaToken", "valid-token");
  return fd;
}

// Mock global fetch for Turnstile siteverify (used by verifyCaptcha)
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockSuccessfulGenerateLink(actionLink: string): void {
  mockGenerateLink.mockResolvedValue({
    data: { properties: { action_link: actionLink } },
    error: null,
  });
}

// In tests we make redirect throw to stop execution (mirrors Next.js behaviour).
// This lets us assert what happened before vs after the redirect call.
function setupRedirectThrows(): void {
  mockRedirect.mockImplementation((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  });
}

const VALID_EMAIL = "user@example.com";
const EXPECTED_HOSTNAME = "app.scontrinozero.it";
const VALID_ACTION_LINK = `https://${EXPECTED_HOSTNAME}/auth/v1/verify?token=abc123`;

describe("resetPassword — hostname validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_HOSTNAME = EXPECTED_HOSTNAME;
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    mockRateLimiterCheck.mockReturnValue({ success: true });
    mockSendEmail.mockResolvedValue(undefined);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, hostname: EXPECTED_HOSTNAME }),
    });
    setupRedirectThrows();
  });

  it("accepts a valid action link with the expected hostname and sends email", async () => {
    mockSuccessfulGenerateLink(VALID_ACTION_LINK);

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("blocks subdomain-spoofing URL (e.g., app.scontrinozero.it.evil.tld)", async () => {
    mockSuccessfulGenerateLink(
      `https://${EXPECTED_HOSTNAME}.evil.tld/auth/v1/verify?token=abc`,
    );

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: `${EXPECTED_HOSTNAME}.evil.tld`,
        expectedHostname: EXPECTED_HOSTNAME,
        hasToken: true,
      }),
      expect.stringContaining("hostname mismatch"),
    );
    // actionLink (with token) must never appear in log context
    expect(mockLoggerError).not.toHaveBeenCalledWith(
      expect.objectContaining({ actionLink: expect.any(String) }),
      expect.any(String),
    );
  });

  it("blocks URL where expected hostname appears only in query string", async () => {
    mockSuccessfulGenerateLink(
      `https://evil.com/?next=https://${EXPECTED_HOSTNAME}/reset`,
    );

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ expectedHostname: EXPECTED_HOSTNAME }),
      expect.stringContaining("hostname mismatch"),
    );
  });

  it("blocks a URL served over plain HTTP (not HTTPS)", async () => {
    mockSuccessfulGenerateLink(
      `http://${EXPECTED_HOSTNAME}/auth/v1/verify?token=abc`,
    );

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ expectedHostname: EXPECTED_HOSTNAME }),
      expect.stringContaining("hostname mismatch"),
    );
  });

  it("blocks a completely unrelated hostname", async () => {
    mockSuccessfulGenerateLink("https://totally-different.com/reset?token=abc");

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("blocks a malformed (non-URL) action link", async () => {
    mockSuccessfulGenerateLink("not-a-valid-url-at-all");

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ expectedHostname: EXPECTED_HOSTNAME }),
      expect.stringContaining("invalid URL"),
    );
  });

  it("redirects to /verify-email when generateLink fails (no email sent)", async () => {
    mockGenerateLink.mockResolvedValue({
      data: { properties: {} },
      error: { message: "DB error" },
    });

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
