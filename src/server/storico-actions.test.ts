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
// Helpers
// ---------------------------------------------------------------------------

function makeSelectBuilder(result: unknown[]) {
  const builder = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockResolvedValue(result),
  };
  builder.from.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  return builder;
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
        .mockReturnValueOnce(makeSelectBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeSelectBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("biz-789");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("sale-doc-uuid");
      expect(result[0].kind).toBe("SALE");
      expect(result[0].status).toBe("ACCEPTED");
      expect(result[0].adeProgressive).toBe("DCW2026/5111-2188");
      // Total: 2 * 5.00 = 10.00
      expect(result[0].total).toBe("10.00");
      expect(result[0].lines).toHaveLength(1);
      expect(result[0].lines[0].description).toBe("Pizza");
    });

    it("returns empty array when no documents found", async () => {
      mockSelect.mockReturnValueOnce(makeSelectBuilder([]));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("biz-789");

      expect(result).toEqual([]);
      // Lines query should NOT be called when there are no docs
      expect(mockSelect).toHaveBeenCalledTimes(1);
    });

    it("throws when user is not authenticated", async () => {
      mockGetAuthenticatedUser.mockRejectedValue(new Error("Unauthorized"));

      const { searchReceipts } = await import("./storico-actions");
      await expect(searchReceipts("biz-789")).rejects.toThrow();
    });

    it("throws when business ownership check fails", async () => {
      mockCheckBusinessOwnership.mockResolvedValue({
        error: "Business non trovato o non autorizzato.",
      });

      const { searchReceipts } = await import("./storico-actions");
      await expect(searchReceipts("biz-789")).rejects.toThrow("autorizzato");
    });

    it("filters by status when provided", async () => {
      mockSelect
        .mockReturnValueOnce(makeSelectBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeSelectBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("biz-789", { status: "ACCEPTED" });

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("ACCEPTED");
    });

    it("returns all statuses when status param is omitted", async () => {
      mockSelect
        .mockReturnValueOnce(makeSelectBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeSelectBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("biz-789", {});

      expect(result).toHaveLength(1);
    });

    it("filters by dateFrom when provided", async () => {
      mockSelect
        .mockReturnValueOnce(makeSelectBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeSelectBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("biz-789", {
        dateFrom: "2026-01-01",
      });

      expect(result).toHaveLength(1);
    });

    it("filters by dateTo when provided", async () => {
      mockSelect
        .mockReturnValueOnce(makeSelectBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeSelectBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("biz-789", { dateTo: "2026-03-01" });

      expect(result).toHaveLength(1);
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
        .mockReturnValueOnce(makeSelectBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeSelectBuilder(lines));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("biz-789");

      // 3 * 0.10 = 0.30 (without rounding: 0.30000000000000004)
      expect(result[0].total).toBe("0.30");
    });
  });
});
