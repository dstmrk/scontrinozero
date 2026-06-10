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
  commercialDocuments: {
    id: "cd.id",
    kind: "cd.kind",
    status: "cd.status",
    businessId: "cd.businessId",
    adeTransactionId: "cd.adeTransactionId",
  },
  commercialDocumentLines: {
    documentId: "cdl.documentId",
    lineIndex: "cdl.lineIndex",
  },
  businesses: { id: "biz.id" },
}));

// Mock di `and`/`eq` per ispezionare la condizione WHERE: il filtro
// kind='SALE' AND status='ACCEPTED' deve vivere nel WHERE, non in un
// filtro JS post-read.
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ __op: "eq", col, val })),
  and: vi.fn((...conds) => ({ __op: "and", conds })),
  isNotNull: vi.fn((col) => ({ __op: "isNotNull", col })),
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

import { and, eq, isNotNull } from "drizzle-orm";
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

  it("ritorna null se la query filtrata non trova un SALE ACCEPTED", async () => {
    // Il filtro kind/status vive nel WHERE: un documento non-SALE o
    // non-ACCEPTED non viene restituito dal DB → zero righe.
    mockSelect.mockReset();
    mockSelect.mockReturnValueOnce(makeSelectBuilder([]));

    const result = await fetchPublicReceipt(VALID_UUID);
    expect(result).toBeNull();
  });

  it("applica il filtro kind='SALE' AND status='ACCEPTED' AND adeTransactionId IS NOT NULL nel WHERE", async () => {
    mockSelect.mockReset();
    const docBuilder = makeSelectBuilder([{ doc: MOCK_DOC, biz: MOCK_BIZ }]);
    mockSelect
      .mockReturnValueOnce(docBuilder)
      .mockReturnValueOnce(makeSelectBuilder(MOCK_LINES));

    await fetchPublicReceipt(VALID_UUID);

    // Il WHERE della query documento è un AND di id + kind + status +
    // adeTransactionId IS NOT NULL (REVIEW.md #7: nessun documento ACCEPTED
    // senza identificativo fiscale deve essere servito pubblicamente).
    expect(docBuilder.where).toHaveBeenCalledWith({
      __op: "and",
      conds: [
        { __op: "eq", col: "cd.id", val: VALID_UUID },
        { __op: "eq", col: "cd.kind", val: "SALE" },
        { __op: "eq", col: "cd.status", val: "ACCEPTED" },
        { __op: "isNotNull", col: "cd.adeTransactionId" },
      ],
    });
    expect(eq).toHaveBeenCalledWith("cd.kind", "SALE");
    expect(eq).toHaveBeenCalledWith("cd.status", "ACCEPTED");
    expect(isNotNull).toHaveBeenCalledWith("cd.adeTransactionId");
    expect(and).toHaveBeenCalled();
  });

  it("ritorna null per un SALE ACCEPTED senza adeTransactionId (filtro IS NOT NULL nel WHERE)", async () => {
    // Un documento ACCEPTED ma con adeTransactionId = null è escluso dal WHERE
    // (isNotNull), quindi il DB restituisce zero righe: la pagina pubblica non
    // mostra mai uno scontrino privo di identificativo fiscale AdE.
    mockSelect.mockReset();
    mockSelect.mockReturnValueOnce(makeSelectBuilder([]));

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

  it("effettua una nuova query DB ad ogni chiamata (nessuna cache tra request)", async () => {
    // Reset e prepara due set di risultati distinti
    mockSelect.mockReset();
    mockSelect
      .mockReturnValueOnce(
        makeSelectBuilder([{ doc: MOCK_DOC, biz: MOCK_BIZ }]),
      )
      .mockReturnValueOnce(makeSelectBuilder(MOCK_LINES))
      // Seconda chiamata: il documento ora è REJECTED, quindi il filtro nel
      // WHERE lo esclude → la query restituisce zero righe (fresh read).
      .mockReturnValueOnce(makeSelectBuilder([]));

    const first = await fetchPublicReceipt(VALID_UUID);
    const second = await fetchPublicReceipt(VALID_UUID);

    // Prima chiamata: documento ACCEPTED → ritorna dati
    expect(first).not.toBeNull();
    // Seconda chiamata: documento non più ACCEPTED → null (fresh read)
    expect(second).toBeNull();
  });
});
