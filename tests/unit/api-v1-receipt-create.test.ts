// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const {
  mockAuthenticateApiKey,
  mockIsApiKeyAuthError,
  mockCanUseApi,
  mockEmitReceiptForBusiness,
  mockRateLimiterCheck,
} = vi.hoisted(() => ({
  mockAuthenticateApiKey: vi.fn(),
  mockIsApiKeyAuthError: vi.fn(),
  mockCanUseApi: vi.fn(),
  mockEmitReceiptForBusiness: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  authenticateApiKey: mockAuthenticateApiKey,
  isApiKeyAuthError: mockIsApiKeyAuthError,
}));

vi.mock("@/lib/plans", () => ({
  canUseApi: mockCanUseApi,
}));

vi.mock("@/lib/services/receipt-service", () => ({
  emitReceiptForBusiness: mockEmitReceiptForBusiness,
}));

vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

// --- Helpers ---

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_IDEMPOTENCY_KEY = "660e8400-e29b-41d4-a716-446655440001";

const VALID_BODY = {
  lines: [{ description: "Caffè", quantity: 1, grossUnitPrice: 1.5 }],
  paymentMethod: "PC",
  idempotencyKey: VALID_IDEMPOTENCY_KEY,
};

function makeRequest(body: Record<string, unknown> = VALID_BODY): Request {
  return new Request("https://example.com/api/v1/receipts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/receipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockIsApiKeyAuthError.mockReturnValue(false);
    mockAuthenticateApiKey.mockResolvedValue({
      plan: "pro",
      businessId: "biz-123",
      apiKey: { id: "key-1" },
    });
    mockCanUseApi.mockReturnValue(true);
    mockRateLimiterCheck.mockReturnValue({ success: true });
    mockEmitReceiptForBusiness.mockResolvedValue({
      documentId: VALID_UUID,
      adeTransactionId: "tx-1",
      adeProgressive: 1,
    });
  });

  describe("UUID validation — idempotencyKey", () => {
    it("returns 400 when idempotencyKey is not a valid UUID", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const res = await POST(
        makeRequest({ ...VALID_BODY, idempotencyKey: "not-a-uuid" }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/idempotencyKey/i);
    });

    it("returns 400 when idempotencyKey is a plain string key", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const res = await POST(
        makeRequest({ ...VALID_BODY, idempotencyKey: "my-custom-key-123" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when idempotencyKey is empty", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const res = await POST(
        makeRequest({ ...VALID_BODY, idempotencyKey: "" }),
      );
      expect(res.status).toBe(400);
    });

    it("does not call emitReceiptForBusiness when idempotencyKey is invalid", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      await POST(makeRequest({ ...VALID_BODY, idempotencyKey: "bad-key" }));
      expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
    });

    it("accepts a valid UUID idempotencyKey", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(201);
    });
  });

  describe("auth", () => {
    it("returns 401 when auth fails", async () => {
      mockIsApiKeyAuthError.mockReturnValue(true);
      mockAuthenticateApiKey.mockResolvedValue({
        error: "Unauthorized",
        status: 401,
      });
      const { POST } = await import("@/app/api/v1/receipts/route");
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it("returns 402 when plan does not include API access", async () => {
      mockCanUseApi.mockReturnValue(false);
      const { POST } = await import("@/app/api/v1/receipts/route");
      const res = await POST(makeRequest());
      expect(res.status).toBe(402);
    });

    it("returns 403 when no businessId", async () => {
      mockAuthenticateApiKey.mockResolvedValue({
        plan: "pro",
        businessId: null,
        apiKey: { id: "key-1" },
      });
      const { POST } = await import("@/app/api/v1/receipts/route");
      const res = await POST(makeRequest());
      expect(res.status).toBe(403);
    });
  });

  describe("input validation", () => {
    it("returns 400 when lines is missing", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const res = await POST(makeRequest({ ...VALID_BODY, lines: undefined }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when lines is empty", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const res = await POST(makeRequest({ ...VALID_BODY, lines: [] }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when paymentMethod is invalid", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const res = await POST(
        makeRequest({ ...VALID_BODY, paymentMethod: "INVALID" }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("business logic", () => {
    it("returns 201 on successful emission", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const res = await POST(makeRequest());
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.documentId).toBe(VALID_UUID);
    });

    it("returns 422 when service returns error", async () => {
      mockEmitReceiptForBusiness.mockResolvedValue({ error: "AdE error" });
      const { POST } = await import("@/app/api/v1/receipts/route");
      const res = await POST(makeRequest());
      expect(res.status).toBe(422);
    });

    it("returns 429 when rate limit exceeded", async () => {
      mockRateLimiterCheck.mockReturnValue({ success: false });
      const { POST } = await import("@/app/api/v1/receipts/route");
      const res = await POST(makeRequest());
      expect(res.status).toBe(429);
    });
  });
});
