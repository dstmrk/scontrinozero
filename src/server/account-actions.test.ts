// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetAuthenticatedUser = vi.fn();
vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
}));

const mockDeleteWhere = vi.fn();
const mockDeleteReturning = vi.fn();
vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: mockDeleteReturning,
      }),
    }),
  }),
}));

vi.mock("@/db/schema", () => ({
  profiles: "profiles-table",
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
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: { signOut: mockSignOut },
  }),
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
  });

  describe("deleteAccount", () => {
    it("happy path: deletes profile, removes auth user, signs out, and redirects to /", async () => {
      const { deleteAccount } = await import("./account-actions");
      await deleteAccount();

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
      await deleteAccount();

      // Auth must be deleted first so that if it fails the profile is still intact
      expect(callOrder.indexOf("deleteUser")).toBeLessThan(
        callOrder.indexOf("deleteProfile"),
      );
      // signOut comes after auth deletion (best-effort cookie cleanup)
      expect(callOrder.indexOf("deleteProfile")).toBeLessThan(
        callOrder.indexOf("signOut"),
      );
    });

    it("returns error when user is not authenticated", async () => {
      mockGetAuthenticatedUser.mockRejectedValue(
        new Error("Not authenticated"),
      );

      const { deleteAccount } = await import("./account-actions");
      const result = await deleteAccount();

      expect(result.error).toBeDefined();
      expect(mockDeleteReturning).not.toHaveBeenCalled();
      expect(mockAdminDeleteUser).not.toHaveBeenCalled();
    });

    it("logs an error but still redirects when profile is not found after auth deletion", async () => {
      // Auth user was deleted but profile row was not found (already cleaned up or never created).
      // The function should log the anomaly and still redirect — not surface an error to the UI.
      mockDeleteReturning.mockResolvedValue([]);

      const { deleteAccount } = await import("./account-actions");
      await deleteAccount();

      expect(mockAdminDeleteUser).toHaveBeenCalledWith(FAKE_USER.id);
      expect(mockRedirect).toHaveBeenCalledWith("/");
    });

    it("retries deleteUser up to 3 times on failure then returns error (profile untouched)", async () => {
      vi.useFakeTimers();
      mockAdminDeleteUser.mockResolvedValue({
        error: { message: "Service unavailable" },
      });

      const { deleteAccount } = await import("./account-actions");
      const promise = deleteAccount();
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
      const promise = deleteAccount();
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
      const promise = deleteAccount();
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
      await deleteAccount();

      await Promise.resolve();
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: FAKE_USER.email }),
      );
    });

    it("does not block redirect when deletion email fails", async () => {
      mockSendEmail.mockRejectedValueOnce(new Error("Resend down"));

      const { deleteAccount } = await import("./account-actions");
      await deleteAccount();

      expect(mockRedirect).toHaveBeenCalledWith("/");
    });

    it("still sends deletion email when profile row is not found (auth was deleted)", async () => {
      // Profile row missing after auth deletion is an anomaly, but the user's
      // auth entry is gone. We still send the email so the user is informed.
      mockDeleteReturning.mockResolvedValue([]);

      const { deleteAccount } = await import("./account-actions");
      await deleteAccount();

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
      await deleteAccount();

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
