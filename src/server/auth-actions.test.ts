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
const mockResetPasswordForEmail = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      signInWithOtp: mockSignInWithOtp,
      signOut: mockSignOut,
      resetPasswordForEmail: mockResetPasswordForEmail,
    },
  }),
}));

const mockInsert = vi.fn().mockReturnValue({
  values: vi.fn().mockResolvedValue(undefined),
});
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
        }),
      );
      expect(result.error).toContain("Troppi tentativi");
    });

    it("redirects to verify-email even if profile creation fails", async () => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      });
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockRejectedValueOnce(new Error("DB error")),
      });

      const { signUp } = await import("./auth-actions");

      try {
        await signUp(
          formData({
            email: "test@example.com",
            password: "Secure#99x",
            confirmPassword: "Secure#99x",
          }),
        );
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
      }
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
      expect(result).toEqual({ error: "Email o password non corretti." });
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
      mockResetPasswordForEmail.mockResolvedValue({ error: null });

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

    it("still redirects when resetPasswordForEmail returns an error", async () => {
      mockResetPasswordForEmail.mockResolvedValue({
        error: { message: "Email not found" },
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
