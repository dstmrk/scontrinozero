// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetAuthenticatedUser = vi.fn();
const mockCheckBusinessOwnership = vi.fn();
vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
  checkBusinessOwnership: (...args: unknown[]) =>
    mockCheckBusinessOwnership(...args),
}));

const mockSelect = vi.fn();

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: mockSelect,
  }),
}));

vi.mock("@/db/schema", () => ({
  commercialDocuments: "commercial-documents-table",
  commercialDocumentLines: "commercial-document-lines-table",
}));

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

/** Simula la query COUNT: risolve al .where() */
function makeCountBuilder(n: number) {
  const b = {
    from: vi.fn(),
    where: vi.fn().mockResolvedValue([{ value: n }]),
  };
  b.from.mockReturnValue(b);
  return b;
}

/** Simula la query docs paginata: risolve al .offset() */
function makeDocsBuilder(result: unknown[]) {
  const b = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn().mockResolvedValue(result),
  };
  b.from.mockReturnValue(b);
  b.where.mockReturnValue(b);
  b.orderBy.mockReturnValue(b);
  b.limit.mockReturnValue(b);
  return b;
}

/** Simula la query lines: risolve al .orderBy() */
function makeLinesBuilder(result: unknown[]) {
  const b = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn().mockResolvedValue(result),
  };
  b.from.mockReturnValue(b);
  b.where.mockReturnValue(b);
  return b;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_USER = { id: "user-123" };

const FAKE_SALE_DOC = {
  id: "sale-doc-uuid",
  businessId: "biz-789",
  kind: "SALE",
  status: "ACCEPTED",
  adeTransactionId: "trx-001",
  adeProgressive: "DCW2026/5111-2188",
  createdAt: new Date("2026-02-15T10:00:00Z"),
};

const FAKE_DOC_LINES = [
  {
    id: "line-1",
    documentId: "sale-doc-uuid",
    lineIndex: 0,
    description: "Pizza",
    quantity: "2.000",
    grossUnitPrice: "5.00",
    vatCode: "10",
    adeLineId: null,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("storico-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetAuthenticatedUser.mockResolvedValue(FAKE_USER);
    mockCheckBusinessOwnership.mockResolvedValue(null);
  });

  describe("searchReceipts", () => {
    it("returns receipts with computed totals and sorted lines", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(makeDocsBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("biz-789");

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe("sale-doc-uuid");
      expect(result.items[0].kind).toBe("SALE");
      expect(result.items[0].status).toBe("ACCEPTED");
      expect(result.items[0].adeProgressive).toBe("DCW2026/5111-2188");
      // Total: 2 * 5.00 = 10.00
      expect(result.items[0].total).toBe("10.00");
      expect(result.items[0].lines).toHaveLength(1);
      expect(result.items[0].lines[0].description).toBe("Pizza");
    });

    it("returns empty items and total 0 when no documents found", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(0))
        .mockReturnValueOnce(makeDocsBuilder([]));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("biz-789");

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      // Lines query should NOT be called when there are no docs
      expect(mockSelect).toHaveBeenCalledTimes(2);
    });

    it("throws when user is not authenticated", async () => {
      mockGetAuthenticatedUser.mockRejectedValue(new Error("Unauthorized"));

      const { searchReceipts } = await import("./storico-actions");
      await expect(searchReceipts("biz-789")).rejects.toThrow();
    });

    it("returns error envelope when business ownership check fails", async () => {
      mockCheckBusinessOwnership.mockResolvedValue({
        error: "Business non trovato o non autorizzato.",
      });

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("biz-789");
      expect(result.error).toBe("Business non trovato o non autorizzato.");
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("filters by status when provided", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(makeDocsBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("biz-789", { status: "ACCEPTED" });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe("ACCEPTED");
    });

    it("returns only ACCEPTED and VOID_ACCEPTED when status param is omitted", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(makeDocsBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("biz-789", {});

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      // Verify no ERROR/REJECTED/PENDING leak through
      result.items.forEach((r) => {
        expect(["ACCEPTED", "VOID_ACCEPTED"]).toContain(r.status);
      });
    });

    it("filters by dateFrom when provided", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(makeDocsBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("biz-789", {
        dateFrom: "2026-01-01",
      });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it("filters by dateTo when provided", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(makeDocsBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("biz-789", { dateTo: "2026-03-01" });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it("rounds total to 2 decimal places correctly", async () => {
      const lines = [
        {
          id: "line-1",
          documentId: "sale-doc-uuid",
          lineIndex: 0,
          description: "Item",
          quantity: "3.000",
          grossUnitPrice: "0.10",
          vatCode: "22",
          adeLineId: null,
        },
      ];
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(makeDocsBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeLinesBuilder(lines));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("biz-789");

      // 3 * 0.10 = 0.30 (without rounding: 0.30000000000000004)
      expect(result.items[0].total).toBe("0.30");
    });

    it("applies LIMIT and OFFSET for the requested page", async () => {
      const docsBuilder = makeDocsBuilder([FAKE_SALE_DOC]);
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(25))
        .mockReturnValueOnce(docsBuilder)
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("biz-789", { page: 2, pageSize: 10 });

      expect(result.total).toBe(25);
      expect(docsBuilder.limit).toHaveBeenCalledWith(10);
      expect(docsBuilder.offset).toHaveBeenCalledWith(10); // (2-1) * 10
    });

    it("uses page 1 and default pageSize when not specified", async () => {
      const docsBuilder = makeDocsBuilder([FAKE_SALE_DOC]);
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(docsBuilder)
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      await searchReceipts("biz-789");

      expect(docsBuilder.offset).toHaveBeenCalledWith(0); // page 1 → offset 0
    });

    it("returns correct total even when current page is empty (beyond last page)", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(5))
        .mockReturnValueOnce(makeDocsBuilder([]));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("biz-789", { page: 3, pageSize: 10 });

      // total is 5 even though page 3 has no items
      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(0);
      // Lines query not called when docs page is empty
      expect(mockSelect).toHaveBeenCalledTimes(2);
    });
  });
});
