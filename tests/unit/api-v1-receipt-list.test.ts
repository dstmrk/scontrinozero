// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const {
  mockAuthenticateApiKey,
  mockIsApiKeyAuthError,
  mockCanUseApi,
  mockRateLimiterCheck,
  mockGetDb,
  mockCountWhere,
  mockDocsOffset,
  mockDocsLimit,
  mockDocsOrderBy,
  mockDocsWhere,
  mockDocsFrom,
  mockCountFrom,
  mockLinesOrderBy,
  mockLinesWhere,
  mockLinesFrom,
  mockSelect,
} = vi.hoisted(() => ({
  mockAuthenticateApiKey: vi.fn(),
  mockIsApiKeyAuthError: vi.fn(),
  mockCanUseApi: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
  mockGetDb: vi.fn(),
  mockCountWhere: vi.fn(),
  mockDocsOffset: vi.fn(),
  mockDocsLimit: vi.fn(),
  mockDocsOrderBy: vi.fn(),
  mockDocsWhere: vi.fn(),
  mockDocsFrom: vi.fn(),
  mockCountFrom: vi.fn(),
  mockLinesOrderBy: vi.fn(),
  mockLinesWhere: vi.fn(),
  mockLinesFrom: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  authenticateApiKey: mockAuthenticateApiKey,
  isApiKeyAuthError: mockIsApiKeyAuthError,
}));

vi.mock("@/lib/plans", () => ({
  canUseApi: mockCanUseApi,
}));

vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

// Needed because route.ts imports emitReceiptForBusiness at module level
vi.mock("@/lib/services/receipt-service", () => ({
  emitReceiptForBusiness: vi.fn(),
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
  gte: vi.fn(),
  lt: vi.fn(),
  desc: vi.fn(),
  count: vi.fn(),
  inArray: vi.fn(),
  asc: vi.fn(),
}));

// --- Helpers ---

const BIZ_ID = "biz-123";
const API_KEY_ID = "key-456";
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL("https://example.com/api/v1/receipts");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

/** Sets up DB mocks for count + docs + lines (full happy-path chain). */
function setupDbMocks(
  total: number,
  docs: unknown[],
  lines: unknown[] = [],
): void {
  // 1. Count query: select({value}).from().where() → [{value: total}]
  mockCountWhere.mockResolvedValue([{ value: total }]);
  mockCountFrom.mockReturnValue({ where: mockCountWhere });

  // 2. Docs query: select({...}).from().where().orderBy().limit().offset() → docs
  mockDocsOffset.mockResolvedValue(docs);
  mockDocsLimit.mockReturnValue({ offset: mockDocsOffset });
  mockDocsOrderBy.mockReturnValue({ limit: mockDocsLimit });
  mockDocsWhere.mockReturnValue({ orderBy: mockDocsOrderBy });
  mockDocsFrom.mockReturnValue({ where: mockDocsWhere });

  // 3. Lines query (only reached when docs.length > 0):
  //    select().from().where().orderBy() → lines
  mockLinesOrderBy.mockResolvedValue(lines);
  mockLinesWhere.mockReturnValue({ orderBy: mockLinesOrderBy });
  mockLinesFrom.mockReturnValue({ where: mockLinesWhere });

  mockSelect
    .mockReturnValueOnce({ from: mockCountFrom }) // 1st call → count
    .mockReturnValueOnce({ from: mockDocsFrom }) // 2nd call → docs
    .mockReturnValueOnce({ from: mockLinesFrom }); // 3rd call → lines

  mockGetDb.mockReturnValue({ select: mockSelect });
}

/** Sets up DB mocks for empty result (count + docs only, no lines query). */
function setupDbMocksEmpty(total = 0): void {
  mockCountWhere.mockResolvedValue([{ value: total }]);
  mockCountFrom.mockReturnValue({ where: mockCountWhere });

  mockDocsOffset.mockResolvedValue([]);
  mockDocsLimit.mockReturnValue({ offset: mockDocsOffset });
  mockDocsOrderBy.mockReturnValue({ limit: mockDocsLimit });
  mockDocsWhere.mockReturnValue({ orderBy: mockDocsOrderBy });
  mockDocsFrom.mockReturnValue({ where: mockDocsWhere });

  mockSelect
    .mockReturnValueOnce({ from: mockCountFrom })
    .mockReturnValueOnce({ from: mockDocsFrom });

  mockGetDb.mockReturnValue({ select: mockSelect });
}

const VALID_FROM = "2026-04-01";
const VALID_TO = "2026-04-10";

