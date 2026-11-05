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
  mockVerifyOtp,
} = vi.hoisted(() => ({
  mockGenerateLink: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
  mockSendEmail: vi.fn(),
  mockRedirect: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockVerifyOtp: vi.fn(),
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
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { verifyOtp: mockVerifyOtp },
  })),
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

  it("emails a link to the confirm page carrying only the token_hash", async () => {
    // Issue #1159: il link non punta più a /callback, che consumava il token
    // alla prima GET (anche quella di uno scanner aziendale). La pagina di
    // conferma non chiama Supabase: il token lo consuma il clic dell'utente.
    mockSuccessfulGenerateLink();

    const { resetPassword } = await import("@/server/auth-actions");
    await expect(resetPassword(makeFormData(VALID_EMAIL))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockSendEmail).toHaveBeenCalledOnce();
    const link = sentResetLink();
    expect(link.protocol).toBe("https:");
    expect(link.host).toBe(APP_HOSTNAME);
    expect(link.pathname).toBe("/reset-password/confirm");
    expect([...link.searchParams.keys()]).toEqual(["token_hash"]);
    expect(link.searchParams.get("token_hash")).toBe(HASHED_TOKEN);
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

describe("confirmPasswordReset — il clic che consuma il token", () => {
  // Issue #1159: la GET della pagina di conferma non tocca Supabase; è questo
  // POST, partito dal pulsante, a chiamare verifyOtp. Uno scanner che apre il
  // link non brucia più il token.
  function confirmFormData(tokenHash: string | null): FormData {
    const fd = new FormData();
    if (tokenHash !== null) fd.set("tokenHash", tokenHash);
    return fd;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimiterCheck.mockReturnValue({ success: true });
    setupRedirectThrows();
  });

  it("verifies the token_hash and lands on /reset-password/update", async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });

    const { confirmPasswordReset } = await import("@/server/auth-actions");
    await expect(
      confirmPasswordReset(confirmFormData(HASHED_TOKEN)),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: HASHED_TOKEN,
    });
    expect(mockRedirect).toHaveBeenCalledWith("/reset-password/update");
  });

  it("sends an expired or already-used token to /login with reset_link_invalid", async () => {
    mockVerifyOtp.mockResolvedValue({
      error: { status: 403, message: "Email link is invalid or has expired" },
    });

    const { confirmPasswordReset } = await import("@/server/auth-actions");
    await expect(
      confirmPasswordReset(confirmFormData(HASHED_TOKEN)),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith(
      "/login?error=reset_link_invalid",
    );
    // Input utente prevedibile (regola 20): warn, mai un'issue Sentry.
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      { errorClass: "other" },
      "Password reset confirm: verifyOtp failed",
    );
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it.each([
    { name: "missing", tokenHash: null },
    { name: "empty", tokenHash: "" },
    { name: "whitespace only", tokenHash: "   " },
  ])(
    "does not call Supabase when the token_hash is $name",
    async ({ tokenHash }) => {
      const { confirmPasswordReset } = await import("@/server/auth-actions");
      await expect(
        confirmPasswordReset(confirmFormData(tokenHash)),
      ).rejects.toThrow("NEXT_REDIRECT");

      expect(mockVerifyOtp).not.toHaveBeenCalled();
      expect(mockRateLimiterCheck).not.toHaveBeenCalled();
      expect(mockRedirect).toHaveBeenCalledWith(
        "/login?error=reset_link_invalid",
      );
    },
  );

  it.each([
    { status: 500, errorClass: "auth_provider_5xx" },
    { status: 429, errorClass: "auth_provider_throttled" },
  ])(
    "keeps the user on the page to retry when Supabase answers $status",
    async ({ status, errorClass }) => {
      // Un 5xx o un 429 di GoTrue non dice nulla sul token, che con ogni
      // probabilità è ancora buono: mandare l'utente a "link scaduto" gli
      // farebbe richiedere un'email che non serve.
      mockVerifyOtp.mockResolvedValue({
        error: { status, message: "upstream" },
      });

      const { confirmPasswordReset } = await import("@/server/auth-actions");
      const result = await confirmPasswordReset(confirmFormData(HASHED_TOKEN));

      expect(result).toEqual({
        error: "Non siamo riusciti a verificare il link. Riprova tra poco.",
      });
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        { errorClass },
        "Password reset confirm: verifyOtp failed",
      );
    },
  );

  it("returns the rate-limit error without calling Supabase", async () => {
    mockRateLimiterCheck.mockReturnValue({ success: false });

    const { confirmPasswordReset } = await import("@/server/auth-actions");
    const result = await confirmPasswordReset(confirmFormData(HASHED_TOKEN));

    expect(result.error).toEqual(expect.any(String));
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("never logs the token_hash", async () => {
    mockVerifyOtp.mockResolvedValue({
      error: { status: 403, message: "expired" },
    });

    const { confirmPasswordReset } = await import("@/server/auth-actions");
    await expect(
      confirmPasswordReset(confirmFormData(HASHED_TOKEN)),
    ).rejects.toThrow("NEXT_REDIRECT");

    const logged = JSON.stringify([
      mockLoggerWarn.mock.calls,
      mockLoggerError.mock.calls,
    ]);
    expect(logged).not.toContain(HASHED_TOKEN);
  });
});
