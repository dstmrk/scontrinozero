// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const {
  mockGetAuthenticatedUser,
  mockNextHeaders,
  mockGetClientIp,
  mockCheck,
  mockSignInWithPassword,
  mockUpdateUser,
  mockSignOut,
  mockCreateServerSupabaseClient,
  mockIsStrongPassword,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockNextHeaders: vi.fn(),
  mockGetClientIp: vi.fn(),
  mockCheck: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockSignOut: vi.fn(),
  mockCreateServerSupabaseClient: vi.fn(),
  mockIsStrongPassword: vi.fn(),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
  checkBusinessOwnership: vi.fn().mockResolvedValue(null),
}));

vi.mock("next/headers", () => ({
  headers: mockNextHeaders,
}));

vi.mock("@/lib/get-client-ip", () => ({
  getClientIp: mockGetClientIp,
}));

// RateLimiter is a class — must use function keyword (not arrow) per CLAUDE.md
vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockCheck };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}));

vi.mock("@/lib/validation", () => ({
  isStrongPassword: mockIsStrongPassword,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  profiles: "profiles-table",
  businesses: "businesses-table",
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { changePassword } from "@/server/profile-actions";
import { logger } from "@/lib/logger";

// --- Helpers ---

const USER_ID = "user-abc";
const USER_EMAIL = "test@example.com";
const FAKE_IP = "192.168.1.1";

function makeFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.append("currentPassword", overrides.currentPassword ?? "OldPass@123");
  fd.append("newPassword", overrides.newPassword ?? "NewPass@456");
  fd.append("confirmPassword", overrides.confirmPassword ?? "NewPass@456");
  return fd;
}

// --- Tests ---

describe("changePassword server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetAuthenticatedUser.mockResolvedValue({
      id: USER_ID,
      email: USER_EMAIL,
    });
    mockNextHeaders.mockResolvedValue({ get: vi.fn().mockReturnValue(null) });
    mockGetClientIp.mockReturnValue(FAKE_IP);
    mockCheck.mockReturnValue({ success: true }); // not rate-limited by default
    mockIsStrongPassword.mockReturnValue(true); // valid password by default
    mockSignInWithPassword.mockResolvedValue({ error: null });
    mockUpdateUser.mockResolvedValue({ error: null });
    mockSignOut.mockResolvedValue({ error: null });
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        signInWithPassword: mockSignInWithPassword,
        updateUser: mockUpdateUser,
        signOut: mockSignOut,
      },
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ── P1-03: rate limit key must be per user.id, not per IP ──────────────────

  describe("rate limit key isolation (P1-03)", () => {
    it("uses user.id as the rate limit key (not IP)", async () => {
      await changePassword(makeFormData());

      // Key must contain user.id
      expect(mockCheck).toHaveBeenCalledWith(`changePassword:${USER_ID}`);
      // Key must NOT be the IP-based key
      expect(mockCheck).not.toHaveBeenCalledWith(`changePassword:${FAKE_IP}`);
    });

    it("two users with the same IP are rate-limited independently", async () => {
      const USER_A = "user-aaa";
      const USER_B = "user-bbb";

      // User A is rate-limited; User B is not
      mockCheck.mockImplementation(function (key: string) {
        return { success: !key.includes(USER_A) };
      });

      // User A → rate-limited
      mockGetAuthenticatedUser.mockResolvedValue({
        id: USER_A,
        email: "a@example.com",
      });
      const responseA = await changePassword(makeFormData());
      expect(responseA.error).toBeDefined();

      // User B (same IP) → NOT rate-limited
      mockGetAuthenticatedUser.mockResolvedValue({
        id: USER_B,
        email: "b@example.com",
      });
      const responseB = await changePassword(makeFormData());
      expect(responseB.error).toBeUndefined();
    });

    it("logs both userId and ip when rate limit is exceeded", async () => {
      mockCheck.mockReturnValue({ success: false });

      await changePassword(makeFormData());

      expect(logger.warn as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, ip: FAKE_IP }),
        expect.stringContaining("rate limit"),
      );
    });
  });

  // ── Success and error paths ────────────────────────────────────────────────

  describe("success and error paths", () => {
    it("returns empty object on successful password change", async () => {
      const result = await changePassword(makeFormData());

      expect(result.error).toBeUndefined();
      expect(mockUpdateUser).toHaveBeenCalledWith({
        password: "NewPass@456",
      });
    });

    it("returns error when current password is incorrect", async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: new Error("Invalid credentials"),
      });

      const result = await changePassword(makeFormData());

      expect(result.error).toBe("Password attuale non corretta.");
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("returns error when new password is weak", async () => {
      mockIsStrongPassword.mockReturnValue(false);

      const result = await changePassword(
        makeFormData({ newPassword: "weak" }),
      );

      expect(result.error).toContain("password");
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });

    it("returns error when currentPassword is empty", async () => {
      const result = await changePassword(
        makeFormData({ currentPassword: "" }),
      );

      expect(result.error).toBe("Inserisci la password attuale.");
    });

    it("returns error when new and confirm passwords do not match", async () => {
      mockIsStrongPassword.mockReturnValue(true);
      const result = await changePassword(
        makeFormData({ confirmPassword: "DifferentPass@999" }),
      );

      expect(result.error).toBe("Le password non coincidono.");
    });

    it("returns rate-limit error and does not call signIn", async () => {
      mockCheck.mockReturnValue({ success: false });

      const result = await changePassword(makeFormData());

      expect(result.error).toContain("Troppi tentativi");
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });
  });
});
