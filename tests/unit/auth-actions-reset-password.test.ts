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
  // resetPassword requires Turnstile token
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
const APP_HOSTNAME = "app.scontrinozero.it";
const SUPABASE_HOSTNAME = "test.supabase.co";
// generateLink returns a link on the SUPABASE host (/auth/v1/verify), carrying
// the app host in the redirect_to param — the real GoTrue shape.
const VALID_ACTION_LINK = `https://${SUPABASE_HOSTNAME}/auth/v1/verify?token=abc123&type=recovery&redirect_to=https://${APP_HOSTNAME}/callback`;

describe("resetPassword — hostname validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_HOSTNAME = APP_HOSTNAME;
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${SUPABASE_HOSTNAME}`;
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    mockRateLimiterCheck.mockReturnValue({ success: true });
    mockSendEmail.mockResolvedValue(undefined);
    // verifyCaptcha validates `action` — echo "reset-password".
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        hostname: APP_HOSTNAME,
        action: "reset-password",
      }),
    });
    setupRedirectThrows();
  });

  it("accepts a link on the Supabase host with app-host redirect_to and sends email", async () => {
    mockSuccessfulGenerateLink(VALID_ACTION_LINK);

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("pins the recovery landing on /callback?redirect=/reset-password/update", async () => {
    // Senza il param `redirect`, dopo il click l'utente atterrava sulla
    // dashboard e non impostava mai la nuova password. Il /callback accetta
    // solo redirect relativi (no open redirect).
    mockSuccessfulGenerateLink(VALID_ACTION_LINK);

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockGenerateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "recovery",
        options: expect.objectContaining({
          redirectTo: `https://${APP_HOSTNAME}/callback?redirect=${encodeURIComponent(
            "/reset-password/update",
          )}`,
        }),
      }),
    );
  });

  it("blocks subdomain-spoofing of the Supabase host (e.g., test.supabase.co.evil.tld)", async () => {
    mockSuccessfulGenerateLink(
      `https://${SUPABASE_HOSTNAME}.evil.tld/auth/v1/verify?token=abc&redirect_to=https://${APP_HOSTNAME}/callback`,
    );

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        actionLinkHostname: `${SUPABASE_HOSTNAME}.evil.tld`,
        supabaseHostname: SUPABASE_HOSTNAME,
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

  it("blocks subdomain-spoofing of the app host in redirect_to", async () => {
    mockSuccessfulGenerateLink(
      `https://${SUPABASE_HOSTNAME}/auth/v1/verify?token=abc&redirect_to=https://${APP_HOSTNAME}.evil.tld/callback`,
    );

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectToHostname: `${APP_HOSTNAME}.evil.tld`,
        appHostname: APP_HOSTNAME,
      }),
      expect.stringContaining("hostname mismatch"),
    );
  });

  it("blocks a link where the app host appears only in the action_link query string", async () => {
    mockSuccessfulGenerateLink(
      `https://evil.com/?next=https://${APP_HOSTNAME}/reset`,
    );

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ supabaseHostname: SUPABASE_HOSTNAME }),
      expect.stringContaining("hostname mismatch"),
    );
  });

  it("blocks a link served over plain HTTP (not HTTPS)", async () => {
    mockSuccessfulGenerateLink(
      `http://${SUPABASE_HOSTNAME}/auth/v1/verify?token=abc&redirect_to=https://${APP_HOSTNAME}/callback`,
    );

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ supabaseHostname: SUPABASE_HOSTNAME }),
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

  it("blocks a link missing the redirect_to param", async () => {
    mockSuccessfulGenerateLink(
      `https://${SUPABASE_HOSTNAME}/auth/v1/verify?token=abc`,
    );

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ redirectToHostname: null }),
      expect.stringContaining("hostname mismatch"),
    );
  });

  it("blocks when NEXT_PUBLIC_SUPABASE_URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    mockSuccessfulGenerateLink(VALID_ACTION_LINK);

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ supabaseHostname: null }),
      expect.stringContaining("hostname mismatch"),
    );
  });

  it("blocks a malformed (non-URL) action link", async () => {
    mockSuccessfulGenerateLink("not-a-valid-url-at-all");

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ actionLinkHostname: null }),
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

  it("returns a neutral error and does not redirect when sendEmail fails", async () => {
    mockSuccessfulGenerateLink(VALID_ACTION_LINK);
    mockSendEmail.mockRejectedValue(new Error("Resend timeout"));

    const { resetPassword } = await import("@/server/auth-actions");
    const result = await resetPassword(makeFormData(VALID_EMAIL));

    expect(result).toEqual({
      error:
        "Non siamo riusciti a inviare l'email. Riprova tra qualche minuto.",
    });
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Password reset email failed",
    );
  });

  it("redirects to /verify-email when sendEmail succeeds", async () => {
    mockSuccessfulGenerateLink(VALID_ACTION_LINK);
    mockSendEmail.mockResolvedValue(undefined);

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).toHaveBeenCalledOnce();
  });
});
