// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({ select: mockSelect }),
}));

vi.mock("@/db/schema", () => ({
  commercialDocuments: "commercial-documents-table",
  commercialDocumentLines: "commercial-document-lines-table",
  businesses: "businesses-table",
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSelectBuilder(result: unknown[]) {
  const builder = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockResolvedValue(result),
  };
  builder.from.mockReturnValue(builder);
  builder.innerJoin.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  return builder;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import { fetchPublicReceipt } from "./fetch-public-receipt";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

const MOCK_DOC = {
  id: VALID_UUID,
  businessId: "biz-789",
  kind: "SALE",
  status: "ACCEPTED",
  adeTransactionId: "trx-0001",
  adeProgressive: "DCW2026/5111-0001",
  createdAt: new Date("2026-02-23T10:30:00Z"),
  publicRequest: { paymentMethod: "PC" },
};

const MOCK_BIZ = {
  id: "biz-789",
  businessName: "Negozio Test",
  vatNumber: "12345678901",
  address: "Via Roma 1",
  city: "Milano",
  province: "MI",
  zipCode: "20100",
};

const MOCK_LINES = [
  {
    id: "line-1",
    documentId: VALID_UUID,
    lineIndex: 0,
    description: "Prodotto A",
    quantity: "1.000",
    grossUnitPrice: "10.00",
    vatCode: "22",
    adeLineId: null,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchPublicReceipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect
      .mockReturnValueOnce(
        makeSelectBuilder([{ doc: MOCK_DOC, biz: MOCK_BIZ }]),
      )
      .mockReturnValueOnce(makeSelectBuilder(MOCK_LINES));
  });

  it("ritorna null per UUID non valido (stringa arbitraria)", async () => {
    const result = await fetchPublicReceipt("not-a-uuid");
    expect(result).toBeNull();
  });

  it("ritorna null per UUID non valido (injection attempt)", async () => {
    const result = await fetchPublicReceipt("' OR 1=1 --");
    expect(result).toBeNull();
  });

  it("non interroga il DB se l'UUID non è valido", async () => {
    await fetchPublicReceipt("invalid");
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("ritorna null se il documento non esiste nel DB", async () => {
    mockSelect.mockReset();
    mockSelect.mockReturnValueOnce(makeSelectBuilder([]));

    const result = await fetchPublicReceipt(VALID_UUID);
    expect(result).toBeNull();
  });

  it("ritorna null se kind ≠ SALE", async () => {
    mockSelect.mockReset();
    mockSelect.mockReturnValueOnce(
      makeSelectBuilder([
        { doc: { ...MOCK_DOC, kind: "VOID" }, biz: MOCK_BIZ },
      ]),
    );

    const result = await fetchPublicReceipt(VALID_UUID);
    expect(result).toBeNull();
  });

  it("ritorna null se status ≠ ACCEPTED", async () => {
    mockSelect.mockReset();
    mockSelect.mockReturnValueOnce(
      makeSelectBuilder([
        { doc: { ...MOCK_DOC, status: "PENDING" }, biz: MOCK_BIZ },
      ]),
    );

    const result = await fetchPublicReceipt(VALID_UUID);
    expect(result).toBeNull();
  });

  it("ritorna null se status = REJECTED", async () => {
    mockSelect.mockReset();
    mockSelect.mockReturnValueOnce(
      makeSelectBuilder([
        { doc: { ...MOCK_DOC, status: "REJECTED" }, biz: MOCK_BIZ },
      ]),
    );

    const result = await fetchPublicReceipt(VALID_UUID);
    expect(result).toBeNull();
  });

  it("happy path: ritorna doc, biz e lines per un SALE ACCEPTED", async () => {
    const result = await fetchPublicReceipt(VALID_UUID);

    expect(result).not.toBeNull();
    expect(result?.doc.id).toBe(VALID_UUID);
    expect(result?.biz.businessName).toBe("Negozio Test");
    expect(result?.lines).toHaveLength(1);
    expect(result?.lines[0].description).toBe("Prodotto A");
  });

  it("accetta UUID in maiuscolo (case-insensitive)", async () => {
    const result = await fetchPublicReceipt(VALID_UUID.toUpperCase());
    expect(result).not.toBeNull();
  });
});
