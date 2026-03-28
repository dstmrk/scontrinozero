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
const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({ select: mockSelect }),
}));

vi.mock("@/db/schema", () => ({
  adeCredentials: "ade-credentials-table",
  businesses: "businesses-table",
  profiles: "profiles-table",
}));

const mockDecrypt = vi.fn().mockReturnValue("decrypted-value");
vi.mock("@/lib/crypto", () => ({
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
  getEncryptionKey: () => Buffer.alloc(32),
}));

const mockBuildCedenteFromBusiness = vi
  .fn()
  .mockReturnValue({ built: "cedente" });
vi.mock("@/lib/ade/mapper", () => ({
  buildCedenteFromBusiness: (...args: unknown[]) =>
    mockBuildCedenteFromBusiness(...args),
}));

// --- Helpers ---

const FAKE_USER = { id: "user-123", email: "test@example.com" };
const FAKE_BUSINESS = { id: "biz-789", profileId: "profile-456" };
const FAKE_CRED = {
  businessId: "biz-789",
  encryptedCodiceFiscale: "enc-cf",
  encryptedPassword: "enc-pw",
  encryptedPin: "enc-pin",
  keyVersion: 1,
  verifiedAt: new Date(),
};

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
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);

      const { checkBusinessOwnership } = await import("./server-auth");
      const result = await checkBusinessOwnership("user-123", "biz-789");

      expect(result).toBeNull();
    });

    it("returns error when business is not found or not authorized", async () => {
      mockLimit.mockResolvedValueOnce([]);

      const { checkBusinessOwnership } = await import("./server-auth");
      const result = await checkBusinessOwnership("user-123", "other-biz");

      expect(result).toEqual({
        error: "Business non trovato o non autorizzato.",
      });
    });
  });

  describe("fetchAdePrerequisites", () => {
    it("returns decrypted credentials and cedentePrestatore on success", async () => {
      mockLimit.mockResolvedValueOnce([
        { cred: FAKE_CRED, business: FAKE_BUSINESS },
      ]);

      const { fetchAdePrerequisites } = await import("./server-auth");
      const result = await fetchAdePrerequisites("biz-789");

      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.codiceFiscale).toBe("decrypted-value");
      expect(result.password).toBe("decrypted-value");
      expect(result.pin).toBe("decrypted-value");
      expect(result.cedentePrestatore).toEqual({ built: "cedente" });
      expect(mockBuildCedenteFromBusiness).toHaveBeenCalledWith(FAKE_BUSINESS);
    });

    it("returns error when credentials are not found", async () => {
      mockLimit.mockResolvedValueOnce([]);

      const { fetchAdePrerequisites } = await import("./server-auth");
      const result = await fetchAdePrerequisites("biz-789");

      expect(result).toEqual({
        error: "Credenziali AdE non trovate. Completa la configurazione.",
      });
      expect(mockBuildCedenteFromBusiness).not.toHaveBeenCalled();
    });

    it("returns error when credentials are not verified", async () => {
      mockLimit.mockResolvedValueOnce([
        { cred: { ...FAKE_CRED, verifiedAt: null }, business: FAKE_BUSINESS },
      ]);

      const { fetchAdePrerequisites } = await import("./server-auth");
      const result = await fetchAdePrerequisites("biz-789");

      expect(result).toEqual({
        error:
          "Credenziali AdE non verificate. Verifica le credenziali nelle impostazioni.",
      });
      expect(mockBuildCedenteFromBusiness).not.toHaveBeenCalled();
    });
  });
});
