// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks ---

const {
  mockGetUser,
  mockSignInWithPassword,
  mockUpdateUser,
  mockCheck,
  mockRevalidatePath,
  mockGetClientIp,
  mockHeaders,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockCheck: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockGetClientIp: vi.fn().mockReturnValue("1.2.3.4"),
  mockHeaders: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("next/headers", () => ({ headers: mockHeaders }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: mockGetUser,
      signInWithPassword: mockSignInWithPassword,
      updateUser: mockUpdateUser,
    },
  }),
}));

vi.mock("@/lib/get-client-ip", () => ({ getClientIp: mockGetClientIp }));

const mockDbUpdate = vi.fn();
const mockDbUpdateSet = vi.fn().mockReturnValue({ where: vi.fn() });

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    update: mockDbUpdate,
  }),
}));

vi.mock("@/db/schema", () => ({
  profiles: "profiles-table",
  businesses: "businesses-table",
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));

// checkBusinessOwnership mock: null = ownership confirmed
const mockCheckBusinessOwnership = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: vi.fn().mockImplementation(async () => {
    const result = await mockGetUser();
    if (!result?.data?.user) throw new Error("Not authenticated");
    return result.data.user;
  }),
  checkBusinessOwnership: mockCheckBusinessOwnership,
}));

vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockCheck };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// --- Helpers ---

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

const FAKE_USER = { id: "user-123", email: "test@example.com" };
const FAKE_HEADERS = {} as Parameters<typeof mockHeaders>[0];

// --- Tests ---

