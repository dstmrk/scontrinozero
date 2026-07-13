// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthenticatedError } from "@/lib/auth-errors";
import { logger } from "@/lib/logger";
import { ERROR_MESSAGES } from "@/lib/error-messages";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetAuthenticatedUser = vi.fn();
vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
}));

const mockDeleteReturning = vi.fn();
const mockSelectLimit = vi.fn();
// `.where()` della delete serve due pattern (profiles con `.returning()`,
// subscriptions con `await`): un Promise con `.returning` attaccato li copre.
const mockDbDelete = vi.fn(() => ({
  where: () => {
    const chain = Promise.resolve(undefined) as Promise<unknown> & {
      returning: typeof mockDeleteReturning;
    };
    chain.returning = mockDeleteReturning;
    return chain;
  },
}));
vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: mockSelectLimit }),
      }),
    }),
    delete: mockDbDelete,
  }),
}));

vi.mock("@/db/schema", () => ({
  profiles: "profiles-table",
  subscriptions: { userId: "user_id", stripeCustomerId: "stripe_customer_id" },
}));

const mockCustomersDel = vi.fn();
vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn().mockReturnValue({
    customers: { del: mockCustomersDel },
  }),
}));

const mockAdminDeleteUser = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn().mockReturnValue({
    auth: {
      admin: { deleteUser: mockAdminDeleteUser },
    },
  }),
}));

const mockSignOut = vi.fn();
const mockSignInWithPassword = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: {
      signOut: mockSignOut,
      signInWithPassword: mockSignInWithPassword,
    },
  }),
}));

const mockCheck = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockCheck };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000 },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/get-client-ip", () => ({
  getClientIp: vi.fn().mockReturnValue("1.2.3.4"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockSendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({
  sendEmail: mockSendEmail,
}));

vi.mock("@/emails/account-deletion", () => ({
  AccountDeletionEmail: vi.fn().mockReturnValue(null),
}));

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_USER = { id: "user-123", email: "utente@test.it" };
const CORRECT_PASSWORD = "SuperSecret123!";

