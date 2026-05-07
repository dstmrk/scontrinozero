// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

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
  lines: [
    {
      id: "l1",
      description: "Pizza",
      quantity: 1,
      grossUnitPrice: 10.0,
      vatCode: "10",
    },
  ],
  paymentMethod: "PC",
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
};

function makeRequest(body: unknown = VALID_BODY) {
  return new Request("http://localhost/api/v1/receipts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Tests ---

import { POST } from "./route";

describe("POST /api/v1/receipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsApiKeyAuthError.mockReturnValue(false);
    mockAuthenticateApiKey.mockResolvedValue(FAKE_AUTH);
    mockCanUseApi.mockReturnValue(true);
    mockRateLimiterCheck.mockReturnValue({ success: true });
    mockEmitReceiptForBusiness.mockResolvedValue({
      documentId: "doc-123",
      adeTransactionId: "trx-001",
      adeProgressive: "001",
    });
  });

  it("happy path: emette scontrino e ritorna 201 con documentId", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.documentId).toBe("doc-123");
    expect(body.adeTransactionId).toBe("trx-001");
    expect(body.adeProgressive).toBe("001");
  });

  it("passa businessId dalla API key (non dal body) al service", async () => {
    await POST(makeRequest());
    expect(mockEmitReceiptForBusiness).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "biz-uuid" }),
      "key-uuid-123",
    );
  });

  it("ritorna 401 se API key non valida", async () => {
    mockIsApiKeyAuthError.mockReturnValue(true);
    mockAuthenticateApiKey.mockResolvedValue({
      error: "API key non valida.",
      status: 401,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("ritorna 402 se piano non ha accesso API", async () => {
    mockCanUseApi.mockReturnValue(false);

    const res = await POST(makeRequest());
    expect(res.status).toBe(402);
    expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("ritorna 403 se è una management key (businessId null)", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      ...FAKE_AUTH,
      businessId: null,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("ritorna 429 se rate limit superato", async () => {
    mockRateLimiterCheck.mockReturnValue({ success: false });

    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("ritorna 400 se body non è JSON valido", async () => {
    const req = new Request("http://localhost/api/v1/receipts", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("ritorna 400 se lines è vuoto", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, lines: [] }));
    expect(res.status).toBe(400);
  });

  it("ritorna 400 se paymentMethod non è valido", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, paymentMethod: "CASH" }),
    );
    expect(res.status).toBe(400);
  });

  it("ritorna 400 se idempotencyKey manca", async () => {
    const { idempotencyKey: _, ...bodyNoKey } = VALID_BODY;
    const res = await POST(makeRequest(bodyNoKey));
    expect(res.status).toBe(400);
  });

  it("ritorna 422 se il service ritorna un errore", async () => {
    mockEmitReceiptForBusiness.mockResolvedValue({
      error: "Credenziali AdE non trovate.",
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Credenziali AdE non trovate.");
  });

  it("ritorna 400 se idempotencyKey non è un UUID valido", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, idempotencyKey: "not-a-uuid" }),
    );
    expect(res.status).toBe(400);
  });

  it("ritorna 400 se una line manca di campi obbligatori", async () => {
    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        lines: [{ description: "Mela" }], // mancano quantity, grossUnitPrice, vatCode
      }),
    );
    expect(res.status).toBe(400);
  });

  it("passa lotteryCode al service quando presente nel body", async () => {
    await POST(
      makeRequest({
        ...VALID_BODY,
        paymentMethod: "PE",
        lotteryCode: "YYWLR30G",
      }),
    );
    expect(mockEmitReceiptForBusiness).toHaveBeenCalledWith(
      expect.objectContaining({ lotteryCode: "YYWLR30G" }),
      "key-uuid-123",
    );
  });

  it("ritorna 400 se lotteryCode contiene caratteri non alfanumerici", async () => {
    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        paymentMethod: "PE",
        lotteryCode: "ABC-2345",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("ritorna 400 se lotteryCode è in minuscolo", async () => {
    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        paymentMethod: "PE",
        lotteryCode: "abc12345",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("ritorna 400 se lotteryCode è una stringa vuota", async () => {
    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        paymentMethod: "PE",
        lotteryCode: "",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("ritorna 400 se lotteryCode è più corto di 8 caratteri", async () => {
    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        paymentMethod: "PE",
        lotteryCode: "ABC123",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockEmitReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("accetta lotteryCode malformato con paymentMethod=PC (backward compat)", async () => {
    // PC ignora il lotteryCode lato service — non rifiutarlo al boundary
    // per non rompere client legacy che inviano placeholder su scontrini cash.
    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        paymentMethod: "PC",
        lotteryCode: "garbage-value",
      }),
    );
    expect(res.status).toBe(201);
    expect(mockEmitReceiptForBusiness).toHaveBeenCalled();
  });
});
