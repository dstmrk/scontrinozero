// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const {
  mockGetAuthenticatedUser,
  mockCheckBusinessOwnership,
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
  mockGetAuthenticatedUser: vi.fn(),
  mockCheckBusinessOwnership: vi.fn(),
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

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
  checkBusinessOwnership: mockCheckBusinessOwnership,
}));

vi.mock("@/db", () => ({
  getDb: mockGetDb,
}));

vi.mock("@/db/schema", () => ({
  commercialDocuments: "commercial-documents-table",
  commercialDocumentLines: "commercial-document-lines-table",
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn(),
  gte: vi.fn((col: unknown, val: unknown) => ({ col, val, op: "gte" })),
  lt: vi.fn((col: unknown, val: unknown) => ({ col, val, op: "lt" })),
  desc: vi.fn(),
  count: vi.fn(),
  inArray: vi.fn(),
  asc: vi.fn(),
}));

// --- Helpers ---

const BIZ_ID = "biz-abc";
const USER_ID = "user-xyz";

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

// --- Tests ---

describe("searchReceipts server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue({ id: USER_ID });
    mockCheckBusinessOwnership.mockResolvedValue(null); // null = authorized
    setupDbMocksEmpty();
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ── P1-05: UTC day-boundary normalization ─────────────────────────────────

  describe("date filter UTC normalization (P1-05)", () => {
    // Note: commercialDocuments is mocked as a plain string so .createdAt is
    // undefined. We check only the Date argument (index [1]) from mock.calls
    // because that is what the UTC-normalization fix affects.

    it("constructs dateFrom using UTC midnight (T00:00:00.000Z)", async () => {
      const { searchReceipts } = await import("@/server/storico-actions");
      const { gte } = await import("drizzle-orm");
      const gteMock = gte as ReturnType<typeof vi.fn>;

      await searchReceipts(BIZ_ID, { dateFrom: "2026-04-01" });

      expect(gteMock).toHaveBeenCalled();
      expect(gteMock.mock.calls[0]?.[1]).toEqual(
        new Date("2026-04-01T00:00:00.000Z"),
      );
    });

    it("constructs dateTo as start of next UTC day (exclusive upper bound)", async () => {
      const { searchReceipts } = await import("@/server/storico-actions");
      const { lt } = await import("drizzle-orm");
      const ltMock = lt as ReturnType<typeof vi.fn>;

      await searchReceipts(BIZ_ID, { dateTo: "2026-04-10" });

      // dateTo "2026-04-10" → exclusive upper = "2026-04-11T00:00:00.000Z"
      expect(ltMock).toHaveBeenCalled();
      expect(ltMock.mock.calls[0]?.[1]).toEqual(
        new Date("2026-04-11T00:00:00.000Z"),
      );
    });

    it("handles Dec 31 → Jan 1 rollover correctly (UTC)", async () => {
      const { searchReceipts } = await import("@/server/storico-actions");
      const { lt } = await import("drizzle-orm");
      const ltMock = lt as ReturnType<typeof vi.fn>;

      await searchReceipts(BIZ_ID, { dateTo: "2026-12-31" });

      // Should roll over to 2027-01-01, not 2026-12-32
      expect(ltMock).toHaveBeenCalled();
      expect(ltMock.mock.calls[0]?.[1]).toEqual(
        new Date("2027-01-01T00:00:00.000Z"),
      );
    });

    it("applies no date conditions when dateFrom/dateTo are omitted", async () => {
      const { searchReceipts } = await import("@/server/storico-actions");
      const { gte, lt } = await import("drizzle-orm");

      await searchReceipts(BIZ_ID, {});

      expect(gte).not.toHaveBeenCalled();
      expect(lt).not.toHaveBeenCalled();
    });

    it("applies both dateFrom and dateTo when both are provided", async () => {
      const { searchReceipts } = await import("@/server/storico-actions");
      const { gte, lt } = await import("drizzle-orm");
      const gteMock = gte as ReturnType<typeof vi.fn>;
      const ltMock = lt as ReturnType<typeof vi.fn>;

      await searchReceipts(BIZ_ID, {
        dateFrom: "2026-04-01",
        dateTo: "2026-04-10",
      });

      expect(gteMock).toHaveBeenCalled();
      expect(gteMock.mock.calls[0]?.[1]).toEqual(
        new Date("2026-04-01T00:00:00.000Z"),
      );
      expect(ltMock).toHaveBeenCalled();
      expect(ltMock.mock.calls[0]?.[1]).toEqual(
        new Date("2026-04-11T00:00:00.000Z"),
      );
    });
  });

  // ── Input validation: date format + pagination clamping (P1-01, P1-02) ─────

  describe("input validation (P1-01, P1-02)", () => {
    it("ignores dateFrom with invalid format (not yyyy-MM-dd) — no gte condition", async () => {
      const { searchReceipts } = await import("@/server/storico-actions");
      const { gte } = await import("drizzle-orm");

      await searchReceipts(BIZ_ID, { dateFrom: "abc" });

      expect(gte).not.toHaveBeenCalled();
    });

    it("ignores dateFrom with impossible date value (e.g. 2026-99-99) — no gte condition", async () => {
      const { searchReceipts } = await import("@/server/storico-actions");
      const { gte } = await import("drizzle-orm");

      await searchReceipts(BIZ_ID, { dateFrom: "2026-99-99" });

      expect(gte).not.toHaveBeenCalled();
    });

    it("ignores dateTo with invalid format — no lt condition", async () => {
      const { searchReceipts } = await import("@/server/storico-actions");
      const { lt } = await import("drizzle-orm");

      await searchReceipts(BIZ_ID, { dateTo: "not-a-date" });

      expect(lt).not.toHaveBeenCalled();
    });

    it("clamps pageSize > MAX_PAGE_SIZE (100) to 100", async () => {
      const { searchReceipts } = await import("@/server/storico-actions");

      await searchReceipts(BIZ_ID, { pageSize: 9999 });

      // .limit() is called with the clamped value (100), not the raw input
      expect(mockDocsLimit).toHaveBeenCalledWith(100);
    });

    it("clamps pageSize = 0 to 1", async () => {
      const { searchReceipts } = await import("@/server/storico-actions");

      await searchReceipts(BIZ_ID, { pageSize: 0 });

      expect(mockDocsLimit).toHaveBeenCalledWith(1);
    });

    it("clamps page = -5 to 1 — offset becomes 0", async () => {
      const { searchReceipts } = await import("@/server/storico-actions");

      await searchReceipts(BIZ_ID, { page: -5 });

      // With page clamped to 1: offset = (1-1) * pageSize = 0
      expect(mockDocsOffset).toHaveBeenCalledWith(0);
    });
  });

  // ── Auth / ownership ──────────────────────────────────────────────────────

  describe("auth and ownership", () => {
    it("throws when user is not owner of business", async () => {
      mockCheckBusinessOwnership.mockResolvedValue({
        error: "Non autorizzato.",
        status: 403,
      });

      const { searchReceipts } = await import("@/server/storico-actions");

      await expect(searchReceipts(BIZ_ID)).rejects.toThrow("Non autorizzato.");
    });

    it("returns result when user is authorized", async () => {
      const { searchReceipts } = await import("@/server/storico-actions");

      const result = await searchReceipts(BIZ_ID);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});
