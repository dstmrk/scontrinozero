// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks  (vi.hoisted garantisce l'inizializzazione prima dei vi.mock factory)
// ---------------------------------------------------------------------------

const { mockGetUser, mockSelect, mockGeneratePdf } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelect: vi.fn(),
  mockGeneratePdf: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: mockSelect,
  }),
}));

vi.mock("@/db/schema", () => ({
  commercialDocuments: "commercial-documents-table",
  commercialDocumentLines: "commercial-document-lines-table",
  businesses: "businesses-table",
  profiles: "profiles-table",
}));

vi.mock("@/lib/pdf/generate-sale-receipt", () => ({
  generateSaleReceiptPdf: (...args: unknown[]) => mockGeneratePdf(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Drizzle query builder mock con metodi concatenabili.
 * Aggiunge innerJoin rispetto al builder di void-actions.test.ts.
 */
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

import { GET } from "./route";

const MOCK_USER = { id: "user-123" };

const MOCK_DOC = {
  id: "doc-456",
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
    documentId: "doc-456",
    lineIndex: 0,
    description: "Prodotto A",
    quantity: "1.000",
    grossUnitPrice: "10.00",
    vatCode: "22",
  },
  {
    id: "line-2",
    documentId: "doc-456",
    lineIndex: 1,
    description: "Prodotto B",
    quantity: "2.000",
    grossUnitPrice: "5.00",
    vatCode: "22",
  },
];

function makeRequest(documentId: string): Request {
  return new Request(`http://localhost/api/documents/${documentId}/pdf`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/documents/[documentId]/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockGeneratePdf.mockResolvedValue(Buffer.from("fake-pdf-content"));
    mockSelect
      .mockReturnValueOnce(
        makeSelectBuilder([{ doc: MOCK_DOC, biz: MOCK_BIZ }]),
      )
      .mockReturnValueOnce(makeSelectBuilder(MOCK_LINES));
  });

  it("ritorna 401 se non autenticato", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const res = await GET(makeRequest("doc-456"), {
      params: Promise.resolve({ documentId: "doc-456" }),
    });

    expect(res.status).toBe(401);
  });

  it("ritorna 404 se il documento non esiste", async () => {
    mockSelect.mockReset();
    mockSelect.mockReturnValueOnce(makeSelectBuilder([]));

    const res = await GET(makeRequest("doc-456"), {
      params: Promise.resolve({ documentId: "doc-456" }),
    });

    expect(res.status).toBe(404);
  });

  it("ritorna 404 se il documento appartiene ad altra attività (ownership check nel JOIN)", async () => {
    // JOIN che include il profilo utente non trova nulla se utente diverso
    mockSelect.mockReset();
    mockSelect.mockReturnValueOnce(makeSelectBuilder([]));

    const res = await GET(makeRequest("doc-456"), {
      params: Promise.resolve({ documentId: "doc-456" }),
    });

    expect(res.status).toBe(404);
  });

  it("ritorna 400 se kind ≠ SALE", async () => {
    mockSelect.mockReset();
    mockSelect.mockReturnValueOnce(
      makeSelectBuilder([
        { doc: { ...MOCK_DOC, kind: "VOID" }, biz: MOCK_BIZ },
      ]),
    );

    const res = await GET(makeRequest("doc-456"), {
      params: Promise.resolve({ documentId: "doc-456" }),
    });

    expect(res.status).toBe(400);
  });

  it("happy path: ritorna 200 con Content-Type application/pdf", async () => {
    const res = await GET(makeRequest("doc-456"), {
      params: Promise.resolve({ documentId: "doc-456" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("happy path: Content-Disposition contiene il progressivo AdE (sanitizzato)", async () => {
    const res = await GET(makeRequest("doc-456"), {
      params: Promise.resolve({ documentId: "doc-456" }),
    });

    const disposition = res.headers.get("content-disposition");
    // Il progressivo viene sanitizzato (/ → -) per essere usato come filename
    const safeProgressive = MOCK_DOC.adeProgressive.replace(/[/\\]/g, "-");
    expect(disposition).toContain(safeProgressive);
  });

  it("chiama generateSaleReceiptPdf con i dati del documento e dell'attività", async () => {
    await GET(makeRequest("doc-456"), {
      params: Promise.resolve({ documentId: "doc-456" }),
    });

    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        businessName: MOCK_BIZ.businessName,
        vatNumber: MOCK_BIZ.vatNumber,
        adeProgressive: MOCK_DOC.adeProgressive,
        adeTransactionId: MOCK_DOC.adeTransactionId,
        paymentMethod: "PC",
      }),
    );
  });
});
