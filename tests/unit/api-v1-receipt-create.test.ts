// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_BUSINESS_ID, TEST_IDEMPOTENCY_KEY } from "../_helpers/fixtures";

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
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

// --- Helpers ---

const VALID_UUID = TEST_BUSINESS_ID;
const VALID_IDEMPOTENCY_KEY = TEST_IDEMPOTENCY_KEY;

const VALID_BODY = {
  lines: [
    { description: "Caffè", quantity: 1, grossUnitPrice: 1.5, vatCode: "22" },
  ],
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

    // P1-05: cardinalità e limiti di dimensione
    it("returns 400 when lines exceeds 100 items", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const lines = Array.from({ length: 101 }, (_, i) => ({
        description: `Item ${i}`,
        quantity: 1,
        grossUnitPrice: 1.0,
        vatCode: "22",
      }));
      const res = await POST(makeRequest({ ...VALID_BODY, lines }));
      expect(res.status).toBe(400);
      expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
    });

    it("accepts 100 lines (boundary)", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const lines = Array.from({ length: 100 }, (_, i) => ({
        description: `Item ${i}`,
        quantity: 1,
        grossUnitPrice: 1.0,
        vatCode: "22",
      }));
      const res = await POST(makeRequest({ ...VALID_BODY, lines }));
      expect(res.status).toBe(201);
    });

    it("returns 400 when description exceeds 200 characters", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const lines = [
        {
          description: "A".repeat(201),
          quantity: 1,
          grossUnitPrice: 1.0,
          vatCode: "22",
        },
      ];
      const res = await POST(makeRequest({ ...VALID_BODY, lines }));
      expect(res.status).toBe(400);
      expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
    });

    it("returns 400 when quantity exceeds 9999", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const lines = [
        {
          description: "Item",
          quantity: 10000,
          grossUnitPrice: 1.0,
          vatCode: "22",
        },
      ];
      const res = await POST(makeRequest({ ...VALID_BODY, lines }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when grossUnitPrice exceeds 999999.99", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const lines = [
        {
          description: "Item",
          quantity: 1,
          grossUnitPrice: 1_000_000,
          vatCode: "22",
        },
      ];
      const res = await POST(makeRequest({ ...VALID_BODY, lines }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when lotteryCode is malformed and paymentMethod is PE", async () => {
      // Conditional validation: lotteryCode regex applies only when PE
      // (CLAUDE.md / AdE: lottery applies to electronic payments only).
      const { POST } = await import("@/app/api/v1/receipts/route");
      const res = await POST(
        makeRequest({
          ...VALID_BODY,
          paymentMethod: "PE",
          lotteryCode: "TOOLONGCODE",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 413 when payload exceeds 32 KB", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const oversizedBody = "x".repeat(33 * 1024);
      const req = new Request("https://example.com/api/v1/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: oversizedBody,
      });
      const res = await POST(req);
      expect(res.status).toBe(413);
    });
  });

  describe("monetary decimal precision", () => {
    it("returns 400 when quantity has more than 3 decimal places", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const lines = [
        {
          description: "Item",
          quantity: 0.1234,
          grossUnitPrice: 1.5,
          vatCode: "22",
        },
      ];
      const res = await POST(makeRequest({ ...VALID_BODY, lines }));
      expect(res.status).toBe(400);
      expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
    });

    it("returns 400 when grossUnitPrice has more than 2 decimal places", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const lines = [
        {
          description: "Item",
          quantity: 1,
          grossUnitPrice: 1.999,
          vatCode: "22",
        },
      ];
      const res = await POST(makeRequest({ ...VALID_BODY, lines }));
      expect(res.status).toBe(400);
      expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
    });

    it("accepts quantity with exactly 3 decimal places", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const lines = [
        {
          description: "Item",
          quantity: 0.125,
          grossUnitPrice: 1.5,
          vatCode: "22",
        },
      ];
      const res = await POST(makeRequest({ ...VALID_BODY, lines }));
      expect(res.status).toBe(201);
    });

    it("accepts grossUnitPrice with exactly 2 decimal places", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const lines = [
        {
          description: "Item",
          quantity: 1,
          grossUnitPrice: 12.99,
          vatCode: "22",
        },
      ];
      const res = await POST(makeRequest({ ...VALID_BODY, lines }));
      expect(res.status).toBe(201);
    });

    it("accepts integer quantity and price", async () => {
      const { POST } = await import("@/app/api/v1/receipts/route");
      const lines = [
        { description: "Item", quantity: 2, grossUnitPrice: 10, vatCode: "22" },
      ];
      const res = await POST(makeRequest({ ...VALID_BODY, lines }));
      expect(res.status).toBe(201);
    });
  });

  describe("CORS preflight (P2-02)", () => {
    it("OPTIONS returns 204 with CORS headers", async () => {
      const { OPTIONS } = await import("@/app/api/v1/receipts/route");
      const res = OPTIONS();
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
      expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
        "Authorization",
      );
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

    it("returns 503 + Retry-After when service returns DB_TIMEOUT (B20)", async () => {
      mockEmitReceiptForBusiness.mockResolvedValue({
        error:
          "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
        code: "DB_TIMEOUT",
      });
      const { POST } = await import("@/app/api/v1/receipts/route");
      const res = await POST(makeRequest());
      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("5");
      const body = await res.json();
      expect(body.code).toBe("DB_TIMEOUT");
    });

    it("returns 409 + Retry-After when service returns PENDING_IN_PROGRESS (B7)", async () => {
      mockEmitReceiptForBusiness.mockResolvedValue({
        error: "Scontrino precedente ancora in elaborazione.",
        code: "PENDING_IN_PROGRESS",
      });
      const { POST } = await import("@/app/api/v1/receipts/route");
      const res = await POST(makeRequest());
      expect(res.status).toBe(409);
      expect(res.headers.get("Retry-After")).toBe("2");
      const body = await res.json();
      expect(body.code).toBe("PENDING_IN_PROGRESS");
    });

    it("returns 409 when service returns ALREADY_REJECTED (B7)", async () => {
      mockEmitReceiptForBusiness.mockResolvedValue({
        error: "Scontrino precedente già rifiutato.",
        code: "ALREADY_REJECTED",
      });
      const { POST } = await import("@/app/api/v1/receipts/route");
      const res = await POST(makeRequest());
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("ALREADY_REJECTED");
    });
  });
});
