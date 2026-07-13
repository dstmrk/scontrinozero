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
const mockResend = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      resend: mockResend,
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

const mockReturning = vi.fn().mockResolvedValue([{ id: "profile-id" }]);
const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
const mockLimit = vi.fn().mockResolvedValue([]);
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    insert: mockInsert,
    select: mockSelect,
    // insertProfileOrRollback avvolge profilo + redemption in una transazione;
    // il tx riusa lo stesso mock insert (catena values().returning() invariata).
    transaction: async (cb: (tx: unknown) => unknown) =>
      cb({ insert: mockInsert }),
  }),
}));

vi.mock("@/db/schema", () => ({
  profiles: "profiles-table",
}));

// getPartnerBySlug è mockata: i test partner controllano direttamente il
// codice del partner senza passare dal DB (extractPartnerSlug resta reale).
const mockGetPartnerBySlug = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/partners/partner-context", () => ({
  getPartnerBySlug: mockGetPartnerBySlug,
}));

// Host della richiesta, controllabile per test (default: dominio app standard).
// Le altre chiavi (CF-Connecting-IP, ecc.) restano l'IP client.
let mockHostHeader = "app.scontrinozero.it";
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: vi.fn((key: string) =>
      String(key).toLowerCase() === "host" ? mockHostHeader : "127.0.0.1",
    ),
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

  // Helper: builds a Turnstile siteverify response. Each describe block calls
  // it in its own beforeEach to set the matching `action` (signup / signin /
  // reset-password) — verifyCaptcha rejects tokens whose action does not
  // match the flow.
  function captchaResponse(action: string, hostname = "app.scontrinozero.it") {
    return {
      ok: true,
      json: async () => ({ success: true, hostname, action }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockHostHeader = "app.scontrinozero.it";
    mockGetPartnerBySlug.mockResolvedValue(null);
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    process.env.NEXT_PUBLIC_APP_HOSTNAME = "app.scontrinozero.it";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    mockRateLimiterCheck.mockReturnValue({ success: true, remaining: 4 });
    // Default: action="signup" (most-tested). signIn / resetPassword describe
    // blocks override this in nested beforeEach with the matching action.
    mockFetch.mockResolvedValue(captchaResponse("signup"));
    // generateLink returns an action_link on the SUPABASE host, carrying the app
    // host in the redirect_to param (the real GoTrue /auth/v1/verify shape).
    mockGenerateLink.mockResolvedValue({
      data: {
        properties: {
          action_link:
            "https://test.supabase.co/auth/v1/verify?token=abc&type=recovery&redirect_to=https://app.scontrinozero.it/callback",
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
      mockFetch.mockResolvedValueOnce(
        captchaResponse("signup", "sandbox.scontrinozero.it"),
      );
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

    it("rate-limit warning log uses ipHash, never raw IP", async () => {
      // Pre-limit pass, post-limit fail — exercises the auth_rate_limit log.
      mockRateLimiterCheck
        .mockReturnValueOnce({ success: true, remaining: 29 })
        .mockReturnValueOnce({ success: false, remaining: 0 });
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

      const warnCalls = vi.mocked(logger.warn).mock.calls;
      const rateLimitCall = warnCalls.find(
        (c) => c[1] === "Auth rate limit exceeded",
      );
      if (!rateLimitCall) {
        throw new Error("Expected rate-limit warn log to have been emitted");
      }
      const payload = rateLimitCall[0] as Record<string, unknown>;
      expect(payload).toHaveProperty("ipHash");
      expect(payload).not.toHaveProperty("ip");
      // Hash for "127.0.0.1" should be a short hex string, not the raw IP.
      expect(payload.ipHash).not.toBe("127.0.0.1");
      expect(typeof payload.ipHash).toBe("string");
      expect(payload).toMatchObject({ errorClass: "auth_rate_limit" });
    });

    it("pre-captcha gate blocks the request before Turnstile siteverify is called", async () => {
      // First check (pre-limit) returns failure. fetch must never be called.
      mockRateLimiterCheck.mockReturnValueOnce({
        success: false,
        remaining: 0,
      });

      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "any-token",
        }),
      );

      expect(result.error).toContain("Troppi tentativi");
      // The cardinal invariant: NO outbound Turnstile call when pre-limit fires.
      expect(mockFetch).not.toHaveBeenCalled();
      // post-limit must not be reached either
      expect(mockRateLimiterCheck).toHaveBeenCalledTimes(1);
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it("pre-captcha gate emits a structured warn log with captcha_prelimit errorClass", async () => {
      mockRateLimiterCheck.mockReturnValueOnce({
        success: false,
        remaining: 0,
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
          captchaToken: "any-token",
        }),
      );

      const warnCalls = vi.mocked(logger.warn).mock.calls;
      const preLimitCall = warnCalls.find(
        (c) =>
          c[1] === "Captcha pre-limit exceeded — Turnstile call suppressed",
      );
      if (!preLimitCall) {
        throw new Error("Expected pre-captcha warn log to have been emitted");
      }
      const payload = preLimitCall[0] as Record<string, unknown>;
      expect(payload).toMatchObject({
        errorClass: "captcha_prelimit",
        action: "signup",
      });
      expect(payload).toHaveProperty("ipHash");
      expect(payload).not.toHaveProperty("ip");
    });

    it("pre-captcha gate uses a separate bucket key per action and ip", async () => {
      mockRateLimiterCheck.mockReturnValue({ success: true, remaining: 29 });
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
      } catch {
        // redirect expected
      }

      // First call to the limiter must be the pre-captcha bucket; second must
      // be the auth bucket. Bucket keys are namespaced to avoid collisions.
      const calls = mockRateLimiterCheck.mock.calls;
      expect(calls[0]?.[0]).toMatch(/^captchaPre:signup:/);
      expect(calls[1]?.[0]).toMatch(/^signUp:/);
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

    it("redirects to /verify-email when email is already registered (pre-check, anti-enumeration)", async () => {
      // Anti-enumeration: surface the same UX as the resetPassword flow.
      // signUp must NOT be called at all when the email already exists.
      mockLimit.mockResolvedValueOnce([{ id: "existing-profile-id" }]);

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

    it("blocca la registrazione con un codice referral malformato (hard-block, non enumeration)", async () => {
      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "valid-token",
          rcode: "not-valid!!",
        }),
      );

      expect(result).toEqual({
        error:
          "Codice referral non valido. Correggilo o rimuovilo per continuare.",
      });
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it("blocca la registrazione con un codice referral ben formato ma inesistente", async () => {
      // 1a mockLimit: email pre-check (non esiste) → []. 2a: lookup referral → [].
      mockLimit.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "valid-token",
          rcode: "AB2CDEFG",
        }),
      );

      expect(result).toEqual({
        error:
          "Codice referral non valido. Correggilo o rimuovilo per continuare.",
      });
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it("registra referredByReferralCode e crea la redemption row con un codice referral valido", async () => {
      mockLimit
        .mockResolvedValueOnce([]) // email pre-check
        .mockResolvedValueOnce([
          { id: "referrer-profile-id", referralCode: "AB2CDEFG" },
        ]); // referral lookup
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
            rcode: "AB2CDEFG",
          }),
        );
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
      }

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          referredByReferralCode: "AB2CDEFG",
          referralBonusDays: 30,
        }),
      );
      // Seconda insert: la redemption row su referral_redemptions.
      expect(mockInsert).toHaveBeenCalledTimes(2);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          referrerId: "referrer-profile-id",
          refereeId: "profile-id",
          referralCode: "AB2CDEFG",
        }),
      );
    });

    it("registra signup senza bonus quando rcode è assente (comportamento di default)", async () => {
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

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          referredByReferralCode: null,
          referralBonusDays: 0,
        }),
      );
      expect(mockInsert).toHaveBeenCalledTimes(1);
    });

    it("blocca la registrazione su un subdomain partner senza codice (force+lock server-side)", async () => {
      mockHostHeader = "nds-app.scontrinozero.it";
      mockGetPartnerBySlug.mockResolvedValue({
        slug: "nds",
        label: "x NDS",
        referralCode: "NDS12345",
      });
      mockFetch.mockResolvedValue(
        captchaResponse("signup", "nds-app.scontrinozero.it"),
      );

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

      expect(result?.error).toMatch(/riservata agli utenti del partner/);
      // L'enforcement scatta prima di Supabase: nessun utente auth creato.
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it("blocca la registrazione su un subdomain partner con un codice diverso da quello del partner", async () => {
      mockHostHeader = "nds-app.scontrinozero.it";
      mockGetPartnerBySlug.mockResolvedValue({
        slug: "nds",
        label: "x NDS",
        referralCode: "NDS12345",
      });
      mockFetch.mockResolvedValue(
        captchaResponse("signup", "nds-app.scontrinozero.it"),
      );

      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "valid-token",
          rcode: "WRONGXX1",
        }),
      );

      expect(result?.error).toMatch(/riservata agli utenti del partner/);
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it("consente la registrazione su un subdomain partner col codice del partner e registra l'attribuzione", async () => {
      mockHostHeader = "nds-app.scontrinozero.it";
      mockGetPartnerBySlug.mockResolvedValue({
        slug: "nds",
        label: "x NDS",
        referralCode: "NDS12345",
      });
      mockFetch.mockResolvedValue(
        captchaResponse("signup", "nds-app.scontrinozero.it"),
      );
      mockLimit
        .mockResolvedValueOnce([]) // email pre-check
        .mockResolvedValueOnce([
          { id: "nds-profile-id", referralCode: "NDS12345" },
        ]); // referral lookup (resolveReferrer)
      mockSignUp.mockResolvedValue({
        data: { user: { id: "user-nds" } },
        error: null,
      });

      const { signUp } = await import("./auth-actions");
      try {
        await signUp(
          formData({
            email: "user@nds.it",
            password: "Secure#99x",
            confirmPassword: "Secure#99x",
            termsAccepted: "true",
            specificClausesAccepted: "true",
            captchaToken: "valid-token",
            rcode: "NDS12345",
          }),
        );
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
      }

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          referredByReferralCode: "NDS12345",
          referralBonusDays: 30,
        }),
      );
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          referrerId: "nds-profile-id",
          refereeId: "profile-id",
          referralCode: "NDS12345",
        }),
      );
    });

    it("rifiuta il captcha da un host -app senza partner attivo (allowlist Turnstile)", async () => {
      mockGetPartnerBySlug.mockResolvedValue(null);
      mockFetch.mockResolvedValue(
        captchaResponse("signup", "ghost-app.scontrinozero.it"),
      );

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

      expect(result?.error).toBe("Verifica CAPTCHA fallita. Riprova.");
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

    it("chiama deleteUser anche quando l'insert profile fallisce con UNIQUE constraint (no orphan auth user)", async () => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: "loser-of-race" } },
        error: null,
      });
      const uniqueErr = Object.assign(new Error("duplicate key"), {
        code: "23505",
      });
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockRejectedValueOnce(uniqueErr),
      });
      mockDeleteUser.mockResolvedValue({ error: null });

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
        // Anti-enumeration: expect redirect to /verify-email
        expect(isRedirectError(err)).toBe(true);
        if (isRedirectError(err)) {
          expect(err.url).toBe("/verify-email");
        }
      }

      // The orphan auth user MUST be deleted (CLAUDE.md regola #17).
      expect(mockDeleteUser).toHaveBeenCalledWith("loser-of-race");
    });

    it("ritenta deleteUser con backoff su errore transitorio (compensating delete)", async () => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: "user-retry" } },
        error: null,
      });
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockRejectedValueOnce(new Error("DB error")),
      });
      // 2 failures then success
      mockDeleteUser
        .mockResolvedValueOnce({ error: { message: "transient" } })
        .mockResolvedValueOnce({ error: { message: "transient" } })
        .mockResolvedValueOnce({ error: null });

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

      expect(mockDeleteUser).toHaveBeenCalledTimes(3);
    });

    it("logga critical:true se deleteUser fallisce su tutti i 3 retry", async () => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: "stubborn-orphan" } },
        error: null,
      });
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockRejectedValueOnce(new Error("DB error")),
      });
      mockDeleteUser.mockResolvedValue({ error: { message: "persistent" } });
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

      expect(mockDeleteUser).toHaveBeenCalledTimes(3);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ critical: true }),
        expect.any(String),
      );
    });

    // --- REVIEW #65: race sul doppio signUp ---

    it("NON cancella l'auth user quando un profilo esiste già per lo stesso authUserId (race doppio signUp)", async () => {
      // R2 del doppio signUp: Supabase riusa lo stesso auth user id, l'insert
      // fallisce con unique violation, ma l'auth user appartiene alla
      // registrazione R1 già committata → NON deve essere cancellato.
      mockSignUp.mockResolvedValue({
        // identities non vuoto: bypassa il guard obfuscated (isoliamo il guard
        // in insertProfileOrRollback).
        data: { user: { id: "shared-auth-id", identities: [{ id: "i1" }] } },
        error: null,
      });
      const uniqueErr = Object.assign(new Error("duplicate key"), {
        code: "23505",
      });
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockRejectedValueOnce(uniqueErr),
      });
      // 1ª SELECT = pre-check email (nessun profilo → signup procede);
      // 2ª SELECT = guard esistenza profilo per authUserId (riga presente).
      mockLimit.mockResolvedValueOnce([]);
      mockLimit.mockResolvedValueOnce([{ id: "r1-profile-id" }]);

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

      // L'auth user legittimo di R1 NON deve essere toccato.
      expect(mockDeleteUser).not.toHaveBeenCalled();
    });

    it("redirect a /verify-email senza insert quando signUp ritorna un utente obfuscato (identities vuoto)", async () => {
      // Email già registrata e non confermata: Supabase ritorna un utente
      // obfuscato con identities: [] riusando l'id esistente.
      mockSignUp.mockResolvedValue({
        data: { user: { id: "existing-auth-id", identities: [] } },
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

      // Nessun tentativo di insert e nessuna cancellazione dell'auth user.
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockDeleteUser).not.toHaveBeenCalled();
    });

    it("cancella l'auth user orfano quando l'insert fallisce e NESSUN profilo esiste per l'authUserId (fallimento genuino)", async () => {
      // Nessun profilo per l'authUserId (guard → []): l'auth user è davvero
      // orfano e il compensating delete deve procedere (comportamento storico).
      mockSignUp.mockResolvedValue({
        data: { user: { id: "genuine-orphan", identities: [{ id: "i1" }] } },
        error: null,
      });
      const uniqueErr = Object.assign(new Error("duplicate key"), {
        code: "23505",
      });
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockRejectedValueOnce(uniqueErr),
      });
      // Pre-check email [] e guard esistenza profilo [] → orfano genuino.
      mockLimit.mockResolvedValueOnce([]);
      mockLimit.mockResolvedValueOnce([]);
      mockDeleteUser.mockResolvedValue({ error: null });

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
        expect(isRedirectError(err)).toBe(true);
      }

      expect(mockDeleteUser).toHaveBeenCalledWith("genuine-orphan");
    });

    it("degrada al compensating delete quando il guard di esistenza profilo fallisce (regola 19)", async () => {
      // Se anche la query di guard fallisce non possiamo confermare l'esistenza
      // del profilo: torniamo al comportamento storico (compensating delete)
      // invece di propagare l'errore.
      mockSignUp.mockResolvedValue({
        data: { user: { id: "orphan-guard-fail", identities: [{ id: "i1" }] } },
        error: null,
      });
      const uniqueErr = Object.assign(new Error("duplicate key"), {
        code: "23505",
      });
      mockInsert.mockReturnValueOnce({
        values: vi.fn().mockRejectedValueOnce(uniqueErr),
      });
      // Pre-check email [] poi guard che rigetta → profileExistsForAuthUser=false.
      mockLimit.mockResolvedValueOnce([]);
      mockLimit.mockRejectedValueOnce(new Error("guard DB error"));
      mockDeleteUser.mockResolvedValue({ error: null });

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
        expect(isRedirectError(err)).toBe(true);
      }

      expect(mockDeleteUser).toHaveBeenCalledWith("orphan-guard-fail");
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

    it("bypass dev: salta il captcha con TURNSTILE_DISABLED=true e ADE_MODE=mock", async () => {
      vi.stubEnv("TURNSTILE_DISABLED", "true");
      vi.stubEnv("ADE_MODE", "mock");
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
            // captchaToken omesso di proposito: in bypass non serve
          }),
        );
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
      }
      // verifyCaptcha esce prima: siteverify NON deve essere invocato.
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("prod safety: NON salta il captcha con TURNSTILE_DISABLED=true ma ADE_MODE=real", async () => {
      vi.stubEnv("TURNSTILE_DISABLED", "true");
      vi.stubEnv("ADE_MODE", "real");

      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          // captchaToken omesso: in produzione il captcha resta obbligatorio
        }),
      );
      expect(result).toEqual({ error: "Verifica CAPTCHA fallita. Riprova." });
    });

    it("returns captcha error when Turnstile hostname doesn't match expected app hostname", async () => {
      mockFetch.mockResolvedValueOnce(
        captchaResponse("signup", "evil.example.com"),
      );

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
      mockFetch.mockResolvedValueOnce(
        captchaResponse("signup", "custom.myapp.com"),
      );
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
      mockFetch.mockResolvedValueOnce(
        captchaResponse("signup", "sandbox.scontrinozero.it"),
      );
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

    it("rejects a captcha token whose action does not match (cross-flow replay)", async () => {
      // Simulate replay: a token solved for signin/reset-password is presented
      // to signUp. verifyCaptcha must refuse it even though success+hostname
      // are valid.
      mockFetch.mockResolvedValueOnce(
        captchaResponse("signin"), // action mismatch (signUp expects "signup")
      );

      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "stolen-from-signin",
        }),
      );

      expect(result).toEqual({ error: "Verifica CAPTCHA fallita. Riprova." });
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it("rejects a captcha token when action is missing from response", async () => {
      // Older client integrations or misconfigured widgets may not attach an
      // action. We treat missing action as mismatch — fail-closed.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          hostname: "app.scontrinozero.it",
          // action intentionally omitted
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
          captchaToken: "no-action-token",
        }),
      );

      expect(result).toEqual({ error: "Verifica CAPTCHA fallita. Riprova." });
      expect(mockSignUp).not.toHaveBeenCalled();
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

    // Note sui casi non ovvii:
    // - "marketing domain": riproduce il bug di produzione — il widget è
    //   caricato dal dominio marketing (es. via <Link> client-side verso
    //   /login) e Cloudflare ritorna hostname=<marketing>, non <app>. Pre-fix
    //   verifyCaptcha lo rifiutava come `captcha_hostname_mismatch`.
    // - "lowercase / mixed case": Turnstile ritorna data.hostname sempre
    //   lowercase; se l'env d'identità ha maiuscole ("App.ScontrinoZero.IT")
    //   il match esatto fallirebbe senza normalizzazione (REVIEW.md #37).
    it.each([
      {
        name: "accepts a captcha token whose hostname is the marketing domain (single-domain / client-side nav)",
        appHostname: "app.scontrinozero.it",
        marketingHostname: "scontrinozero.it",
        captchaHostname: "scontrinozero.it",
      },
      {
        name: "accepts a captcha token whose hostname is the www variant of the marketing domain",
        appHostname: "app.scontrinozero.it",
        marketingHostname: "scontrinozero.it",
        captchaHostname: "www.scontrinozero.it",
      },
      {
        name: "accepts the lowercase Turnstile hostname even when the app env has mixed case",
        appHostname: "App.ScontrinoZero.IT",
        marketingHostname: "scontrinozero.it",
        captchaHostname: "app.scontrinozero.it",
      },
      {
        name: "accepts the marketing hostname even when its env has surrounding whitespace",
        appHostname: "app.scontrinozero.it",
        marketingHostname: "  scontrinozero.it  ",
        captchaHostname: "scontrinozero.it",
      },
    ])("$name", async ({ appHostname, marketingHostname, captchaHostname }) => {
      process.env.NEXT_PUBLIC_APP_HOSTNAME = appHostname;
      process.env.NEXT_PUBLIC_MARKETING_HOSTNAME = marketingHostname;
      mockFetch.mockResolvedValueOnce(
        captchaResponse("signup", captchaHostname),
      );
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

    it("still rejects hostnames outside the app/marketing/www allowlist (e.g. attacker domain)", async () => {
      process.env.NEXT_PUBLIC_APP_HOSTNAME = "app.scontrinozero.it";
      process.env.NEXT_PUBLIC_MARKETING_HOSTNAME = "scontrinozero.it";
      mockFetch.mockResolvedValueOnce(
        captchaResponse("signup", "evil.example.com"),
      );

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
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it("falls back to the next hostname env when APP_HOSTNAME is present but empty", async () => {
      // Regola 18: un `??` non scatta su `""` (present-but-empty). Senza lo
      // scarto esplicito delle stringhe vuote, un build-arg dimenticato
      // produrrebbe un appHostname vuoto e ogni captcha verrebbe rifiutato.
      process.env.APP_HOSTNAME = "";
      process.env.NEXT_PUBLIC_APP_HOSTNAME = "app.scontrinozero.it";
      process.env.NEXT_PUBLIC_MARKETING_HOSTNAME = "scontrinozero.it";
      mockFetch.mockResolvedValueOnce(
        captchaResponse("signup", "app.scontrinozero.it"),
      );
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

    it("logs captcha_verification_failed with error-codes when Turnstile returns success:false", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          "error-codes": ["timeout-or-duplicate"],
        }),
      });
      const { logger } = await import("@/lib/logger");

      const { signUp } = await import("./auth-actions");
      const result = await signUp(
        formData({
          email: "test@example.com",
          password: "Secure#99x",
          confirmPassword: "Secure#99x",
          termsAccepted: "true",
          specificClausesAccepted: "true",
          captchaToken: "duplicate-token",
        }),
      );

      expect(result).toEqual({ error: "Verifica CAPTCHA fallita. Riprova." });
      expect(mockSignUp).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          errorClass: "captcha_verification_failed",
          errorCodes: ["timeout-or-duplicate"],
        }),
        "Turnstile siteverify rejected token",
      );
    });

    it("logs captcha_verification_failed with empty array when error-codes is absent", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false }),
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
          captchaToken: "bad-token",
        }),
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          errorClass: "captcha_verification_failed",
          errorCodes: [],
        }),
        "Turnstile siteverify rejected token",
      );
    });
  });

  describe("signIn", () => {
    beforeEach(() => {
      // signIn expects action="signin"
      mockFetch.mockResolvedValue(captchaResponse("signin"));
    });

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

    it("returns captcha error when token is missing", async () => {
      const { signIn } = await import("./auth-actions");
      const result = await signIn(
        formData({ email: "test@example.com", password: "securepass123" }),
      );
      expect(result).toEqual({ error: "Verifica CAPTCHA fallita. Riprova." });
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });

    it("returns captcha error when Turnstile validation fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false }),
      });
      const { signIn } = await import("./auth-actions");
      const result = await signIn(
        formData({
          email: "test@example.com",
          password: "securepass123",
          captchaToken: "bad-token",
        }),
      );
      expect(result).toEqual({ error: "Verifica CAPTCHA fallita. Riprova." });
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });

    it("redirects to dashboard on success", async () => {
      mockSignInWithPassword.mockResolvedValue({ error: null });

      const { signIn } = await import("./auth-actions");

      try {
        await signIn(
          formData({
            email: "test@example.com",
            password: "securepass123",
            captchaToken: "valid-token",
          }),
        );
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
        if (isRedirectError(err)) {
          expect(err.url).toBe("/dashboard");
        }
      }
    });

    it("honours a safe relative redirect param (deep-link restore)", async () => {
      mockSignInWithPassword.mockResolvedValue({ error: null });

      const { signIn } = await import("./auth-actions");

      try {
        await signIn(
          formData({
            email: "test@example.com",
            password: "securepass123",
            captchaToken: "valid-token",
            redirect: "/dashboard/storico?from=2024-01-01&to=2024-01-31",
          }),
        );
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
        if (isRedirectError(err)) {
          expect(err.url).toBe(
            "/dashboard/storico?from=2024-01-01&to=2024-01-31",
          );
        }
      }
    });

    it.each([
      ["protocol-relative", "//evil.com"],
      ["absolute URL", "https://evil.com"],
      ["no leading slash", "evil.com/phishing"],
      ["empty string", ""],
    ])(
      "falls back to /dashboard for an unsafe redirect param (%s)",
      async (_label, redirectValue) => {
        mockSignInWithPassword.mockResolvedValue({ error: null });

        const { signIn } = await import("./auth-actions");

        try {
          await signIn(
            formData({
              email: "test@example.com",
              password: "securepass123",
              captchaToken: "valid-token",
              redirect: redirectValue,
            }),
          );
          expect.fail("Expected redirect");
        } catch (err) {
          expect(isRedirectError(err)).toBe(true);
          if (isRedirectError(err)) {
            expect(err.url).toBe("/dashboard");
          }
        }
      },
    );

    it("returns error on wrong credentials", async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: { message: "Invalid credentials" },
      });

      const { signIn } = await import("./auth-actions");
      const result = await signIn(
        formData({
          email: "test@example.com",
          password: "wrongpass",
          captchaToken: "valid-token",
        }),
      );
      expect(result).toEqual({
        error: "Email o password non corretti.",
        email: "test@example.com",
      });
    });

    it("returns needsEmailConfirmation when the email is not confirmed", async () => {
      // Supabase ritorna questo stato solo con password corretta → niente leak.
      mockSignInWithPassword.mockResolvedValue({
        error: { message: "Email not confirmed", status: 400 },
      });

      const { signIn } = await import("./auth-actions");
      const result = await signIn(
        formData({
          email: "test@example.com",
          password: "securepass123",
          captchaToken: "valid-token",
        }),
      );

      expect(result.needsEmailConfirmation).toBe(true);
      expect(result.email).toBe("test@example.com");
      expect(result.error).toMatch(/conferma/i);
    });
  });

  describe("resendConfirmationEmail", () => {
    beforeEach(() => {
      // resendConfirmationEmail expects action="resend-confirmation"
      mockFetch.mockResolvedValue(captchaResponse("resend-confirmation"));
    });

    it("returns error for invalid email", async () => {
      const { resendConfirmationEmail } = await import("./auth-actions");
      const result = await resendConfirmationEmail(formData({ email: "bad" }));
      expect(result).toEqual({ error: "Email non valida." });
      expect(mockResend).not.toHaveBeenCalled();
    });

    it("returns captcha error when token is missing", async () => {
      const { resendConfirmationEmail } = await import("./auth-actions");
      const result = await resendConfirmationEmail(
        formData({ email: "test@example.com" }),
      );
      expect(result).toEqual({ error: "Verifica CAPTCHA fallita. Riprova." });
      expect(mockResend).not.toHaveBeenCalled();
    });

    it("blocks the request when rate-limited, without calling resend", async () => {
      // Pre-captcha gate passa, il rate-limit funzionale (authLimiter) nega.
      mockRateLimiterCheck
        .mockReturnValueOnce({ success: true, remaining: 4 })
        .mockReturnValueOnce({ success: false, remaining: 0 });

      const { resendConfirmationEmail } = await import("./auth-actions");
      const result = await resendConfirmationEmail(
        formData({ email: "test@example.com", captchaToken: "valid-token" }),
      );

      expect(result.error).toBeDefined();
      expect(mockResend).not.toHaveBeenCalled();
    });

    it("calls resend(type=signup) and redirects to /verify-email on success", async () => {
      mockResend.mockResolvedValue({ error: null });

      const { resendConfirmationEmail } = await import("./auth-actions");
      try {
        await resendConfirmationEmail(
          formData({ email: "test@example.com", captchaToken: "valid-token" }),
        );
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
        if (isRedirectError(err)) {
          expect(err.url).toBe("/verify-email");
        }
      }

      expect(mockResend).toHaveBeenCalledWith(
        expect.objectContaining({ type: "signup", email: "test@example.com" }),
      );
    });

    it("redirects to /verify-email even when resend fails (anti-enumeration)", async () => {
      mockResend.mockResolvedValue({
        error: { message: "User not found", status: 400 },
      });

      const { resendConfirmationEmail } = await import("./auth-actions");
      try {
        await resendConfirmationEmail(
          formData({ email: "ghost@example.com", captchaToken: "valid-token" }),
        );
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
        if (isRedirectError(err)) {
          expect(err.url).toBe("/verify-email");
        }
      }
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
    beforeEach(() => {
      // resetPassword expects action="reset-password"
      mockFetch.mockResolvedValue(captchaResponse("reset-password"));
    });

    it("returns captcha error when token is missing (prevents email-bomb)", async () => {
      const { resetPassword } = await import("./auth-actions");
      const result = await resetPassword(
        formData({ email: "test@example.com" }),
      );
      expect(result).toEqual({ error: "Verifica CAPTCHA fallita. Riprova." });
      expect(mockGenerateLink).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("returns captcha error when Turnstile validation fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false }),
      });
      const { resetPassword } = await import("./auth-actions");
      const result = await resetPassword(
        formData({ email: "test@example.com", captchaToken: "bad-token" }),
      );
      expect(result).toEqual({ error: "Verifica CAPTCHA fallita. Riprova." });
      expect(mockGenerateLink).not.toHaveBeenCalled();
    });

    it("always redirects to verify-email (no email enumeration)", async () => {
      const { resetPassword } = await import("./auth-actions");

      try {
        await resetPassword(
          formData({ email: "test@example.com", captchaToken: "valid-token" }),
        );
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
        await resetPassword(
          formData({ email: "test@example.com", captchaToken: "valid-token" }),
        );
      } catch {
        // redirect expected
      }

      expect(mockGenerateLink).toHaveBeenCalledWith({
        type: "recovery",
        email: "test@example.com",
        options: {
          redirectTo:
            "https://app.scontrinozero.it/callback?redirect=%2Freset-password%2Fupdate",
        },
      });
    });

    it("sends PasswordResetEmail with the action_link on success", async () => {
      const { resetPassword } = await import("./auth-actions");

      try {
        await resetPassword(
          formData({ email: "test@example.com", captchaToken: "valid-token" }),
        );
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
        error: { message: "User not found", status: 422 },
      });

      const { resetPassword } = await import("./auth-actions");
      const { logger } = await import("@/lib/logger");

      try {
        await resetPassword(
          formData({ email: "test@example.com", captchaToken: "valid-token" }),
        );
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
        if (isRedirectError(err)) {
          expect(err.url).toBe("/verify-email");
        }
      }

      await Promise.resolve();
      expect(mockSendEmail).not.toHaveBeenCalled();
      // Regola 20 / SCONTRINOZERO-Q: "User not found" è input utente
      // prevedibile → warn (con errorClass) e MAI error (che risalirebbe a
      // Sentry come issue). Allineato a resendConfirmationEmail.
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ errorClass: expect.any(String) }),
        "Reset password generateLink failed",
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("still redirects when action_link is missing (no email sent)", async () => {
      mockGenerateLink.mockResolvedValue({
        data: { properties: {} },
        error: null,
      });

      const { resetPassword } = await import("./auth-actions");

      try {
        await resetPassword(
          formData({ email: "test@example.com", captchaToken: "valid-token" }),
        );
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

    it("returns a neutral error and does not redirect when sendEmail fails", async () => {
      mockSendEmail.mockRejectedValueOnce(new Error("Resend down"));

      const { resetPassword } = await import("./auth-actions");

      const result = await resetPassword(
        formData({ email: "test@example.com", captchaToken: "valid-token" }),
      );

      expect(result).toEqual({
        error:
          "Non siamo riusciti a inviare l'email. Riprova tra qualche minuto.",
      });
    });

    it("does not send email when action_link host is not the Supabase host", async () => {
      mockGenerateLink.mockResolvedValue({
        data: {
          properties: {
            action_link:
              "https://evil.example.com/auth/v1/verify?token=abc&redirect_to=https://app.scontrinozero.it/callback",
          },
        },
        error: null,
      });

      const { resetPassword } = await import("./auth-actions");
      const { logger } = await import("@/lib/logger");

      try {
        await resetPassword(
          formData({ email: "test@example.com", captchaToken: "valid-token" }),
        );
        expect.fail("Expected redirect");
      } catch (err) {
        expect(isRedirectError(err)).toBe(true);
        if (isRedirectError(err)) {
          expect(err.url).toBe("/verify-email");
        }
      }

      await Promise.resolve();
      expect(mockSendEmail).not.toHaveBeenCalled();
      // A differenza del fallimento generateLink (input utente → warn), il
      // mismatch di hostname segnala una vera misconfigurazione/anomalia di
      // sicurezza (cfr. SCONTRINOZERO-D) e DEVE restare a livello error →
      // Sentry. Protegge la distinzione voluta tra i due branch.
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ actionLinkHostname: "evil.example.com" }),
        "Reset password: action_link hostname mismatch or invalid URL — email not sent",
      );
    });

    it("does not send email when redirect_to host is not the app host", async () => {
      mockGenerateLink.mockResolvedValue({
        data: {
          properties: {
            action_link:
              "https://test.supabase.co/auth/v1/verify?token=abc&redirect_to=https://evil.example.com/callback",
          },
        },
        error: null,
      });

      const { resetPassword } = await import("./auth-actions");

      try {
        await resetPassword(
          formData({ email: "test@example.com", captchaToken: "valid-token" }),
        );
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

    it("does not send email when redirect_to is missing from action_link", async () => {
      mockGenerateLink.mockResolvedValue({
        data: {
          properties: {
            action_link: "https://test.supabase.co/auth/v1/verify?token=abc",
          },
        },
        error: null,
      });

      const { resetPassword } = await import("./auth-actions");

      try {
        await resetPassword(
          formData({ email: "test@example.com", captchaToken: "valid-token" }),
        );
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

    it("does not send email when NEXT_PUBLIC_SUPABASE_URL is missing", async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      const { resetPassword } = await import("./auth-actions");

      try {
        await resetPassword(
          formData({ email: "test@example.com", captchaToken: "valid-token" }),
        );
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

    it("sends email when action_link is on the Supabase host and redirect_to on the app host", async () => {
      const { resetPassword } = await import("./auth-actions");

      try {
        await resetPassword(
          formData({ email: "test@example.com", captchaToken: "valid-token" }),
        );
      } catch {
        // redirect expected
      }

      await Promise.resolve();
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "test@example.com" }),
      );
    });

    it("APP_HOSTNAME takes precedence over NEXT_PUBLIC_APP_HOSTNAME for redirect_to validation", async () => {
      process.env.APP_HOSTNAME = "sandbox.scontrinozero.it";
      process.env.NEXT_PUBLIC_APP_HOSTNAME = "app.scontrinozero.it";
      mockFetch.mockResolvedValueOnce(
        captchaResponse("reset-password", "sandbox.scontrinozero.it"),
      );
      mockGenerateLink.mockResolvedValueOnce({
        data: {
          properties: {
            action_link:
              "https://test.supabase.co/auth/v1/verify?token=abc&redirect_to=https://sandbox.scontrinozero.it/callback",
          },
        },
        error: null,
      });

      const { resetPassword } = await import("./auth-actions");
      try {
        await resetPassword(
          formData({ email: "test@example.com", captchaToken: "valid-token" }),
        );
      } catch {
        // redirect expected
      }

      // redirectTo is built from APP_HOSTNAME (sandbox), not NEXT_PUBLIC_APP_HOSTNAME
      expect(mockGenerateLink).toHaveBeenCalledWith({
        type: "recovery",
        email: "test@example.com",
        options: {
          redirectTo:
            "https://sandbox.scontrinozero.it/callback?redirect=%2Freset-password%2Fupdate",
        },
      });
      await Promise.resolve();
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "test@example.com" }),
      );

      delete process.env.APP_HOSTNAME;
    });

    it("falls back to hardcoded default hostname for redirect_to validation when both env vars are unset", async () => {
      delete process.env.APP_HOSTNAME;
      delete process.env.NEXT_PUBLIC_APP_HOSTNAME;
      // default mockGenerateLink returns redirect_to on "app.scontrinozero.it"

      const { resetPassword } = await import("./auth-actions");
      try {
        await resetPassword(
          formData({ email: "test@example.com", captchaToken: "valid-token" }),
        );
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
    beforeEach(() => {
      // These tests exercise signIn, which expects action="signin"
      mockFetch.mockResolvedValue(captchaResponse("signin"));
    });

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
          formData({
            email: "test@example.com",
            password: "anypass",
            captchaToken: "valid-token",
          }),
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
          formData({
            email: "test@example.com",
            password: "anypass",
            captchaToken: "valid-token",
          }),
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
          formData({
            email: "test@example.com",
            password: "anypass",
            captchaToken: "valid-token",
          }),
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
