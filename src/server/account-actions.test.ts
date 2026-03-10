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

    it("returns error when profile is not found in DB", async () => {
      mockDeleteReturning.mockResolvedValue([]); // No rows deleted

      const { deleteAccount } = await import("./account-actions");
      const result = await deleteAccount();

      expect(result.error).toBeDefined();
      expect(result.error).toContain("Profilo");
      expect(mockAdminDeleteUser).not.toHaveBeenCalled();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("still redirects when admin auth user deletion fails (profile already deleted)", async () => {
      mockAdminDeleteUser.mockResolvedValue({
        error: { message: "User not found" },
      });

      const { deleteAccount } = await import("./account-actions");
      await deleteAccount();

      // Profile was deleted — redirect must still happen
      expect(mockDeleteReturning).toHaveBeenCalled();
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockRedirect).toHaveBeenCalledWith("/");
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

    it("does not send email when profile is not found", async () => {
      mockDeleteReturning.mockResolvedValue([]);

      const { deleteAccount } = await import("./account-actions");
      await deleteAccount();

      await Promise.resolve();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });
});