/** FormData con la password corrente, come la invia il dialog di conferma. */
function formWithPassword(password: string = CORRECT_PASSWORD): FormData {
  const fd = new FormData();
  fd.set("currentPassword", password);
  return fd;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("account-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue(FAKE_USER);
    mockDeleteReturning.mockResolvedValue([{ id: "profile-456" }]);
    mockAdminDeleteUser.mockResolvedValue({ error: null });
    mockSignOut.mockResolvedValue({});
    mockSignInWithPassword.mockResolvedValue({ error: null });
    mockCheck.mockReturnValue({ success: true });
    // Default: nessuna subscription → il ramo Stripe è skippato (flusso invariato
    // per i test preesistenti).
    mockSelectLimit.mockResolvedValue([]);
    mockCustomersDel.mockResolvedValue({ id: "cus_x", deleted: true });
  });

  describe("deleteAccount", () => {
    it("happy path: verifies password, deletes profile, removes auth user, signs out, and redirects to /", async () => {
      const { deleteAccount } = await import("./account-actions");
      await deleteAccount(formWithPassword());

      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: FAKE_USER.email,
        password: CORRECT_PASSWORD,
      });
      expect(mockDeleteReturning).toHaveBeenCalled();
      expect(mockAdminDeleteUser).toHaveBeenCalledWith(FAKE_USER.id);
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockRedirect).toHaveBeenCalledWith("/");
    });

    it("deletes auth user BEFORE deleting the profile (auth-first prevents orphan auth entries)", async () => {
      const callOrder: string[] = [];
      mockSignOut.mockImplementation(async () => {
        callOrder.push("signOut");
      });
      mockAdminDeleteUser.mockImplementation(async () => {
        callOrder.push("deleteUser");
        return { error: null };
      });
      mockDeleteReturning.mockImplementation(async () => {
        callOrder.push("deleteProfile");
        return [{ id: "profile-456" }];
      });

      const { deleteAccount } = await import("./account-actions");
      await deleteAccount(formWithPassword());

      // Auth must be deleted first so that if it fails the profile is still intact
      expect(callOrder.indexOf("deleteUser")).toBeLessThan(
        callOrder.indexOf("deleteProfile"),
      );
      // signOut comes after auth deletion (best-effort cookie cleanup)
      expect(callOrder.indexOf("deleteProfile")).toBeLessThan(
        callOrder.indexOf("signOut"),
      );
    });

    it("returns 'Non autenticato.' without logging when session is missing", async () => {
      mockGetAuthenticatedUser.mockRejectedValue(new UnauthenticatedError());

      const { deleteAccount } = await import("./account-actions");
      const result = await deleteAccount(formWithPassword());

      expect(result.error).toBe("Non autenticato.");
      expect(mockDeleteReturning).not.toHaveBeenCalled();
      expect(mockAdminDeleteUser).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("degrades with a 503-like message and logs when auth fails unexpectedly", async () => {
      mockGetAuthenticatedUser.mockRejectedValue(new Error("db timeout"));

      const { deleteAccount } = await import("./account-actions");
      const result = await deleteAccount(formWithPassword());

      expect(result.error).toBe(
        "Servizio temporaneamente non disponibile. Riprova.",
      );
      expect(mockDeleteReturning).not.toHaveBeenCalled();
      expect(mockAdminDeleteUser).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    // ---- Re-authentication gate (REVIEW.md #62) -------------------------

    it("returns an error and never purges when the password field is missing", async () => {
      const { deleteAccount } = await import("./account-actions");
      const result = await deleteAccount(new FormData());

      expect(result.error).toBe("Inserisci la tua password.");
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
      expect(mockAdminDeleteUser).not.toHaveBeenCalled();
      expect(mockDeleteReturning).not.toHaveBeenCalled();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("rejects a wrong password (warn, no purge) before touching any data", async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: { message: "Invalid login credentials" },
      });

      const { deleteAccount } = await import("./account-actions");
      const result = await deleteAccount(formWithPassword("wrong-password"));

      expect(result.error).toBe("Password non corretta.");
      expect(mockAdminDeleteUser).not.toHaveBeenCalled();
      expect(mockDeleteReturning).not.toHaveBeenCalled();
      expect(mockRedirect).not.toHaveBeenCalled();
      // Predictable user-input error → warn, not Sentry-bound error (regola 20)
      expect(logger.warn).toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("passes the raw password (no trim) to signInWithPassword", async () => {
      const { deleteAccount } = await import("./account-actions");
      await deleteAccount(formWithPassword("  spaced pw  "));

      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: FAKE_USER.email,
        password: "  spaced pw  ",
      });
    });

    it("rate-limits repeated attempts (no signIn, no purge) and warns", async () => {
      mockCheck.mockReturnValue({ success: false });

      const { deleteAccount } = await import("./account-actions");
      const result = await deleteAccount(formWithPassword());

      expect(result.error).toBe(ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES);
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
      expect(mockAdminDeleteUser).not.toHaveBeenCalled();
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });

    it("returns an error when the user has no email (cannot re-authenticate)", async () => {
      mockGetAuthenticatedUser.mockResolvedValue({ id: "user-123" });

      const { deleteAccount } = await import("./account-actions");
      const result = await deleteAccount(formWithPassword());

      expect(result.error).toBe("Email utente non disponibile.");
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
      expect(mockAdminDeleteUser).not.toHaveBeenCalled();
    });

    // ---- Stripe subscription cancellation (REVIEW.md #63) ---------------

    it("cancels the Stripe customer BEFORE purging when an active subscription exists", async () => {
      mockSelectLimit.mockResolvedValue([{ stripeCustomerId: "cus_123" }]);
      const callOrder: string[] = [];
      mockCustomersDel.mockImplementation(async () => {
        callOrder.push("stripeDel");
        return { id: "cus_123", deleted: true };
      });
      mockAdminDeleteUser.mockImplementation(async () => {
        callOrder.push("purge");
        return { error: null };
      });

      const { deleteAccount } = await import("./account-actions");
      await deleteAccount(formWithPassword());

      expect(mockCustomersDel).toHaveBeenCalledWith("cus_123");
      // La delete Stripe precede il purge: fail-safe contro addebiti fantasma.
      expect(callOrder.indexOf("stripeDel")).toBeLessThan(
        callOrder.indexOf("purge"),
      );
      expect(mockRedirect).toHaveBeenCalledWith("/");
    });

    it("aborts the purge and returns a dedicated error when Stripe is unreachable", async () => {
      mockSelectLimit.mockResolvedValue([{ stripeCustomerId: "cus_123" }]);
      mockCustomersDel.mockRejectedValue(new Error("Stripe timeout"));

      const { deleteAccount } = await import("./account-actions");
      const result = await deleteAccount(formWithPassword());

      expect(result.error).toBe(
        "Non è stato possibile annullare l'abbonamento. Riprova o gestiscilo dal portale prima di eliminare l'account.",
      );
      // Nessun purge: né auth né profilo toccati.
      expect(mockAdminDeleteUser).not.toHaveBeenCalled();
      expect(mockDeleteReturning).not.toHaveBeenCalled();
      expect(mockRedirect).not.toHaveBeenCalled();
      // Fallimento SDK esterno inatteso → error (regola 10).
      expect(logger.error).toHaveBeenCalled();
    });

    it("treats an already-deleted Stripe customer (404) as idempotent and proceeds with the purge", async () => {
      mockSelectLimit.mockResolvedValue([{ stripeCustomerId: "cus_123" }]);
      mockCustomersDel.mockRejectedValue({
        statusCode: 404,
        code: "resource_missing",
      });

      const { deleteAccount } = await import("./account-actions");
      await deleteAccount(formWithPassword());

      // Obiettivo raggiunto (customer già assente) → purge prosegue fino al
      // redirect finale, nessun errore dedicato all'utente.
      expect(mockAdminDeleteUser).toHaveBeenCalledWith(FAKE_USER.id);
      expect(mockRedirect).toHaveBeenCalledWith("/");
      // Condizione attesa → warn, non Sentry-bound error (regola 20).
      expect(logger.warn).toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("skips Stripe entirely when there is no subscription row", async () => {
      mockSelectLimit.mockResolvedValue([]);

      const { deleteAccount } = await import("./account-actions");
      await deleteAccount(formWithPassword());

      expect(mockCustomersDel).not.toHaveBeenCalled();
      expect(mockAdminDeleteUser).toHaveBeenCalledWith(FAKE_USER.id);
      expect(mockRedirect).toHaveBeenCalledWith("/");
    });

    it("skips Stripe when the subscription row has no stripeCustomerId", async () => {
      mockSelectLimit.mockResolvedValue([{ stripeCustomerId: null }]);

      const { deleteAccount } = await import("./account-actions");
      await deleteAccount(formWithPassword());

      expect(mockCustomersDel).not.toHaveBeenCalled();
      expect(mockAdminDeleteUser).toHaveBeenCalledWith(FAKE_USER.id);
      expect(mockRedirect).toHaveBeenCalledWith("/");
    });

    // ---- Purge behaviour (unchanged) ------------------------------------

    it("logs an error but still redirects when profile is not found after auth deletion", async () => {
      // Auth user was deleted but profile row was not found (already cleaned up or never created).
      // The function should log the anomaly and still redirect — not surface an error to the UI.
      mockDeleteReturning.mockResolvedValue([]);

      const { deleteAccount } = await import("./account-actions");
      await deleteAccount(formWithPassword());

      expect(mockAdminDeleteUser).toHaveBeenCalledWith(FAKE_USER.id);
      expect(mockRedirect).toHaveBeenCalledWith("/");
    });

    it("retries deleteUser up to 3 times on failure then returns error (profile untouched)", async () => {
      vi.useFakeTimers();
      mockAdminDeleteUser.mockResolvedValue({
        error: { message: "Service unavailable" },
      });

      const { deleteAccount } = await import("./account-actions");
      const promise = deleteAccount(formWithPassword());
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mockAdminDeleteUser).toHaveBeenCalledTimes(3);
      // Profile must NOT be deleted — user can still log in and retry
      expect(mockDeleteReturning).not.toHaveBeenCalled();
      expect(result.error).toBeDefined();
      expect(mockRedirect).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("stops retrying deleteUser as soon as it succeeds", async () => {
      vi.useFakeTimers();
      mockAdminDeleteUser
        .mockResolvedValueOnce({ error: { message: "transient" } })
        .mockResolvedValueOnce({ error: null });

      const { deleteAccount } = await import("./account-actions");
      const promise = deleteAccount(formWithPassword());
      await vi.runAllTimersAsync();
      await promise;

      expect(mockAdminDeleteUser).toHaveBeenCalledTimes(2);
      expect(mockRedirect).toHaveBeenCalledWith("/");
      vi.useRealTimers();
    });

    it("returns error when admin auth user deletion fails exhausting all retries", async () => {
      vi.useFakeTimers();
      mockAdminDeleteUser.mockResolvedValue({
        error: { message: "User not found" },
      });

      const { deleteAccount } = await import("./account-actions");
      const promise = deleteAccount(formWithPassword());
      await vi.runAllTimersAsync();
      const result = await promise;

      // Auth deletion failed — profile must be untouched and redirect must NOT happen
      expect(mockDeleteReturning).not.toHaveBeenCalled();
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result.error).toBeDefined();
      vi.useRealTimers();
    });

    it("sends AccountDeletionEmail after successful deletion", async () => {
      const { deleteAccount } = await import("./account-actions");
      await deleteAccount(formWithPassword());

      await Promise.resolve();
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: FAKE_USER.email }),
      );
    });

    it("does not block redirect when deletion email fails", async () => {
      mockSendEmail.mockRejectedValueOnce(new Error("Resend down"));

      const { deleteAccount } = await import("./account-actions");
      await deleteAccount(formWithPassword());

      expect(mockRedirect).toHaveBeenCalledWith("/");
    });

    it("still sends deletion email when profile row is not found (auth was deleted)", async () => {
      // Profile row missing after auth deletion is an anomaly, but the user's
      // auth entry is gone. We still send the email so the user is informed.
      mockDeleteReturning.mockResolvedValue([]);

      const { deleteAccount } = await import("./account-actions");
      await deleteAccount(formWithPassword());

      await Promise.resolve();
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: FAKE_USER.email }),
      );
    });

    it("logs critical error and still redirects when profile DB delete throws (auth already deleted)", async () => {
      // Regression guard: after auth-first deletion, a transient DB error on the
      // profile delete must NOT surface as an unhandled exception. The function
      // must catch it, log critical (for manual cleanup), and redirect — because
      // the user's auth entry is already gone and returning { error } would leave
      // them stranded with no way to retry via the UI.
      mockDeleteReturning.mockRejectedValue(new Error("DB connection lost"));

      const { deleteAccount } = await import("./account-actions");
      // Must not throw
      await deleteAccount(formWithPassword());

      // Auth was already deleted, so redirect still happens
      expect(mockRedirect).toHaveBeenCalledWith("/");
      // Critical error must be logged for ops to clean up the orphaned profile
      const { logger } = await import("@/lib/logger");
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ critical: true, userId: FAKE_USER.id }),
        expect.stringContaining("manual cleanup"),
      );
    });
  });
});
