// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const {
  mockAuthenticateApiKey,
  mockIsApiKeyAuthError,
  mockCanUseApi,
  mockSelectDocLimit,
  mockSelectDocWhere,
  mockSelectDocFrom,
  mockSelectLinesOrderBy,
  mockSelectLinesWhere,
  mockSelectLinesFrom,
  mockSelect,
} = vi.hoisted(() => ({
  mockAuthenticateApiKey: vi.fn(),
  mockIsApiKeyAuthError: vi.fn(),
  mockCanUseApi: vi.fn(),
  mockSelectDocLimit: vi.fn(),
  mockSelectDocWhere: vi.fn(),
  mockSelectDocFrom: vi.fn(),
  mockSelectLinesOrderBy: vi.fn(),
  mockSelectLinesWhere: vi.fn(),
  mockSelectLinesFrom: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  authenticateApiKey: mockAuthenticateApiKey,
  isApiKeyAuthError: mockIsApiKeyAuthError,
}));

vi.mock("@/lib/plans", () => ({
  canUseApi: mockCanUseApi,
}));

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({ select: mockSelect }),
}));

vi.mock("@/db/schema", () => ({
  commercialDocuments: "commercial-documents-table",
  commercialDocumentLines: "commercial-document-lines-table",
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...args) => args),
  asc: vi.fn((col) => ({ col, direction: "asc" })),
}));

// --- Fixtures ---

const FAKE_AUTH = {
  apiKey: { id: "key-uuid-123" },
  profileId: "profile-uuid",
  businessId: "biz-uuid",
  plan: "pro",
  trialStartedAt: null,
};

const DOC_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

const FAKE_DOC = {
  id: DOC_ID,
  kind: "SALE",
  status: "ACCEPTED",
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  adeTransactionId: "trx-001",
  adeProgressive: "001",
  createdAt: new Date("2026-03-01T10:00:00Z"),
  publicRequest: { paymentMethod: "PC" },
  lotteryCode: null as string | null,
  voidedDocumentId: null as string | null,
};

const FAKE_LINE = {
  id: "line-uuid-1",
  documentId: DOC_ID,
  lineIndex: 0,
  description: "Espresso",
  quantity: "2.000",
  grossUnitPrice: "1.50",
  vatCode: "22",
};

function makeRequest() {
  return new Request(`http://localhost/api/v1/receipts/${DOC_ID}`);
}

function makeParams(id = DOC_ID) {
  return { params: Promise.resolve({ id }) };
}

function setupDocMock(doc: typeof FAKE_DOC | null) {
  mockSelect.mockReturnValueOnce({ from: mockSelectDocFrom });
  mockSelectDocFrom.mockReturnValue({ where: mockSelectDocWhere });
  mockSelectDocWhere.mockReturnValue({ limit: mockSelectDocLimit });
  mockSelectDocLimit.mockResolvedValue(doc ? [doc] : []);
}

function setupLinesMock(lines: (typeof FAKE_LINE)[]) {
  mockSelect.mockReturnValueOnce({ from: mockSelectLinesFrom });
  mockSelectLinesFrom.mockReturnValue({ where: mockSelectLinesWhere });
  mockSelectLinesWhere.mockReturnValue({ orderBy: mockSelectLinesOrderBy });
  mockSelectLinesOrderBy.mockResolvedValue(lines);
}

// --- Tests ---

import { GET } from "./route";

describe("GET /api/v1/receipts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsApiKeyAuthError.mockReturnValue(false);
    mockAuthenticateApiKey.mockResolvedValue(FAKE_AUTH);
    mockCanUseApi.mockReturnValue(true);

    setupDocMock(FAKE_DOC);
    setupLinesMock([FAKE_LINE]);
  });

  it("ritorna 200 con i dati del documento", async () => {
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(DOC_ID);
    expect(body.status).toBe("ACCEPTED");
  });

  it("ritorna lines con i campi corretti", async () => {
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]).toEqual({
      description: "Espresso",
      quantity: "2.000",
      grossUnitPrice: "1.50",
      vatCode: "22",
    });
  });

  it("ritorna total calcolato correttamente", async () => {
    // 2.000 * 1.50 = 3.00
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe("3.00");
  });

  it("ritorna paymentMethod estratto da publicRequest", async () => {
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paymentMethod).toBe("PC");
  });

  it("ritorna lotteryCode quando presente", async () => {
    setupDocMock({ ...FAKE_DOC, lotteryCode: "ABCD1234" });
    setupLinesMock([FAKE_LINE]);
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lotteryCode).toBe("ABCD1234");
  });

  it("ritorna lotteryCode null quando assente", async () => {
    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(body.lotteryCode).toBeNull();
  });

  it("ritorna voidedDocumentId per documenti VOID", async () => {
    const voidedId = "00000000-0000-0000-0000-000000000001";
    setupDocMock({ ...FAKE_DOC, kind: "VOID", voidedDocumentId: voidedId });
    setupLinesMock([]);
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voidedDocumentId).toBe(voidedId);
    expect(body.kind).toBe("VOID");
  });

  it("ritorna total 0.00 quando non ci sono righe", async () => {
    setupDocMock(FAKE_DOC);
    setupLinesMock([]);
    const res = await GET(makeRequest(), makeParams());
    const body = await res.json();
    expect(body.total).toBe("0.00");
    expect(body.lines).toHaveLength(0);
  });

  it("ritorna 401 se API key non valida", async () => {
    mockIsApiKeyAuthError.mockReturnValue(true);
    mockAuthenticateApiKey.mockResolvedValue({
      error: "API key non valida.",
      status: 401,
    });

    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("ritorna 402 se piano non ha accesso API", async () => {
    mockCanUseApi.mockReturnValue(false);

    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(402);
  });

  it("ritorna 403 se è una management key (businessId null)", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      ...FAKE_AUTH,
      businessId: null,
    });

    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(403);
  });

  it("ritorna 404 se documento non trovato (o appartiene ad altro business)", async () => {
    vi.clearAllMocks();
    mockIsApiKeyAuthError.mockReturnValue(false);
    mockAuthenticateApiKey.mockResolvedValue(FAKE_AUTH);
    mockCanUseApi.mockReturnValue(true);
    setupDocMock(null);

    const res = await GET(
      makeRequest(),
      makeParams("00000000-0000-0000-0000-000000000000"),
    );
    expect(res.status).toBe(404);
  });
});
