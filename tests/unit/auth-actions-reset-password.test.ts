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

function mockSuccessfulGenerateLink(hashedToken = HASHED_TOKEN): void {
  mockGenerateLink.mockResolvedValue({
    data: {
      properties: {
        hashed_token: hashedToken,
        // GoTrue restituisce anche l'action_link su /auth/v1/verify: non lo
        // spediamo più (sessione nel fragment, invisibile a /callback).
        action_link: `https://test.supabase.co/auth/v1/verify?token=${hashedToken}&type=recovery`,
      },
    },
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

function sentResetLink(): URL {
  const [[args]] = mockSendEmail.mock.calls;
  return new URL(args.react.props.resetLink);
}

const VALID_EMAIL = "user@example.com";
const APP_HOSTNAME = "app.scontrinozero.it";
const HASHED_TOKEN = "f3a9c1hash";

describe("resetPassword — reset link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_HOSTNAME = APP_HOSTNAME;
    delete process.env.APP_HOSTNAME;
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

  it("generates a recovery link for the normalized email", async () => {
    mockSuccessfulGenerateLink();

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(
      resetPassword(makeFormData("  User@Example.com ")),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: "recovery",
      email: VALID_EMAIL,
    });
  });

  it("emails a link to /callback with token_hash, type=recovery and the update landing", async () => {
    // Regressione 05/11/2026: l'email portava l'action_link di GoTrue, che
    // per un link admin (no PKCE) torna con la sessione nel fragment. Il
    // /callback non vedeva nessun `code` e mostrava sempre "link scaduto".
    mockSuccessfulGenerateLink();

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).toHaveBeenCalledOnce();
    const link = sentResetLink();
    expect(link.protocol).toBe("https:");
    expect(link.host).toBe(APP_HOSTNAME);
    expect(link.pathname).toBe("/callback");
    expect(link.searchParams.get("token_hash")).toBe(HASHED_TOKEN);
    expect(link.searchParams.get("type")).toBe("recovery");
    expect(link.searchParams.get("redirect")).toBe("/reset-password/update");
    expect(mockRedirect).toHaveBeenCalledWith("/verify-email");
  });

  it("uses the runtime APP_HOSTNAME override for the link host", async () => {
    process.env.APP_HOSTNAME = "sandbox.scontrinozero.it";
    // verifyCaptcha confronta l'hostname Turnstile con l'host dell'app.
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        hostname: "sandbox.scontrinozero.it",
        action: "reset-password",
      }),
    });
    mockSuccessfulGenerateLink();

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(sentResetLink().host).toBe("sandbox.scontrinozero.it");
  });

  it("URL-encodes a token_hash with reserved characters", async () => {
    mockSuccessfulGenerateLink("a+b/c=&d");

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(sentResetLink().searchParams.get("token_hash")).toBe("a+b/c=&d");
  });

  it("redirects to /verify-email without email when generateLink fails", async () => {
    mockGenerateLink.mockResolvedValue({
      data: { properties: null, user: null },
      error: { message: "User not found" },
    });

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith("/verify-email");
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.any(Object),
      "Reset password generateLink failed",
    );
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("does not email a link when generateLink returns no hashed_token", async () => {
    mockGenerateLink.mockResolvedValue({
      data: { properties: { hashed_token: "" } },
      error: null,
    });

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith("/verify-email");
  });

  it("returns a neutral error and does not redirect when sendEmail fails", async () => {
    mockSuccessfulGenerateLink();
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
});
