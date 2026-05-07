// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_BUSINESS_ID, TEST_IDEMPOTENCY_KEY } from "../_helpers/fixtures";

// --- Mocks ---

const {
  mockAuthenticateApiKey,
  mockIsApiKeyAuthError,
  mockCanUseApi,
  mockVoidReceiptForBusiness,
  mockRateLimiterCheck,
} = vi.hoisted(() => ({
  mockAuthenticateApiKey: vi.fn(),
  mockIsApiKeyAuthError: vi.fn(),
  mockCanUseApi: vi.fn(),
  mockVoidReceiptForBusiness: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  authenticateApiKey: mockAuthenticateApiKey,
  isApiKeyAuthError: mockIsApiKeyAuthError,
}));

vi.mock("@/lib/plans", () => ({
  canUseApi: mockCanUseApi,
}));

vi.mock("@/lib/services/void-service", () => ({
  voidReceiptForBusiness: mockVoidReceiptForBusiness,
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

function makeRequest(
  id: string,
  body = { idempotencyKey: VALID_IDEMPOTENCY_KEY },
): Request {
  return new Request(`https://example.com/api/v1/receipts/${id}/void`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/v1/receipts/[id]/void", () => {
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
    mockVoidReceiptForBusiness.mockResolvedValue({
      voidDocumentId: "void-1",
      adeTransactionId: "tx-1",
      adeProgressive: 1,
    });
  });

  describe("UUID validation — document id", () => {
    it("returns 400 for a non-UUID id", async () => {
      const { POST } = await import("@/app/api/v1/receipts/[id]/void/route");
      const res = await POST(
        makeRequest("not-a-uuid"),
        makeParams("not-a-uuid"),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 for a SQL injection id", async () => {
      const { POST } = await import("@/app/api/v1/receipts/[id]/void/route");
      const id = "'; DROP TABLE documents; --";
      const res = await POST(makeRequest(id), makeParams(id));
      expect(res.status).toBe(400);
    });

    it("does not call voidReceiptForBusiness for invalid UUID", async () => {
      const { POST } = await import("@/app/api/v1/receipts/[id]/void/route");
      await POST(makeRequest("invalid"), makeParams("invalid"));
      expect(mockVoidReceiptForBusiness).not.toHaveBeenCalled();
    });
  });

  describe("UUID validation — idempotencyKey", () => {
    it("returns 400 when idempotencyKey is not a valid UUID", async () => {
      const { POST } = await import("@/app/api/v1/receipts/[id]/void/route");
      const res = await POST(
        makeRequest(VALID_UUID, { idempotencyKey: "not-a-uuid" }),
        makeParams(VALID_UUID),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/idempotencyKey/i);
    });

    it("returns 400 when idempotencyKey is a plain string", async () => {
      const { POST } = await import("@/app/api/v1/receipts/[id]/void/route");
      const res = await POST(
        makeRequest(VALID_UUID, { idempotencyKey: "my-custom-key-123" }),
        makeParams(VALID_UUID),
      );
      expect(res.status).toBe(400);
    });

    it("does not call voidReceiptForBusiness when idempotencyKey is invalid", async () => {
      const { POST } = await import("@/app/api/v1/receipts/[id]/void/route");
      await POST(
        makeRequest(VALID_UUID, { idempotencyKey: "bad-key" }),
        makeParams(VALID_UUID),
      );
      expect(mockVoidReceiptForBusiness).not.toHaveBeenCalled();
    });
  });

  describe("payload size", () => {
    it("returns 413 when payload exceeds 8 KB", async () => {
      const { POST } = await import("@/app/api/v1/receipts/[id]/void/route");
      const oversizedBody = "x".repeat(9 * 1024);
      const req = new Request(
        `https://example.com/api/v1/receipts/${VALID_UUID}/void`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: oversizedBody,
        },
      );
      const res = await POST(req, makeParams(VALID_UUID));
      expect(res.status).toBe(413);
    });
  });

  describe("business logic", () => {
    it("returns 200 on successful void", async () => {
      const { POST } = await import("@/app/api/v1/receipts/[id]/void/route");
      const res = await POST(makeRequest(VALID_UUID), makeParams(VALID_UUID));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.voidDocumentId).toBe("void-1");
    });

    it("returns 422 when void service returns error", async () => {
      mockVoidReceiptForBusiness.mockResolvedValue({ error: "Già annullato" });
      const { POST } = await import("@/app/api/v1/receipts/[id]/void/route");
      const res = await POST(makeRequest(VALID_UUID), makeParams(VALID_UUID));
      expect(res.status).toBe(422);
    });
  });
});
