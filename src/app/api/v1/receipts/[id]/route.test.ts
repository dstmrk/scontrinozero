// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const {
  mockAuthenticateApiKey,
  mockIsApiKeyAuthError,
  mockCanUseApi,
  mockSelectLimit,
  mockSelectWhere,
  mockSelectFrom,
  mockSelect,
} = vi.hoisted(() => ({
  mockAuthenticateApiKey: vi.fn(),
  mockIsApiKeyAuthError: vi.fn(),
  mockCanUseApi: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockSelectFrom: vi.fn(),
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
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...args) => args),
}));

// --- Fixtures ---

const FAKE_AUTH = {
  apiKey: { id: "key-uuid-123" },
  profileId: "profile-uuid",
  businessId: "biz-uuid",
  plan: "pro",
  trialStartedAt: null,
};

const FAKE_DOC = {
  id: "doc-uuid-123",
  kind: "SALE",
  status: "ACCEPTED",
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  adeTransactionId: "trx-001",
  adeProgressive: "001",
  createdAt: new Date("2026-03-01T10:00:00Z"),
};

function makeRequest() {
  return new Request("http://localhost/api/v1/receipts/doc-uuid-123");
}

function makeParams(id = "doc-uuid-123") {
  return { params: Promise.resolve({ id }) };
}

// --- Tests ---

import { GET } from "./route";

describe("GET /api/v1/receipts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsApiKeyAuthError.mockReturnValue(false);
    mockAuthenticateApiKey.mockResolvedValue(FAKE_AUTH);
    mockCanUseApi.mockReturnValue(true);

    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
    mockSelectLimit.mockResolvedValue([FAKE_DOC]);
  });

  it("ritorna 200 con i dati del documento", async () => {
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("doc-uuid-123");
    expect(body.status).toBe("ACCEPTED");
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
    mockSelectLimit.mockResolvedValue([]);

    const res = await GET(makeRequest(), makeParams("non-existent-id"));
    expect(res.status).toBe(404);
  });
});
