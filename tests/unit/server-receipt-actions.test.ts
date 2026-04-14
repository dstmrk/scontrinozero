// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const {
  mockGetAuthenticatedUser,
  mockCheckBusinessOwnership,
  mockGetPlan,
  mockCanEmit,
  mockRateLimiterCheck,
  mockEmitReceiptForBusiness,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockCheckBusinessOwnership: vi.fn(),
  mockGetPlan: vi.fn(),
  mockCanEmit: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
  mockEmitReceiptForBusiness: vi.fn(),
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

vi.mock("@/lib/services/receipt-service", () => ({
  emitReceiptForBusiness: mockEmitReceiptForBusiness,
}));

// --- Helpers ---

const USER_ID = "user-abc";
const BIZ_ID = "biz-xyz";
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

function makeValidInput(overrides: Record<string, unknown> = {}) {
  return {
    businessId: BIZ_ID,
    lines: [
      {
        id: "line-1",
        description: "Caffè",
        quantity: 1,
        grossUnitPrice: 1.5,
        vatCode: "22",
      },
    ],
    paymentMethod: "PC" as const,
    idempotencyKey: VALID_UUID,
    lotteryCode: null,
    ...overrides,
  };
}

// --- Tests ---

describe("emitReceipt server action", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockGetAuthenticatedUser.mockResolvedValue({ id: USER_ID });
    mockRateLimiterCheck.mockReturnValue({ success: true });
    mockGetPlan.mockResolvedValue({
      plan: "trial",
      trialStartedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      planExpiresAt: null,
    });
    mockCanEmit.mockReturnValue(true); // trial active by default
    mockCheckBusinessOwnership.mockResolvedValue(null); // authorized
    mockEmitReceiptForBusiness.mockResolvedValue({
      documentId: "doc-1",
      adeTransactionId: "tx-1",
      adeProgressive: "001",
    });
  });

  // ── P0-02: plan / trial enforcement ──────────────────────────────────────

  describe("plan enforcement (P0-02)", () => {
    it("allows emission when trial is active", async () => {
      const { emitReceipt } = await import("@/server/receipt-actions");

      const result = await emitReceipt(makeValidInput());

      expect(result.error).toBeUndefined();
      expect(mockEmitReceiptForBusiness).toHaveBeenCalled();
    });

    it("blocks emission when trial is expired", async () => {
      mockCanEmit.mockReturnValue(false);

      const { emitReceipt } = await import("@/server/receipt-actions");
      const result = await emitReceipt(makeValidInput());

      expect(result.error).toMatch(/periodo di prova/i);
      expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
    });

    it("allows emission on starter plan", async () => {
      mockGetPlan.mockResolvedValue({
        plan: "starter",
        trialStartedAt: null,
        planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      mockCanEmit.mockReturnValue(true);

      const { emitReceipt } = await import("@/server/receipt-actions");
      const result = await emitReceipt(makeValidInput());

      expect(result.error).toBeUndefined();
      expect(mockEmitReceiptForBusiness).toHaveBeenCalled();
    });

    it("allows emission on pro plan", async () => {
      mockGetPlan.mockResolvedValue({
        plan: "pro",
        trialStartedAt: null,
        planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      mockCanEmit.mockReturnValue(true);

      const { emitReceipt } = await import("@/server/receipt-actions");
      const result = await emitReceipt(makeValidInput());

      expect(result.error).toBeUndefined();
      expect(mockEmitReceiptForBusiness).toHaveBeenCalled();
    });

    it("fetches plan with the authenticated user id", async () => {
      const { emitReceipt } = await import("@/server/receipt-actions");
      await emitReceipt(makeValidInput());

      expect(mockGetPlan).toHaveBeenCalledWith(USER_ID);
    });
  });

  // ── P1-03: runtime Zod validation ────────────────────────────────────────

  describe("input validation (P1-03)", () => {
    it("accepts a valid input without error", async () => {
      const { emitReceipt } = await import("@/server/receipt-actions");
      const result = await emitReceipt(makeValidInput());

      expect(result.error).toBeUndefined();
    });

    it("rejects grossUnitPrice with more than 2 decimal places", async () => {
      const { emitReceipt } = await import("@/server/receipt-actions");
      const result = await emitReceipt(
        makeValidInput({
          lines: [
            {
              id: "l",
              description: "A",
              quantity: 1,
              grossUnitPrice: 1.123,
              vatCode: "22",
            },
          ],
        }),
      );

      expect(result.error).toBeDefined();
      expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
    });

    it("rejects quantity with more than 3 decimal places", async () => {
      const { emitReceipt } = await import("@/server/receipt-actions");
      const result = await emitReceipt(
        makeValidInput({
          lines: [
            {
              id: "l",
              description: "A",
              quantity: 1.1234,
              grossUnitPrice: 1.0,
              vatCode: "22",
            },
          ],
        }),
      );

      expect(result.error).toBeDefined();
      expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
    });

    it("rejects idempotencyKey that is not a valid UUID", async () => {
      const { emitReceipt } = await import("@/server/receipt-actions");
      const result = await emitReceipt(
        makeValidInput({ idempotencyKey: "not-a-uuid" }),
      );

      expect(result.error).toBeDefined();
      expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
    });

    it("rejects when lines array exceeds 100 items", async () => {
      const tooManyLines = Array.from({ length: 101 }, (_, i) => ({
        id: `l${i}`,
        description: "Item",
        quantity: 1,
        grossUnitPrice: 1.0,
        vatCode: "22" as const,
      }));

      const { emitReceipt } = await import("@/server/receipt-actions");
      const result = await emitReceipt(makeValidInput({ lines: tooManyLines }));

      expect(result.error).toBeDefined();
      expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
    });

    it("rejects invalid vatCode", async () => {
      const { emitReceipt } = await import("@/server/receipt-actions");
      const result = await emitReceipt(
        makeValidInput({
          lines: [
            {
              id: "l",
              description: "A",
              quantity: 1,
              grossUnitPrice: 1.0,
              vatCode: "99",
            },
          ],
        }),
      );

      expect(result.error).toBeDefined();
      expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
    });

    it("rejects empty description", async () => {
      const { emitReceipt } = await import("@/server/receipt-actions");
      const result = await emitReceipt(
        makeValidInput({
          lines: [
            {
              id: "l",
              description: "",
              quantity: 1,
              grossUnitPrice: 1.0,
              vatCode: "22",
            },
          ],
        }),
      );

      expect(result.error).toBeDefined();
      expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
    });
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  describe("rate limiting", () => {
    it("returns error when rate limit is exceeded", async () => {
      mockRateLimiterCheck.mockReturnValue({
        success: false,
        resetAt: Date.now() + 60_000,
      });

      const { emitReceipt } = await import("@/server/receipt-actions");
      const result = await emitReceipt(makeValidInput());

      expect(result.error).toMatch(/troppi/i);
      expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
    });

    it("checks rate limit with per-user key", async () => {
      const { emitReceipt } = await import("@/server/receipt-actions");
      await emitReceipt(makeValidInput());

      expect(mockRateLimiterCheck).toHaveBeenCalledWith(`emit:${USER_ID}`);
    });
  });

  // ── Ownership ─────────────────────────────────────────────────────────────

  describe("ownership check", () => {
    it("returns error when user does not own the business", async () => {
      mockCheckBusinessOwnership.mockResolvedValue({
        error: "Non autorizzato.",
        status: 403,
      });

      const { emitReceipt } = await import("@/server/receipt-actions");
      const result = await emitReceipt(makeValidInput());

      expect(result).toEqual({ error: "Non autorizzato.", status: 403 });
      expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
    });
  });
});