describe("profile-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockCheck.mockReturnValue({ success: true });
    mockHeaders.mockResolvedValue(FAKE_HEADERS);
    mockDbUpdate.mockReturnValue({ set: mockDbUpdateSet });
    mockCheckBusinessOwnership.mockResolvedValue(null);
  });

  // ---------------------------------------------------------------------------
  // updateProfile
  // ---------------------------------------------------------------------------

  describe("updateProfile", () => {
    const VALID = { firstName: "Mario", lastName: "Rossi" };

    it("returns empty object on success", async () => {
      const { updateProfile } = await import("./profile-actions");
      const result = await updateProfile(formData(VALID));
      expect(result).toEqual({});
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/settings");
    });

    it("returns error for missing firstName", async () => {
      const { updateProfile } = await import("./profile-actions");
      const result = await updateProfile(formData({ ...VALID, firstName: "" }));
      expect(result.error).toMatch(/nome/i);
    });

    it("returns error for missing lastName", async () => {
      const { updateProfile } = await import("./profile-actions");
      const result = await updateProfile(formData({ ...VALID, lastName: "" }));
      expect(result.error).toMatch(/cognome/i);
    });

    it("returns error when firstName exceeds 80 chars", async () => {
      const { updateProfile } = await import("./profile-actions");
      const result = await updateProfile(
        formData({ ...VALID, firstName: "A".repeat(81) }),
      );
      expect(result.error).toMatch(/80/);
    });

    it("returns error when lastName exceeds 80 chars", async () => {
      const { updateProfile } = await import("./profile-actions");
      const result = await updateProfile(
        formData({ ...VALID, lastName: "A".repeat(81) }),
      );
      expect(result.error).toMatch(/80/);
    });

    it("returns rate limit error when limiter rejects", async () => {
      mockCheck.mockReturnValue({ success: false });
      const { updateProfile } = await import("./profile-actions");
      const result = await updateProfile(formData(VALID));
      expect(result.error).toMatch(/troppi/i);
    });

    it("throws when user is unauthenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { updateProfile } = await import("./profile-actions");
      await expect(updateProfile(formData(VALID))).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // updateBusiness
  // ---------------------------------------------------------------------------

  describe("updateBusiness", () => {
    const VALID = {
      businessId: "biz-uuid",
      address: "Via Roma 1",
      zipCode: "00100",
    };

    it("returns empty object on success", async () => {
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(formData(VALID));
      expect(result).toEqual({});
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/settings");
    });

    it("returns error for missing businessId", async () => {
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(
        formData({ ...VALID, businessId: "" }),
      );
      expect(result.error).toMatch(/business id/i);
    });

    it("returns error for missing address", async () => {
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(formData({ ...VALID, address: "" }));
      expect(result.error).toMatch(/indirizzo/i);
    });

    it("returns error for invalid zipCode (non-5-digit)", async () => {
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(
        formData({ ...VALID, zipCode: "123" }),
      );
      expect(result.error).toMatch(/CAP/i);
    });

    it("returns error for non-numeric zipCode", async () => {
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(
        formData({ ...VALID, zipCode: "AB123" }),
      );
      expect(result.error).toMatch(/CAP/i);
    });

    it("returns error when businessName exceeds 120 chars", async () => {
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(
        formData({ ...VALID, businessName: "A".repeat(121) }),
      );
      expect(result.error).toMatch(/120/);
    });

    it("returns error when province exceeds 3 chars", async () => {
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(
        formData({ ...VALID, province: "XXXX" }),
      );
      expect(result.error).toMatch(/provincia/i);
    });

    it("returns ownership error when checkBusinessOwnership fails", async () => {
      mockCheckBusinessOwnership.mockResolvedValue({
        error: "Business non trovato o non autorizzato.",
      });
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(formData(VALID));
      expect(result.error).toMatch(/non autorizzato/i);
    });

    it("returns rate limit error when limiter rejects", async () => {
      mockCheck.mockReturnValue({ success: false });
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(formData(VALID));
      expect(result.error).toMatch(/troppi/i);
    });
  });

  // ---------------------------------------------------------------------------
  // changePassword
  // ---------------------------------------------------------------------------

  describe("changePassword", () => {
    const VALID = {
      currentPassword: "OldPass1!",
      newPassword: "NewPass1!",
      confirmPassword: "NewPass1!",
    };

    beforeEach(() => {
      mockSignInWithPassword.mockResolvedValue({ error: null });
      mockUpdateUser.mockResolvedValue({ error: null });
    });

    it("returns empty object on success", async () => {
      const { changePassword } = await import("./profile-actions");
      const result = await changePassword(formData(VALID));
      expect(result).toEqual({});
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: FAKE_USER.email,
        password: VALID.currentPassword,
      });
      expect(mockUpdateUser).toHaveBeenCalledWith({
        password: VALID.newPassword,
      });
    });

    it("returns error for missing currentPassword", async () => {
      const { changePassword } = await import("./profile-actions");
      const result = await changePassword(
        formData({ ...VALID, currentPassword: "" }),
      );
      expect(result.error).toMatch(/password attuale/i);
    });

    it("returns error for weak new password (no uppercase)", async () => {
      const { changePassword } = await import("./profile-actions");
      const result = await changePassword(
        formData({
          ...VALID,
          newPassword: "weakpass1!",
          confirmPassword: "weakpass1!",
        }),
      );
      expect(result.error).toMatch(/sicura/i);
    });

    it("returns error when confirmPassword does not match", async () => {
      const { changePassword } = await import("./profile-actions");
      const result = await changePassword(
        formData({ ...VALID, confirmPassword: "Different1!" }),
      );
      expect(result.error).toMatch(/coincidono/i);
    });

    it("returns error when current password is wrong", async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: { message: "Invalid login credentials" },
      });
      const { changePassword } = await import("./profile-actions");
      const result = await changePassword(formData(VALID));
      expect(result.error).toMatch(/password attuale non corretta/i);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("returns error when updateUser fails", async () => {
      mockUpdateUser.mockResolvedValue({
        error: { message: "update failed" },
      });
      const { changePassword } = await import("./profile-actions");
      const result = await changePassword(formData(VALID));
      expect(result.error).toMatch(/aggiornamento/i);
    });

    it("returns rate limit error when limiter rejects", async () => {
      mockCheck.mockReturnValue({ success: false });
      const { changePassword } = await import("./profile-actions");
      const result = await changePassword(formData(VALID));
      expect(result.error).toMatch(/troppi/i);
    });

    it("throws when user is unauthenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { changePassword } = await import("./profile-actions");
      await expect(changePassword(formData(VALID))).rejects.toThrow();
    });
  });
});
