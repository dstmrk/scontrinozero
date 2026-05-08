// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_BUSINESS_ID } from "../_helpers/fixtures";

// --- Mocks ---

const {
  mockAuthenticateApiKey,
  mockIsApiKeyAuthError,
  mockCanUseApi,
  mockGetDb,
  mockOrderBy,
  mockLimit,
  mockWhere,
  mockFrom,
  mockLinesWhere,
  mockLinesFrom,
  mockSelect,
  mockTransaction,
  mockTxExecute,
} = vi.hoisted(() => ({
  mockAuthenticateApiKey: vi.fn(),
  mockIsApiKeyAuthError: vi.fn(),
  mockCanUseApi: vi.fn(),
  mockGetDb: vi.fn(),
  mockOrderBy: vi.fn(),
  mockLimit: vi.fn(),
  mockWhere: vi.fn(),
  mockFrom: vi.fn(),
  mockLinesWhere: vi.fn(),
  mockLinesFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockTransaction: vi.fn(),
  mockTxExecute: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  authenticateApiKey: mockAuthenticateApiKey,
  isApiKeyAuthError: mockIsApiKeyAuthError,
}));

vi.mock("@/lib/plans", () => ({
  canUseApi: mockCanUseApi,
}));

vi.mock("@/db", () => ({
  getDb: mockGetDb,
}));

vi.mock("@/db/schema", () => ({
  commercialDocuments: "commercial-documents-table",
  commercialDocumentLines: "commercial-document-lines-table",
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  asc: vi.fn(),
  sql: { raw: vi.fn((s) => ({ raw: s })) },
}));

// --- Helpers ---

function makeRequest(id: string): Request {
  return new Request(`https://example.com/api/v1/receipts/${id}`);
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const VALID_UUID = TEST_BUSINESS_ID;

describe("GET /api/v1/receipts/[id]", () => {
  beforeEach(() => {
    // resetAllMocks clears once-queues too, preventing accumulation across tests
    vi.resetAllMocks();

    // Default: auth ok, plan ok, business key ok
    mockIsApiKeyAuthError.mockReturnValue(false);
    mockAuthenticateApiKey.mockResolvedValue({
      plan: "pro",
      businessId: "biz-123",
    });
    mockCanUseApi.mockReturnValue(true);

    // Doc query chain: select().from().where().limit()
    mockLimit.mockResolvedValue([]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });

    // Lines query chain: select().from().where().orderBy()
    mockOrderBy.mockResolvedValue([]);
    mockLinesWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockLinesFrom.mockReturnValue({ where: mockLinesWhere });

    // First select() → doc chain, second select() → lines chain
    mockSelect
      .mockReturnValueOnce({ from: mockFrom })
      .mockReturnValueOnce({ from: mockLinesFrom });

    // withStatementTimeout wraps queries in db.transaction(cb) — wire the
    // tx callback to expose the same select chain configured above.
    mockTransaction.mockImplementation(async (cb) =>
      cb({ execute: mockTxExecute, select: mockSelect }),
    );
    mockTxExecute.mockResolvedValue(undefined);

    mockGetDb.mockReturnValue({
      select: mockSelect,
      transaction: mockTransaction,
    });
  });

  describe("UUID validation", () => {
    it("returns 400 for a non-UUID id", async () => {
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      const res = await GET(
        makeRequest("not-a-uuid"),
        makeParams("not-a-uuid"),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 400 for a SQL injection id", async () => {
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      const id = "'; DROP TABLE documents; --";
      const res = await GET(makeRequest(id), makeParams(id));
      expect(res.status).toBe(400);
    });

    it("returns 400 for an empty id", async () => {
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      const res = await GET(makeRequest(""), makeParams(""));
      expect(res.status).toBe(400);
    });

    it("does not query DB for invalid UUID", async () => {
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      await GET(makeRequest("invalid"), makeParams("invalid"));
      expect(mockGetDb).not.toHaveBeenCalled();
    });
  });

  describe("auth", () => {
    it("returns 401 when auth fails", async () => {
      mockIsApiKeyAuthError.mockReturnValue(true);
      mockAuthenticateApiKey.mockResolvedValue({
        error: "Unauthorized",
        status: 401,
      });
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      const res = await GET(makeRequest(VALID_UUID), makeParams(VALID_UUID));
      expect(res.status).toBe(401);
    });

    it("returns 402 when plan does not include API access", async () => {
      mockCanUseApi.mockReturnValue(false);
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      const res = await GET(makeRequest(VALID_UUID), makeParams(VALID_UUID));
      expect(res.status).toBe(402);
    });

    it("returns 403 when no businessId", async () => {
      mockAuthenticateApiKey.mockResolvedValue({
        plan: "pro",
        businessId: null,
      });
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      const res = await GET(makeRequest(VALID_UUID), makeParams(VALID_UUID));
      expect(res.status).toBe(403);
    });
  });

  describe("business logic", () => {
    it("returns 404 when document not found", async () => {
      mockLimit.mockResolvedValue([]);
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      const res = await GET(makeRequest(VALID_UUID), makeParams(VALID_UUID));
      expect(res.status).toBe(404);
    });

    it("returns 200 with document data and lines when found", async () => {
      const doc = {
        id: VALID_UUID,
        status: "ACCEPTED",
        publicRequest: { paymentMethod: "PC" },
        lotteryCode: null,
        voidedDocumentId: null,
      };
      const line = {
        description: "Prodotto",
        quantity: "1.000",
        grossUnitPrice: "5.00",
        vatCode: "22",
      };
      mockLimit.mockResolvedValue([doc]);
      mockOrderBy.mockResolvedValue([line]);
      const { GET } = await import("@/app/api/v1/receipts/[id]/route");
      const res = await GET(makeRequest(VALID_UUID), makeParams(VALID_UUID));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(VALID_UUID);
      expect(body.status).toBe("ACCEPTED");
      expect(body.paymentMethod).toBe("PC");
      expect(body.lines).toHaveLength(1);
      expect(body.total).toBe("5.00");
    });
  });
});
