// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

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
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// --- Fixtures ---

const FAKE_AUTH = {
  apiKey: { id: "key-uuid-123" },
  profileId: "profile-uuid",
  businessId: "biz-uuid",
  plan: "pro",
  trialStartedAt: null,
};

const VALID_BODY = {
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440001",
};

function makeRequest(body: unknown = VALID_BODY) {
  return new Request("http://localhost/api/v1/receipts/sale-doc-uuid/void", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id = "b2c3d4e5-f6a7-8901-bcde-f12345678901") {
  return { params: Promise.resolve({ id }) };
}

// --- Tests ---

import { POST } from "./route";

describe("POST /api/v1/receipts/[id]/void", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsApiKeyAuthError.mockReturnValue(false);
    mockAuthenticateApiKey.mockResolvedValue(FAKE_AUTH);
    mockCanUseApi.mockReturnValue(true);
    mockRateLimiterCheck.mockReturnValue({ success: true });
    mockVoidReceiptForBusiness.mockResolvedValue({
      voidDocumentId: "void-doc-uuid",
      adeTransactionId: "trx-void-001",
      adeProgressive: "DCW2026/5111-3000",
    });
  });

  it("happy path: annulla scontrino e ritorna 200 con voidDocumentId", async () => {
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voidDocumentId).toBe("void-doc-uuid");
    expect(body.adeTransactionId).toBe("trx-void-001");
    expect(body.adeProgressive).toBe("DCW2026/5111-3000");
  });

  it("passa documentId dalla URL e businessId dalla API key al service", async () => {
    await POST(
      makeRequest(),
      makeParams("b2c3d4e5-f6a7-8901-bcde-f12345678901"),
    );
    expect(mockVoidReceiptForBusiness).toHaveBeenCalledWith(
      {
        documentId: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
        idempotencyKey: VALID_BODY.idempotencyKey,
        businessId: "biz-uuid",
      },
      "key-uuid-123",
    );
  });

  it("ritorna 401 se API key non valida", async () => {
    mockIsApiKeyAuthError.mockReturnValue(true);
    mockAuthenticateApiKey.mockResolvedValue({
      error: "API key non valida.",
      status: 401,
    });

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("ritorna 402 se piano non ha accesso API", async () => {
    mockCanUseApi.mockReturnValue(false);

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(402);
    expect(mockVoidReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("ritorna 403 se è una management key (businessId null)", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      ...FAKE_AUTH,
      businessId: null,
    });

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(403);
    expect(mockVoidReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("ritorna 429 se rate limit superato", async () => {
    mockRateLimiterCheck.mockReturnValue({ success: false });

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(429);
    expect(mockVoidReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("ritorna 400 se body non è JSON valido", async () => {
    const req = new Request(
      "http://localhost/api/v1/receipts/sale-doc-uuid/void",
      { method: "POST", body: "not-json" },
    );
    const res = await POST(req, makeParams());
    expect(res.status).toBe(400);
  });

  it("ritorna 400 se idempotencyKey manca", async () => {
    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(400);
  });

  it("ritorna 400 se idempotencyKey non è un UUID valido", async () => {
    const res = await POST(
      makeRequest({ idempotencyKey: "not-a-uuid" }),
      makeParams(),
    );
    expect(res.status).toBe(400);
  });

  it("ritorna 422 se il service ritorna un errore", async () => {
    mockVoidReceiptForBusiness.mockResolvedValue({
      error: "Scontrino non trovato.",
    });

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Scontrino non trovato.");
  });
});
