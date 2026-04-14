// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const {
  mockGetAuthenticatedUser,
  mockCheckBusinessOwnership,
  mockGetPlan,
  mockCanEmit,
  mockRateLimiterCheck,
  mockVoidReceiptForBusiness,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockCheckBusinessOwnership: vi.fn(),
  mockGetPlan: vi.fn(),
  mockCanEmit: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
  mockVoidReceiptForBusiness: vi.fn(),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
  checkBusinessOwnership: mockCheckBusinessOwnership,
}));

vi.mock("@/lib/plans", () => ({
  getPlan: mockGetPlan,
  canEmit: mockCanEmit,
}));

vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/services/void-service", () => ({
  voidReceiptForBusiness: mockVoidReceiptForBusiness,
}));

// --- Helpers ---

const USER_ID = "user-void";
const BIZ_ID = "biz-void";
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

function makeValidInput(overrides: Record<string, unknown> = {}) {
  return {
    businessId: BIZ_ID,
    documentId: VALID_UUID,
    idempotencyKey: "660e8400-e29b-41d4-a716-446655440001",
    ...overrides,
  };
}

// --- Tests ---

describe("voidReceipt server action", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockGetAuthenticatedUser.mockResolvedValue({ id: USER_ID });
    mockRateLimiterCheck.mockReturnValue({ success: true });
    mockGetPlan.mockResolvedValue({
      plan: "trial",
      trialStartedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      planExpiresAt: null,
    });
    mockCanEmit.mockReturnValue(true);
    mockCheckBusinessOwnership.mockResolvedValue(null);
    mockVoidReceiptForBusiness.mockResolvedValue({
      voidDocumentId: "void-doc-1",
      adeTransactionId: "tx-void",
      adeProgressive: "002",
    });
  });

  // ── P0-02: plan / trial enforcement ──────────────────────────────────────

  describe("plan enforcement (P0-02)", () => {
    it("allows void when trial is active", async () => {
      const { voidReceipt } = await import("@/server/void-actions");

      const result = await voidReceipt(makeValidInput());

      expect(result.error).toBeUndefined();
      expect(mockVoidReceiptForBusiness).toHaveBeenCalled();
    });

    it("blocks void when trial is expired", async () => {
      mockCanEmit.mockReturnValue(false);

      const { voidReceipt } = await import("@/server/void-actions");
      const result = await voidReceipt(makeValidInput());

      expect(result.error).toMatch(/periodo di prova/i);
      expect(mockVoidReceiptForBusiness).not.toHaveBeenCalled();
    });

    it("allows void on pro plan", async () => {
      mockGetPlan.mockResolvedValue({
        plan: "pro",
        trialStartedAt: null,
        planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      mockCanEmit.mockReturnValue(true);

      const { voidReceipt } = await import("@/server/void-actions");
      const result = await voidReceipt(makeValidInput());

      expect(result.error).toBeUndefined();
      expect(mockVoidReceiptForBusiness).toHaveBeenCalled();
    });

    it("fetches plan with the authenticated user id", async () => {
      const { voidReceipt } = await import("@/server/void-actions");
      await voidReceipt(makeValidInput());

      expect(mockGetPlan).toHaveBeenCalledWith(USER_ID);
    });
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  describe("rate limiting", () => {
    it("returns error when rate limit is exceeded", async () => {
      mockRateLimiterCheck.mockReturnValue({
        success: false,
        resetAt: Date.now() + 60_000,
      });

      const { voidReceipt } = await import("@/server/void-actions");
      const result = await voidReceipt(makeValidInput());

      expect(result.error).toMatch(/troppi/i);
      expect(mockVoidReceiptForBusiness).not.toHaveBeenCalled();
    });

    it("checks rate limit with per-user void key", async () => {
      const { voidReceipt } = await import("@/server/void-actions");
      await voidReceipt(makeValidInput());

      expect(mockRateLimiterCheck).toHaveBeenCalledWith(`void:${USER_ID}`);
    });
  });

  // ── Ownership ─────────────────────────────────────────────────────────────

  describe("ownership check", () => {
    it("returns error when user does not own the business", async () => {
      mockCheckBusinessOwnership.mockResolvedValue({
        error: "Non autorizzato.",
        status: 403,
      });

      const { voidReceipt } = await import("@/server/void-actions");
      const result = await voidReceipt(makeValidInput());

      expect(result).toEqual({ error: "Non autorizzato.", status: 403 });
      expect(mockVoidReceiptForBusiness).not.toHaveBeenCalled();
    });
  });
});
