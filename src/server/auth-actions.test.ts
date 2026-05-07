// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks ---

const mockRateLimiterCheck = vi
  .fn()
  .mockReturnValue({ success: true, remaining: 4 });
vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
}));

const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
    },
  }),
}));

const mockGenerateLink = vi.fn();
const mockDeleteUser = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn().mockReturnValue({
    auth: {
      admin: { generateLink: mockGenerateLink, deleteUser: mockDeleteUser },
    },
  }),
}));

const mockValues = vi.fn().mockResolvedValue(undefined);
const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
const mockLimit = vi.fn().mockResolvedValue([]);
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({ insert: mockInsert, select: mockSelect }),
}));

vi.mock("@/db/schema", () => ({
  profiles: "profiles-table",
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue("127.0.0.1"),
  }),
}));

// Mock redirect to throw like Next.js does
const REDIRECT_ERROR = "NEXT_REDIRECT";
vi.mock("next/navigation", () => ({
  redirect: vi.fn().mockImplementation((url: string) => {
    const err = new Error(REDIRECT_ERROR) as Error & {
      digest: string;
      url: string;
    };
    err.digest = REDIRECT_ERROR;
    err.url = url;
    throw err;
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

const mockSendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({
  sendEmail: mockSendEmail,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("@/emails/password-reset", () => ({
  PasswordResetEmail: vi.fn().mockReturnValue(null),
}));

// --- Helpers ---

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

function isRedirectError(
  err: unknown,
): err is Error & { digest: string; url: string } {
  return (
    err instanceof Error &&
    (err as Error & { digest?: string }).digest === REDIRECT_ERROR
  );
}

// --- Tests ---

describe("auth-actions", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    process.env.NEXT_PUBLIC_APP_HOSTNAME = "app.scontrinozero.it";
    mockRateLimiterCheck.mockReturnValue({ success: true, remaining: 4 });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, hostname: "app.scontrinozero.it" }),
    });
    mockGenerateLink.mockResolvedValue({
      data: {
        properties: {
          action_link: "https://app.scontrinozero.it/auth/recovery?token=abc",
        },
      },
      error: null,
    });
  });

  describe("signUp", () => {
    it("returns error for invalid email", async () => {
      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({ email: "bad", password: "12345678" }),
      );
      expect(result).toEqual({ error: "Email non valida." });
    });

    it("returns error for weak password (no uppercase/special/digit)", async () => {
      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "weakpassword",
          confirmPassword: "weakpassword",
        }),
      );
      expect(result.error).toBeDefined();
    });

    it("returns error when passwords do not match", async () => {
      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Different#1",
        }),
      );
      expect(result).toEqual({ error: "Le password non coincidono." });
    });

    it("returns error when terms are not accepted", async () => {
      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          // termsAccepted omitted
        }),
      );
      expect(result).toEqual({
        error: "Devi accettare i Termini di servizio e la Privacy Policy.",
      });
    });

    it("returns error when specific clauses are not accepted", async () => {
      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          // specificClausesAccepted omitted
        }),
      );
      expect(result).toEqual({
        error: "Devi accettare specificamente le clausole indicate.",
      });
    });

    it("creates user and profile then redirects on success", async () => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      });

      const { signUp } = await import("./auth-actions");

      try {
        await signUp(
          formData({
            email: "test@example.com",
            password: "Secure#99x",
            confirmPassword: "Secure#99x",
            termsAccepted: "true",
            specificClausesAccepted: "true",
            captchaToken: "valid-token",
          }),
        );
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
        if (isRedirectError(err)) {
          expect(err.url).toBe("/verify-email");
        }
      }

      expect(mockSignUp).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "Secure#99x",
        options: {
          emailRedirectTo: "https://app.scontrinozero.it/dashboard",
        },
      });
      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          termsAcceptedAt: expect.any(Date),
          termsVersion: "v01",
        }),
      );
    });

    it("uses APP_HOSTNAME as emailRedirectTo when set (sandbox override)", async () => {
      vi.stubEnv("APP_HOSTNAME", "sandbox.scontrinozero.it");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          hostname: "sandbox.scontrinozero.it",
        }),
      });
      mockSignUp.mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      });

      const { signUp } = await import("./auth-actions");

      try {
        await signUp(
          formData({
            email: "test@example.com",
            password: "Secure#99x",
            confirmPassword: "Secure#99x",
            termsAccepted: "true",
            specificClausesAccepted: "true",
            captchaToken: "valid-token",
          }),
        );
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
      }

      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            emailRedirectTo: "https://sandbox.scontrinozero.it/dashboard",
          },
        }),
      );
    });

    it("returns error when Supabase signUp fails", async () => {
      mockSignUp.mockResolvedValue({
        data: { user: null },
        error: { message: "User already exists" },
      });

      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "valid-token",
        }),
      );
      expect(result).toEqual({ error: "Registrazione fallita. Riprova." });
    });

    it("returns rate limit error when too many requests", async () => {
      mockRateLimiterCheck.mockReturnValue({ success: false, remaining: 0 });

      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "valid-token",
        }),
      );
      expect(result.error).toContain("Troppi tentativi");
    });

    it("redirects to verify-email when signUp returns null user without error (duplicate unconfirmed email)", async () => {
      // Supabase returns { user: null, error: null } when re-registering an unconfirmed email
      // to prevent user enumeration. We should still redirect to verify-email.
      mockSignUp.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const { signUp } = await import("./auth-actions");

      try {
        await signUp(
          formData({
            email: "test@example.com",
            password: "Secure#99x",
            confirmPassword: "Secure#99x",
            termsAccepted: "true",
            specificClausesAccepted: "true",
            captchaToken: "valid-token",
          }),
        );
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
        if (isRedirectError(err)) {
          expect(err.url).toBe("/verify-email");
        }
      }

      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns error before calling Supabase when email is already registered (pre-check)", async () => {
      // Pre-check by email catches all duplicate cases regardless of Supabase config
      // (anti-enumeration or auto-confirm). signUp must NOT be called at all.
      mockLimit.mockResolvedValueOnce([{ id: "existing-profile-id" }]);

      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "valid-token",
        }),
      );

      expect(result.error).toContain("esiste già");
      expect(mockSignUp).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns error when pre-registration email check throws", async () => {
      mockLimit.mockRejectedValueOnce(new Error("DB connection error"));
      const { logger } = await import("@/lib/logger");

      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "valid-token",
        }),
      );

      expect(result).toEqual({ error: "Registrazione fallita. Riprova." });
      expect(logger.error).toHaveBeenCalled();
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it("returns error when profile insert fails (terms acceptance is mandatory)", async () => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      });
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockRejectedValueOnce(new Error("DB error")),
      });
      mockDeleteUser.mockResolvedValue({ error: null });

      const { signUp } = await import("./auth-actions");
      const { logger } = await import("@/lib/logger");

      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "valid-token",
        }),
      );

      expect(result).toEqual({ error: "Registrazione fallita. Riprova." });
      expect(logger.error).toHaveBeenCalled();
    });

    it("cancella l'utente Supabase (compensating delete) se il profile insert fallisce", async () => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: "user-to-delete" } },
        error: null,
      });
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockRejectedValueOnce(new Error("DB error")),
      });
      mockDeleteUser.mockResolvedValue({ error: null });

      const { signUp } = await import("./auth-actions");
      await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "valid-token",
        }),
      );

      expect(mockDeleteUser).toHaveBeenCalledWith("user-to-delete");
    });

    it("logga un errore se deleteUser si risolve con un error field (API-level failure)", async () => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: "user-to-delete" } },
        error: null,
      });
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockRejectedValueOnce(new Error("DB error")),
      });
      mockDeleteUser.mockResolvedValue({
        error: { message: "Invalid service role key" },
      });
      const { logger } = await import("@/lib/logger");

      const { signUp } = await import("./auth-actions");
      await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "valid-token",
        }),
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ deleteErr: expect.anything() }),
        expect.stringContaining("delete auth user"),
      );
    });

    it("returns captcha error when token is missing", async () => {
      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          // captchaToken omitted
        }),
      );
      expect(result).toEqual({ error: "Verifica CAPTCHA fallita. Riprova." });
    });

    it("returns captcha error when Turnstile returns success: false", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false }),
      });

      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "invalid-token",
        }),
      );
      expect(result).toEqual({ error: "Verifica CAPTCHA fallita. Riprova." });
    });

    it("returns captcha error when Turnstile API call throws (network error)", async () => {
      mockFetch.mockRejectedValueOnce(new Error("network error"));
      const { logger } = await import("@/lib/logger");

      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "some-token",
        }),
      );
      expect(result).toEqual({ error: "Verifica CAPTCHA fallita. Riprova." });
      expect(logger.error).toHaveBeenCalled();
    });

    it("returns captcha error when Turnstile API returns non-ok HTTP status", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "some-token",
        }),
      );
      expect(result).toEqual({ error: "Verifica CAPTCHA fallita. Riprova." });
    });

    it("returns captcha error when TURNSTILE_SECRET_KEY is not configured", async () => {
      delete process.env.TURNSTILE_SECRET_KEY;
      const { logger } = await import("@/lib/logger");

      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "some-token",
        }),
      );
      expect(result).toEqual({ error: "Verifica CAPTCHA fallita. Riprova." });
      expect(logger.error).toHaveBeenCalled();
      // beforeEach ripristinerà TURNSTILE_SECRET_KEY per il test successivo
    });

    it("returns captcha error when Turnstile hostname doesn't match expected app hostname", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          hostname: "evil.example.com",
        }),
      });

      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "stolen-token",
        }),
      );

      expect(result).toEqual({ error: "Verifica CAPTCHA fallita. Riprova." });
    });

    it("passes captcha when Turnstile hostname matches NEXT_PUBLIC_APP_HOSTNAME", async () => {
      process.env.NEXT_PUBLIC_APP_HOSTNAME = "custom.myapp.com";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, hostname: "custom.myapp.com" }),
      });
      mockSignUp.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });

      const { signUp } = await import("./auth-actions");
      try {
        await signUp(
          formData({
            email: "test@example.com",
            password: "Secure#99x",
            confirmPassword: "Secure#99x",
            termsAccepted: "true",
            specificClausesAccepted: "true",
            captchaToken: "valid-token",
          }),
        );
      } catch (err) {
        if (!isRedirectError(err)) throw err;
      }

      expect(mockSignUp).toHaveBeenCalled();
    });

    it("APP_HOSTNAME takes precedence over NEXT_PUBLIC_APP_HOSTNAME for Turnstile validation", async () => {
      process.env.APP_HOSTNAME = "sandbox.scontrinozero.it";
      process.env.NEXT_PUBLIC_APP_HOSTNAME = "app.scontrinozero.it";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          hostname: "sandbox.scontrinozero.it",
        }),
      });
      mockSignUp.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });

      const { signUp } = await import("./auth-actions");
      try {
        await signUp(
          formData({
            email: "test@example.com",
            password: "Secure#99x",
            confirmPassword: "Secure#99x",
            termsAccepted: "true",
            specificClausesAccepted: "true",
            captchaToken: "valid-token",
          }),
        );
      } catch (err) {
        if (!isRedirectError(err)) throw err;
      }

      expect(mockSignUp).toHaveBeenCalled();

      delete process.env.APP_HOSTNAME;
    });

    it("falls back to hardcoded default when both APP_HOSTNAME and NEXT_PUBLIC_APP_HOSTNAME are unset", async () => {
      delete process.env.APP_HOSTNAME;
      delete process.env.NEXT_PUBLIC_APP_HOSTNAME;
      // mockFetch already returns hostname: "app.scontrinozero.it" by default
      mockSignUp.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });

      const { signUp } = await import("./auth-actions");
      try {
        await signUp(
          formData({
            email: "test@example.com",
            password: "Secure#99x",
            confirmPassword: "Secure#99x",
            termsAccepted: "true",
            specificClausesAccepted: "true",
            captchaToken: "valid-token",
          }),
        );
      } catch (err) {
        if (!isRedirectError(err)) throw err;
      }

      expect(mockSignUp).toHaveBeenCalled();
    });
  });

  describe("signIn", () => {
    it("returns error for invalid email", async () => {
      const { signIn } = await import("./auth-actions");
      const result = await signIn(formData({ email: "bad", password: "pass" }));
      expect(result).toEqual({ error: "Email non valida." });
    });

    it("returns error for empty password", async () => {
      const { signIn } = await import("./auth-actions");
      const result = await signIn(
        formData({ email: "test@example.com", password: "" }),
      );
      expect(result).toEqual({ error: "Inserisci la password." });
    });

    it("redirects to dashboard on success", async () => {
      mockSignInWithPassword.mockResolvedValue({ error: null });

      const { signIn } = await import("./auth-actions");

      try {
        await signIn(
          formData({ email: "test@example.com", password: "securepass123" }),
        );
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
        if (isRedirectError(err)) {
          expect(err.url).toBe("/dashboard");
        }
      }
    });

    it("returns error on wrong credentials", async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: { message: "Invalid credentials" },
      });

      const { signIn } = await import("./auth-actions");
      const result = await signIn(
        formData({ email: "test@example.com", password: "wrongpass" }),
      );
      expect(result).toEqual({
        error: "Email o password non corretti.",
        email: "test@example.com",
      });
    });
  });

  describe("signOut", () => {
    it("signs out and redirects to login", async () => {
      mockSignOut.mockResolvedValue({ error: null });

      const { signOut } = await import("./auth-actions");

      try {
        await signOut();
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
        if (isRedirectError(err)) {
          expect(err.url).toBe("/login");
        }
      }

      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe("resetPassword", () => {
    it("always redirects to verify-email (no email enumeration)", async () => {
      const { resetPassword } = await import("./auth-actions");

      try {
        await resetPassword(formData({ email: "test@example.com" }));
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
        if (isRedirectError(err)) {
          expect(err.url).toBe("/verify-email");
        }
      }
    });

    it("returns error for invalid email", async () => {
      const { resetPassword } = await import("./auth-actions");
      const result = await resetPassword(formData({ email: "bad" }));
      expect(result).toEqual({ error: "Email non valida." });
    });

    it("calls generateLink with type recovery and the email", async () => {
      const { resetPassword } = await import("./auth-actions");

      try {
        await resetPassword(formData({ email: "test@example.com" }));
      } catch {
        // redirect expected
      }

      expect(mockGenerateLink).toHaveBeenCalledWith({
        type: "recovery",
        email: "test@example.com",
      });
    });

    it("sends PasswordResetEmail with the action_link on success", async () => {
      const { resetPassword } = await import("./auth-actions");

      try {
        await resetPassword(formData({ email: "test@example.com" }));
      } catch {
        // redirect expected
      }

      await Promise.resolve();
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "test@example.com",
          subject: expect.stringContaining("password"),
        }),
      );
    });

    it("still redirects when generateLink returns an error (no email sent)", async () => {
      mockGenerateLink.mockResolvedValue({
        data: { properties: {} },
        error: { message: "User not found" },
      });

      const { resetPassword } = await import("./auth-actions");

      try {
        await resetPassword(formData({ email: "test@example.com" }));
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
        if (isRedirectError(err)) {
          expect(err.url).toBe("/verify-email");
        }
      }

      await Promise.resolve();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("still redirects when action_link is missing (no email sent)", async () => {
      mockGenerateLink.mockResolvedValue({
        data: { properties: {} },
        error: null,
      });

      const { resetPassword } = await import("./auth-actions");

      try {
        await resetPassword(formData({ email: "test@example.com" }));
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
        if (isRedirectError(err)) {
          expect(err.url).toBe("/verify-email");
        }
      }

      await Promise.resolve();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("does not block redirect when sendEmail fails", async () => {
      mockSendEmail.mockRejectedValueOnce(new Error("Resend down"));

      const { resetPassword } = await import("./auth-actions");

      let redirectUrl: string | undefined;
      try {
        await resetPassword(formData({ email: "test@example.com" }));
        expect.fail("Expected redirect");
      } catch (err) {
        if (isRedirectError(err)) redirectUrl = err.url;
      }

      expect(redirectUrl).toBe("/verify-email");
    });

    it("does not send email when action_link points to unexpected host", async () => {
      mockGenerateLink.mockResolvedValue({
        data: {
          properties: {
            action_link: "https://evil.example.com/auth/recovery?token=abc",
          },
        },
        error: null,
      });

      const { resetPassword } = await import("./auth-actions");

      try {
        await resetPassword(formData({ email: "test@example.com" }));
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
        if (isRedirectError(err)) {
          expect(err.url).toBe("/verify-email");
        }
      }

      await Promise.resolve();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("sends email when action_link matches expected hostname", async () => {
      const { resetPassword } = await import("./auth-actions");

      try {
        await resetPassword(formData({ email: "test@example.com" }));
      } catch {
        // redirect expected
      }

      await Promise.resolve();
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "test@example.com" }),
      );
    });

    it("APP_HOSTNAME takes precedence over NEXT_PUBLIC_APP_HOSTNAME for action_link validation", async () => {
      process.env.APP_HOSTNAME = "sandbox.scontrinozero.it";
      process.env.NEXT_PUBLIC_APP_HOSTNAME = "app.scontrinozero.it";
      mockGenerateLink.mockResolvedValueOnce({
        data: {
          properties: {
            action_link:
              "https://sandbox.scontrinozero.it/auth/recovery?token=abc",
          },
        },
        error: null,
      });

      const { resetPassword } = await import("./auth-actions");
      try {
        await resetPassword(formData({ email: "test@example.com" }));
      } catch {
        // redirect expected
      }

      await Promise.resolve();
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "test@example.com" }),
      );

      delete process.env.APP_HOSTNAME;
    });

    it("falls back to hardcoded default hostname for action_link validation when both env vars are unset", async () => {
      delete process.env.APP_HOSTNAME;
      delete process.env.NEXT_PUBLIC_APP_HOSTNAME;
      // mockGenerateLink already returns action_link with "app.scontrinozero.it" by default

      const { resetPassword } = await import("./auth-actions");
      try {
        await resetPassword(formData({ email: "test@example.com" }));
      } catch {
        // redirect expected
      }

      await Promise.resolve();
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "test@example.com" }),
      );
    });
  });

  describe("getClientIp fallback paths", () => {
    it("falls back to x-forwarded-for when cf-connecting-ip is absent", async () => {
      const { headers: headersFn } = await import("next/headers");
      vi.mocked(headersFn).mockResolvedValueOnce({
        get: vi.fn().mockImplementation((name: string) => {
          if (name === "x-forwarded-for") return "10.0.0.1, 192.168.1.1";
          return null;
        }),
      } as unknown as Awaited<ReturnType<typeof headersFn>>);
      mockSignInWithPassword.mockResolvedValue({ error: null });

      const { signIn } = await import("./auth-actions");
      try {
        await signIn(
          formData({ email: "test@example.com", password: "anypass" }),
        );
      } catch {
        // redirect is expected
      }
      expect(mockRateLimiterCheck).toHaveBeenCalledWith(
        expect.stringContaining("10.0.0.1"),
      );
    });

    it("ignora X-Real-IP (non standard) e usa 'unknown'", async () => {
      const { headers: headersFn } = await import("next/headers");
      vi.mocked(headersFn).mockResolvedValueOnce({
        get: vi.fn().mockImplementation((name: string) => {
          if (name === "x-real-ip") return "172.16.0.1";
          return null;
        }),
      } as unknown as Awaited<ReturnType<typeof headersFn>>);
      mockSignInWithPassword.mockResolvedValue({ error: null });

      const { signIn } = await import("./auth-actions");
      try {
        await signIn(
          formData({ email: "test@example.com", password: "anypass" }),
        );
      } catch {
        // redirect is expected
      }
      // X-Real-IP is not trusted: falls back to "unknown"
      expect(mockRateLimiterCheck).toHaveBeenCalledWith(
        expect.stringContaining("unknown"),
      );
    });

    it("uses 'unknown' when no IP header is present", async () => {
      const { headers: headersFn } = await import("next/headers");
      vi.mocked(headersFn).mockResolvedValueOnce({
        get: vi.fn().mockReturnValue(null),
      } as unknown as Awaited<ReturnType<typeof headersFn>>);
      mockSignInWithPassword.mockResolvedValue({ error: null });

      const { signIn } = await import("./auth-actions");
      try {
        await signIn(
          formData({ email: "test@example.com", password: "anypass" }),
        );
      } catch {
        // redirect is expected
      }
      expect(mockRateLimiterCheck).toHaveBeenCalledWith(
        expect.stringContaining("unknown"),
      );
    });
  });
});
