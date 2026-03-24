// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetAuthenticatedUser = vi.fn();
vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
}));

const mockSelect = vi.fn();

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: mockSelect,
  }),
}));

vi.mock("@/db/schema", () => ({
  profiles: "profiles-table",
  businesses: "businesses-table",
  commercialDocuments: "commercial-documents-table",
  commercialDocumentLines: "commercial-document-lines-table",
  catalogItems: "catalog-items-table",
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

const FAKE_PROFILE = {
  id: "profile-abc",
  authUserId: "user-123",
  email: "test@example.com",
  firstName: "Mario",
  lastName: "Rossi",
  plan: "trial",
  trialStartedAt: new Date("2026-03-01T00:00:00Z"),
  planExpiresAt: null,
  partitaIva: null,
  termsAcceptedAt: null,
  termsVersion: null,
  createdAt: new Date("2026-03-01T00:00:00Z"),
  updatedAt: new Date("2026-03-01T00:00:00Z"),
};

const FAKE_BUSINESS = {
  id: "biz-789",
  profileId: "profile-abc",
  businessName: "Mario Rossi Formaggi",
  vatNumber: "12345678901",
  fiscalCode: null,
  address: "Via Roma 1",
  streetNumber: null,
  city: "Milano",
  province: "MI",
  zipCode: "20100",
  preferredVatCode: "22",
  createdAt: new Date("2026-03-01T00:00:00Z"),
  updatedAt: new Date("2026-03-01T00:00:00Z"),
};

const FAKE_DOC = {
  id: "doc-001",
  businessId: "biz-789",
  kind: "SALE",
  status: "ACCEPTED",
  adeProgressive: "DCW2026/001",
  adeTransactionId: "trx-001",
  idempotencyKey: "idem-001",
  publicRequest: null,
  adeRequest: null,
  adeResponse: null,
  createdAt: new Date("2026-03-05T10:00:00Z"),
  updatedAt: new Date("2026-03-05T10:00:00Z"),
};

const FAKE_LINE = {
  id: "line-001",
  documentId: "doc-001",
  lineIndex: 0,
  description: "Parmigiano",
  quantity: "2.000",
  grossUnitPrice: "8.50",
  vatCode: "22",
  adeLineId: null,
};

const FAKE_CATALOG_ITEM = {
  id: "cat-001",
  businessId: "biz-789",
  description: "Parmigiano",
  defaultPrice: "8.50",
  defaultVatCode: "22",
  createdAt: new Date("2026-03-01T00:00:00Z"),
  updatedAt: new Date("2026-03-01T00:00:00Z"),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("export-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue(FAKE_USER);
  });

  describe("exportUserData", () => {
    it("returns all user data with profile, business, receipts and catalog", async () => {
      mockSelect
        .mockReturnValueOnce(makeSelectBuilder([FAKE_PROFILE]))
        .mockReturnValueOnce(makeSelectBuilder([FAKE_BUSINESS]))
        .mockReturnValueOnce(makeSelectBuilder([FAKE_DOC]))
        .mockReturnValueOnce(makeSelectBuilder([FAKE_LINE]))
        .mockReturnValueOnce(makeSelectBuilder([FAKE_CATALOG_ITEM]));

      const { exportUserData } = await import("./export-actions");
      const result = await exportUserData();

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.profile.email).toBe("test@example.com");
      expect(result.data?.profile.firstName).toBe("Mario");
      expect(result.data?.business?.vatNumber).toBe("12345678901");
      expect(result.data?.receipts).toHaveLength(1);
      expect(result.data?.receipts[0].id).toBe("doc-001");
      expect(result.data?.receipts[0].lines).toHaveLength(1);
      expect(result.data?.receipts[0].lines[0].description).toBe("Parmigiano");
      expect(result.data?.catalogItems).toHaveLength(1);
      expect(result.data?.catalogItems[0].description).toBe("Parmigiano");
    });

    it("includes exportedAt as ISO string in the response", async () => {
      mockSelect
        .mockReturnValueOnce(makeSelectBuilder([FAKE_PROFILE]))
        .mockReturnValueOnce(makeSelectBuilder([FAKE_BUSINESS]))
        .mockReturnValueOnce(makeSelectBuilder([FAKE_DOC]))
        .mockReturnValueOnce(makeSelectBuilder([FAKE_LINE]))
        .mockReturnValueOnce(makeSelectBuilder([FAKE_CATALOG_ITEM]));

      const { exportUserData } = await import("./export-actions");
      const result = await exportUserData();

      expect(typeof result.data?.exportedAt).toBe("string");
      expect(result.data?.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("returns error when not authenticated", async () => {
      mockGetAuthenticatedUser.mockRejectedValue(new Error("Non autenticato"));

      const { exportUserData } = await import("./export-actions");
      const result = await exportUserData();

      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
    });

    it("returns error when profile not found", async () => {
      mockSelect.mockReturnValueOnce(makeSelectBuilder([]));

      const { exportUserData } = await import("./export-actions");
      const result = await exportUserData();

      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
    });

    it("handles user with no business: returns null business and empty lists", async () => {
      mockSelect
        .mockReturnValueOnce(makeSelectBuilder([FAKE_PROFILE]))
        .mockReturnValueOnce(makeSelectBuilder([])); // no business

      const { exportUserData } = await import("./export-actions");
      const result = await exportUserData();

      expect(result.error).toBeUndefined();
      expect(result.data?.business).toBeNull();
      expect(result.data?.receipts).toEqual([]);
      expect(result.data?.catalogItems).toEqual([]);
    });

    it("handles user with no receipts: skips lines query and returns empty array", async () => {
      mockSelect
        .mockReturnValueOnce(makeSelectBuilder([FAKE_PROFILE]))
        .mockReturnValueOnce(makeSelectBuilder([FAKE_BUSINESS]))
        .mockReturnValueOnce(makeSelectBuilder([])) // no documents
        .mockReturnValueOnce(makeSelectBuilder([FAKE_CATALOG_ITEM]));

      const { exportUserData } = await import("./export-actions");
      const result = await exportUserData();

      expect(result.error).toBeUndefined();
      expect(result.data?.receipts).toEqual([]);
      expect(result.data?.catalogItems).toHaveLength(1);
      // Lines select should NOT be called (docs was empty)
      expect(mockSelect).toHaveBeenCalledTimes(4);
    });

    it("embeds lines inside their parent receipt", async () => {
      const anotherDoc = { ...FAKE_DOC, id: "doc-002" };
      const lineForDoc2 = {
        ...FAKE_LINE,
        id: "line-002",
        documentId: "doc-002",
      };

      mockSelect
        .mockReturnValueOnce(makeSelectBuilder([FAKE_PROFILE]))
        .mockReturnValueOnce(makeSelectBuilder([FAKE_BUSINESS]))
        .mockReturnValueOnce(makeSelectBuilder([FAKE_DOC, anotherDoc]))
        .mockReturnValueOnce(makeSelectBuilder([FAKE_LINE, lineForDoc2]))
        .mockReturnValueOnce(makeSelectBuilder([]));

      const { exportUserData } = await import("./export-actions");
      const result = await exportUserData();

      const receipt1 = result.data?.receipts.find((r) => r.id === "doc-001");
      const receipt2 = result.data?.receipts.find((r) => r.id === "doc-002");

      expect(receipt1?.lines).toHaveLength(1);
      expect(receipt1?.lines[0].description).toBe("Parmigiano");
      expect(receipt2?.lines).toHaveLength(1);
    });
  });
});
