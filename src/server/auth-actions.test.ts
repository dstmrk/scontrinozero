// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockRateLimiterCheck = vi
  .fn()
  .mockReturnValue({ success: true, remaining: 4 });
vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
}));

const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignInWithOtp = vi.fn();
const mockSignOut = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      signInWithOtp: mockSignInWithOtp,
      signOut: mockSignOut,
    },
  }),
}));

const mockGenerateLink = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn().mockReturnValue({
    auth: {
      admin: { generateLink: mockGenerateLink },
    },
  }),
}));

const mockValues = vi.fn().mockResolvedValue(undefined);
const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({ insert: mockInsert }),
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

vi.mock("@/emails/welcome", () => ({
  WelcomeEmail: vi.fn().mockReturnValue(null),
}));

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
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimiterCheck.mockReturnValue({ success: true, remaining: 4 });
    mockGenerateLink.mockResolvedValue({
      data: {
        properties: {
          action_link: "https://supabase.co/auth/recovery?token=abc",
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
      });
      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          termsAcceptedAt: expect.any(Date),
          termsVersion: "v01",
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

    it("sends welcome email after successful signup", async () => {
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
          }),
        );
      } catch {
        // redirect expected
      }

      // fire-and-forget: advance microtasks so the void promise settles
      await Promise.resolve();
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "test@example.com" }),
      );
    });

    it("does not send welcome email when Supabase signUp fails", async () => {
      mockSignUp.mockResolvedValue({
        data: { user: null },
        error: { message: "User already exists" },
      });

      const { signUp } = await import("./auth-actions");
      await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
        }),
      );

      await Promise.resolve();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("does not block signup when welcome email fails", async () => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      });
      mockSendEmail.mockRejectedValueOnce(new Error("Resend down"));

      const { signUp } = await import("./auth-actions");

      let redirectUrl: string | undefined;
      try {
        await signUp(
          formData({
            email: "test@example.com",
            password: "Secure#99x",
            confirmPassword: "Secure#99x",
            termsAccepted: "true",
            specificClausesAccepted: "true",
          }),
        );
      } catch (err) {
        if (isRedirectError(err)) redirectUrl = err.url;
      }

      // Registration still completes (redirect fires) even if email fails
      expect(redirectUrl).toBe("/verify-email");
    });

    it("does not send welcome email when profile insert fails", async () => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      });
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockRejectedValueOnce(new Error("DB error")),
      });

      const { signUp } = await import("./auth-actions");
      await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
        }),
      );

      await Promise.resolve();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("returns error when profile insert fails (terms acceptance is mandatory)", async () => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      });
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockRejectedValueOnce(new Error("DB error")),
      });

      const { signUp } = await import("./auth-actions");
      const { logger } = await import("@/lib/logger");

      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
        }),
      );

      expect(result).toEqual({ error: "Registrazione fallita. Riprova." });
      expect(logger.error).toHaveBeenCalled();
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

  describe("signInWithMagicLink", () => {
    it("redirects to verify-email on success", async () => {
      mockSignInWithOtp.mockResolvedValue({ error: null });

      const { signInWithMagicLink } = await import("./auth-actions");

      try {
        await signInWithMagicLink(formData({ email: "test@example.com" }));
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
      }

      expect(mockSignInWithOtp).toHaveBeenCalledWith({
        email: "test@example.com",
      });
    });

    it("returns error for invalid email", async () => {
      const { signInWithMagicLink } = await import("./auth-actions");
      const result = await signInWithMagicLink(formData({ email: "bad" }));
      expect(result).toEqual({ error: "Email non valida." });
    });

    it("returns error when magic link fails", async () => {
      mockSignInWithOtp.mockResolvedValue({
        error: { message: "Rate limit exceeded" },
      });

      const { signInWithMagicLink } = await import("./auth-actions");
      const result = await signInWithMagicLink(
        formData({ email: "test@example.com" }),
      );
      expect(result).toEqual({ error: "Invio link fallito. Riprova." });
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

    it("falls back to x-real-ip when other headers are absent", async () => {
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
      expect(mockRateLimiterCheck).toHaveBeenCalledWith(
        expect.stringContaining("172.16.0.1"),
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