describe("GET /api/v1/receipts (list)", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Default: auth ok, plan ok, business key
    mockIsApiKeyAuthError.mockReturnValue(false);
    mockAuthenticateApiKey.mockResolvedValue({
      plan: "pro",
      businessId: BIZ_ID,
      apiKey: { id: API_KEY_ID },
    });
    mockCanUseApi.mockReturnValue(true);
    mockRateLimiterCheck.mockReturnValue({ success: true });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  describe("auth", () => {
    it("returns 401 when API key is missing or invalid", async () => {
      mockIsApiKeyAuthError.mockReturnValue(true);
      mockAuthenticateApiKey.mockResolvedValue({
        error: "Unauthorized",
        status: 401,
      });

      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(makeRequest({ from: VALID_FROM, to: VALID_TO }));

      expect(res.status).toBe(401);
    });

    it("returns 402 when plan does not include API access", async () => {
      mockCanUseApi.mockReturnValue(false);

      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(makeRequest({ from: VALID_FROM, to: VALID_TO }));

      expect(res.status).toBe(402);
    });

    it("returns 403 when no businessId (management key)", async () => {
      mockAuthenticateApiKey.mockResolvedValue({
        plan: "pro",
        businessId: null,
        apiKey: { id: API_KEY_ID },
      });

      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(makeRequest({ from: VALID_FROM, to: VALID_TO }));

      expect(res.status).toBe(403);
    });
  });

  // ── Rate limit ─────────────────────────────────────────────────────────────

  describe("rate limit", () => {
    it("returns 429 when rate limit exceeded", async () => {
      mockRateLimiterCheck.mockReturnValue({
        success: false,
        resetAt: Date.now() + 60_000,
      });

      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(makeRequest({ from: VALID_FROM, to: VALID_TO }));

      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBeDefined();
    });
  });

  // ── Query param validation ────────────────────────────────────────────────

  describe("query param validation", () => {
    it("returns 400 when 'from' is missing", async () => {
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(makeRequest({ to: VALID_TO }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/from/i);
    });

    it("returns 400 when 'to' is missing", async () => {
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(makeRequest({ from: VALID_FROM }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/to/i);
    });

    it("returns 400 when 'from' has invalid format", async () => {
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(makeRequest({ from: "01/04/2026", to: VALID_TO }));

      expect(res.status).toBe(400);
    });

    it("returns 400 when 'to' has invalid format", async () => {
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(
        makeRequest({ from: VALID_FROM, to: "not-a-date" }),
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 when 'to' is before 'from'", async () => {
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(
        makeRequest({ from: "2026-04-10", to: "2026-04-01" }),
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/to/i);
    });

    it("returns 400 when range exceeds 31 days", async () => {
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(
        makeRequest({ from: "2026-01-01", to: "2026-02-10" }),
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/31/);
    });

    it("accepts range of exactly 31 days", async () => {
      setupDbMocksEmpty();
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(
        makeRequest({ from: "2026-04-01", to: "2026-05-02" }),
      );

      expect(res.status).toBe(200);
    });

    it("accepts same-day range (from == to)", async () => {
      setupDbMocksEmpty();
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(
        makeRequest({ from: "2026-04-10", to: "2026-04-10" }),
      );

      expect(res.status).toBe(200);
    });

    it("does not query DB when params are invalid", async () => {
      const { GET } = await import("@/app/api/v1/receipts/route");
      await GET(makeRequest({ to: VALID_TO }));

      expect(mockGetDb).not.toHaveBeenCalled();
    });
  });

  // ── Pagination ────────────────────────────────────────────────────────────

  describe("pagination", () => {
    it("caps limit to 100 when limit > 100 is requested", async () => {
      setupDbMocksEmpty(0);
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(
        makeRequest({ from: VALID_FROM, to: VALID_TO, limit: "500" }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pagination.limit).toBe(100);
    });

    it("uses default limit of 20 when not specified", async () => {
      setupDbMocksEmpty(0);
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(makeRequest({ from: VALID_FROM, to: VALID_TO }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pagination.limit).toBe(20);
    });

    it("sets hasNextPage true when total > page * limit", async () => {
      setupDbMocksEmpty(150);
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(
        makeRequest({
          from: VALID_FROM,
          to: VALID_TO,
          page: "1",
          limit: "100",
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pagination.hasNextPage).toBe(true);
      expect(body.pagination.total).toBe(150);
    });

    it("sets hasNextPage false on last page", async () => {
      setupDbMocksEmpty(5);
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(
        makeRequest({ from: VALID_FROM, to: VALID_TO, page: "1", limit: "20" }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pagination.hasNextPage).toBe(false);
    });

    it("returns correct page number in pagination", async () => {
      setupDbMocksEmpty(0);
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(
        makeRequest({ from: VALID_FROM, to: VALID_TO, page: "3", limit: "20" }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pagination.page).toBe(3);
    });
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  describe("happy path", () => {
    it("returns 200 with data array and pagination envelope", async () => {
      const doc = {
        id: VALID_UUID,
        kind: "SALE",
        status: "ACCEPTED",
        idempotencyKey: "ik-1",
        adeTransactionId: "tx-1",
        adeProgressive: "001",
        lotteryCode: null,
        publicRequest: { paymentMethod: "PC" },
        createdAt: new Date("2026-04-05T10:00:00.000Z"),
      };
      const line = {
        documentId: VALID_UUID,
        description: "Caffè",
        quantity: "1.000",
        grossUnitPrice: "1.50",
        vatCode: "22",
        lineIndex: 0,
      };
      setupDbMocks(1, [doc], [line]);

      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(makeRequest({ from: VALID_FROM, to: VALID_TO }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(VALID_UUID);
      expect(body.data[0].kind).toBe("SALE");
      expect(body.data[0].status).toBe("ACCEPTED");
      expect(body.data[0].paymentMethod).toBe("PC");
      expect(body.data[0].total).toBe("1.50");
      expect(body.data[0].lotteryCode).toBeNull();
      expect(body.data[0].lines).toBeUndefined();
      expect(body.pagination.total).toBe(1);
      expect(body.pagination.page).toBe(1);
    });

    it("includes CORS header in response", async () => {
      setupDbMocksEmpty();
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(makeRequest({ from: VALID_FROM, to: VALID_TO }));

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    it("returns empty data array when no receipts in range", async () => {
      setupDbMocksEmpty(0);
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(makeRequest({ from: VALID_FROM, to: VALID_TO }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
      expect(body.pagination.hasNextPage).toBe(false);
    });

    it("calculates total correctly from line quantity and price", async () => {
      const doc = {
        id: VALID_UUID,
        kind: "SALE",
        status: "ACCEPTED",
        idempotencyKey: "ik-2",
        adeTransactionId: null,
        adeProgressive: null,
        lotteryCode: null,
        publicRequest: { paymentMethod: "PE" },
        createdAt: new Date("2026-04-05T10:00:00.000Z"),
      };
      const lines = [
        {
          documentId: VALID_UUID,
          description: "A",
          quantity: "2.000",
          grossUnitPrice: "3.50",
          vatCode: "22",
          lineIndex: 0,
        },
        {
          documentId: VALID_UUID,
          description: "B",
          quantity: "1.000",
          grossUnitPrice: "1.00",
          vatCode: "10",
          lineIndex: 1,
        },
      ];
      setupDbMocks(1, [doc], lines);

      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(makeRequest({ from: VALID_FROM, to: VALID_TO }));

      const body = await res.json();
      // (2 * 3.50) + (1 * 1.00) = 8.00
      expect(body.data[0].total).toBe("8.00");
    });

    it("does not include lines[] in response items", async () => {
      const doc = {
        id: VALID_UUID,
        kind: "SALE",
        status: "ACCEPTED",
        idempotencyKey: "ik-3",
        adeTransactionId: null,
        adeProgressive: null,
        lotteryCode: null,
        publicRequest: { paymentMethod: "PC" },
        createdAt: new Date("2026-04-05T10:00:00.000Z"),
      };
      setupDbMocks(1, [doc], []);

      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(makeRequest({ from: VALID_FROM, to: VALID_TO }));

      const body = await res.json();
      expect(body.data[0].lines).toBeUndefined();
    });
  });

  // ── kind filter ───────────────────────────────────────────────────────────

  describe("kind filter", () => {
    it("accepts kind=SALE without error", async () => {
      setupDbMocksEmpty();
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(
        makeRequest({ from: VALID_FROM, to: VALID_TO, kind: "SALE" }),
      );

      expect(res.status).toBe(200);
    });

    it("accepts kind=VOID without error", async () => {
      setupDbMocksEmpty();
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(
        makeRequest({ from: VALID_FROM, to: VALID_TO, kind: "VOID" }),
      );

      expect(res.status).toBe(200);
    });

    it("returns all kinds when kind param is omitted", async () => {
      setupDbMocksEmpty();
      const { GET } = await import("@/app/api/v1/receipts/route");
      const res = await GET(makeRequest({ from: VALID_FROM, to: VALID_TO }));

      expect(res.status).toBe(200);
    });
  });
});
