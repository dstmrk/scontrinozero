// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

const mockLimit = vi.fn();
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({ select: mockSelect }),
}));

vi.mock("@/db/schema", () => ({
  profiles: "profiles-table",
  businesses: "businesses-table",
}));

// --- Helpers ---

const FAKE_USER = { id: "user-123", email: "test@example.com" };
const FAKE_PROFILE = { id: "profile-456", authUserId: "user-123" };
const FAKE_BUSINESS = { id: "biz-789", profileId: "profile-456" };

// --- Tests ---

describe("server-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAuthenticatedUser", () => {
    it("returns the authenticated user", async () => {
      mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } });

      const { getAuthenticatedUser } = await import("./server-auth");
      const user = await getAuthenticatedUser();

      expect(user).toEqual(FAKE_USER);
    });

    it("throws when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const { getAuthenticatedUser } = await import("./server-auth");

      await expect(getAuthenticatedUser()).rejects.toThrow("Not authenticated");
    });
  });

  describe("checkBusinessOwnership", () => {
    it("returns null when business belongs to the user", async () => {
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      mockLimit.mockResolvedValueOnce([FAKE_BUSINESS]);

      const { checkBusinessOwnership } = await import("./server-auth");
      const result = await checkBusinessOwnership("user-123", "biz-789");

      expect(result).toBeNull();
    });

    it("returns error when profile is not found", async () => {
      mockLimit.mockResolvedValueOnce([]); // No profile

      const { checkBusinessOwnership } = await import("./server-auth");
      const result = await checkBusinessOwnership("user-123", "biz-789");

      expect(result).toEqual({ error: "Profilo non trovato." });
    });

    it("returns error when business does not belong to the user", async () => {
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      mockLimit.mockResolvedValueOnce([]); // Business not found for this profile

      const { checkBusinessOwnership } = await import("./server-auth");
      const result = await checkBusinessOwnership("user-123", "other-biz");

      expect(result).toEqual({
        error: "Business non trovato o non autorizzato.",
      });
    });
  });
});
