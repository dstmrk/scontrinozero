// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const {
  mockAuthenticateApiKey,
  mockIsApiKeyAuthError,
  mockCanUseApi,
  mockReturnReceiptForBusiness,
  mockRateLimiterCheck,
} = vi.hoisted(() => ({
  mockAuthenticateApiKey: vi.fn(),
  mockIsApiKeyAuthError: vi.fn(),
  mockCanUseApi: vi.fn(),
  mockReturnReceiptForBusiness: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  authenticateApiKey: mockAuthenticateApiKey,
  isApiKeyAuthError: mockIsApiKeyAuthError,
}));

vi.mock("@/lib/plans", () => ({
  canUseApi: mockCanUseApi,
}));

vi.mock("@/lib/services/return-service", () => ({
  returnReceiptForBusiness: mockReturnReceiptForBusiness,
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

const SALE_ID = "b2c3d4e5-f6a7-8901-bcde-f12345678901";

const VALIDATION_BODY_BASE = {
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440001",
};

const VALID_BODY = {
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440001",
  quantities: [1, 0],
};

function makeRequest(body: unknown = VALID_BODY) {
  return new Request(`http://localhost/api/v1/receipts/${SALE_ID}/return`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function makeParams(id = SALE_ID) {
  return { params: Promise.resolve({ id }) };
}

// --- Tests ---

import { OPTIONS, POST } from "./route";

describe("POST /api/v1/receipts/[id]/return", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsApiKeyAuthError.mockReturnValue(false);
    mockAuthenticateApiKey.mockResolvedValue(FAKE_AUTH);
    mockCanUseApi.mockReturnValue(true);
    mockRateLimiterCheck.mockReturnValue({ success: true });
    mockReturnReceiptForBusiness.mockResolvedValue({
      returnDocumentId: "return-doc-uuid",
      adeTransactionId: "trx-ret-001",
      adeProgressive: "DCW2026/5111-3001",
    });
  });

  it("happy path: 200 con returnDocumentId, transazione e progressivo", async () => {
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      returnDocumentId: "return-doc-uuid",
      adeTransactionId: "trx-ret-001",
      adeProgressive: "DCW2026/5111-3001",
    });
  });

  it("passa id dalla URL, businessId e apiKeyId dalla chiave al service", async () => {
    await POST(makeRequest(), makeParams());

    expect(mockReturnReceiptForBusiness).toHaveBeenCalledWith(
      {
        documentId: SALE_ID,
        idempotencyKey: VALID_BODY.idempotencyKey,
        businessId: "biz-uuid",
        quantities: [1, 0],
      },
      "key-uuid-123",
    );
  });

  it("401 se la API key non è valida", async () => {
    mockIsApiKeyAuthError.mockReturnValue(true);
    mockAuthenticateApiKey.mockResolvedValue({
      error: "API key non valida.",
      status: 401,
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(401);
    expect(mockReturnReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("402 se il piano non include l'API", async () => {
    mockCanUseApi.mockReturnValue(false);

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(402);
    expect(mockReturnReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("403 con una management key", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      ...FAKE_AUTH,
      businessId: null,
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(403);
  });

  it("429 oltre la soglia, sul bucket api:return della chiave", async () => {
    mockRateLimiterCheck.mockReturnValue({
      success: false,
      resetAt: Date.now() + 60_000,
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(429);
    expect(mockRateLimiterCheck).toHaveBeenCalledWith(
      "api:return:key-uuid-123",
    );
    expect(mockReturnReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("400 INVALID_BODY se il corpo non è JSON", async () => {
    const res = await POST(makeRequest("{nope"), makeParams());

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_BODY");
  });

  it.each([
    ["idempotencyKey mancante", { quantities: [1] }],
    ["idempotencyKey non UUID", { ...VALID_BODY, idempotencyKey: "x" }],
    ["quantities mancante", { idempotencyKey: VALID_BODY.idempotencyKey }],
    ["quantities vuoto", { ...VALID_BODY, quantities: [] }],
    ["quantità negativa", { ...VALID_BODY, quantities: [-1] }],
    ["quantità non numerica", { ...VALID_BODY, quantities: ["1"] }],
    // Errori di forma: si vedono dal solo corpo, senza DB né AdE. 400, cioè
    // "correggi il client"; il 422 resta per ciò che dipende dallo scontrino.
    ["più di due decimali", { ...VALIDATION_BODY_BASE, quantities: [0.125] }],
    ["tutte a zero", { ...VALIDATION_BODY_BASE, quantities: [0, 0] }],
    [
      "più di 100 righe",
      { ...VALID_BODY, quantities: Array.from({ length: 101 }, () => 0) },
    ],
  ])("400 VALIDATION_ERROR: %s", async (_label, body) => {
    const res = await POST(makeRequest(body), makeParams());

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
    expect(mockReturnReceiptForBusiness).not.toHaveBeenCalled();
  });

  it("400 INVALID_ID se l'id nel path non è un UUID", async () => {
    const res = await POST(makeRequest(), makeParams("not-a-uuid"));

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_ID");
  });

  it("accetta due decimali e righe a zero accanto a una resa", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, quantities: [0.25, 0] }),
      makeParams(),
    );

    expect(res.status).toBe(200);
  });

  it("422 RETURN_INVALID_QUANTITIES oltre il residuo", async () => {
    mockReturnReceiptForBusiness.mockResolvedValue({
      error: "Quantità oltre il rendibile.",
      code: "RETURN_INVALID_QUANTITIES",
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("RETURN_INVALID_QUANTITIES");
  });

  it("409 RETURN_PENDING_IN_PROGRESS porta il documentId del reso in volo", async () => {
    mockReturnReceiptForBusiness.mockResolvedValue({
      error: "Reso in corso.",
      code: "RETURN_PENDING_IN_PROGRESS",
      returnDocumentId: "return-doc-uuid",
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(409);
    expect(res.headers.get("Retry-After")).toBe("2");
    expect(await res.json()).toMatchObject({
      code: "RETURN_PENDING_IN_PROGRESS",
      documentId: "return-doc-uuid",
    });
  });

  it("503 ADE_UNAVAILABLE porta il documentId del reso dall'esito ignoto", async () => {
    mockReturnReceiptForBusiness.mockResolvedValue({
      error: "AdE non raggiungibile.",
      code: "ADE_UNAVAILABLE",
      returnDocumentId: "return-doc-uuid",
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      code: "ADE_UNAVAILABLE",
      documentId: "return-doc-uuid",
    });
  });

  it("409 ADE_REAUTH_REQUIRED se la sessione CIE è scaduta", async () => {
    mockReturnReceiptForBusiness.mockResolvedValue({ reauthRequired: true });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("ADE_REAUTH_REQUIRED");
  });

  it("404 NOT_FOUND se la vendita non c'è o è di un altro esercente", async () => {
    mockReturnReceiptForBusiness.mockResolvedValue({
      error: "Scontrino non trovato.",
      code: "NOT_FOUND",
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(404);
  });

  it("OPTIONS: 204 con i metodi consentiti", () => {
    const res = OPTIONS();

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS",
    );
  });
});
