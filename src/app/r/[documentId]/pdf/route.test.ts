// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockFetchPublicReceipt, mockGeneratePdf } = vi.hoisted(() => ({
  mockFetchPublicReceipt: vi.fn(),
  mockGeneratePdf: vi.fn(),
}));

vi.mock("@/lib/receipts/fetch-public-receipt", () => ({
  fetchPublicReceipt: (...args: unknown[]) => mockFetchPublicReceipt(...args),
}));

vi.mock("@/lib/pdf/generate-sale-receipt", () => ({
  generateSaleReceiptPdf: (...args: unknown[]) => mockGeneratePdf(...args),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import { GET } from "./route";

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
    adeLineId: null,
  },
];

function makeRequest(documentId: string): Request {
  return new Request(`http://localhost/r/${documentId}/pdf`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /r/[documentId]/pdf (public)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeneratePdf.mockResolvedValue(Buffer.from("fake-pdf-content"));
    mockFetchPublicReceipt.mockResolvedValue({
      doc: MOCK_DOC,
      biz: MOCK_BIZ,
      lines: MOCK_LINES,
    });
  });

  it("ritorna 404 se fetchPublicReceipt ritorna null (doc non trovato o UUID invalido)", async () => {
    mockFetchPublicReceipt.mockResolvedValueOnce(null);

    const res = await GET(makeRequest("doc-456"), {
      params: Promise.resolve({ documentId: "doc-456" }),
    });

    expect(res.status).toBe(404);
  });

  it("happy path: ritorna 200 con Content-Type application/pdf", async () => {
    const res = await GET(makeRequest("doc-456"), {
      params: Promise.resolve({ documentId: "doc-456" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("Content-Disposition contiene il progressivo AdE (sanitizzato)", async () => {
    const res = await GET(makeRequest("doc-456"), {
      params: Promise.resolve({ documentId: "doc-456" }),
    });

    const disposition = res.headers.get("content-disposition");
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

  it("imposta Cache-Control private no-store", async () => {
    const res = await GET(makeRequest("doc-456"), {
      params: Promise.resolve({ documentId: "doc-456" }),
    });

    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("usa paymentMethod PE dal publicRequest", async () => {
    mockFetchPublicReceipt.mockResolvedValueOnce({
      doc: { ...MOCK_DOC, publicRequest: { paymentMethod: "PE" } },
      biz: MOCK_BIZ,
      lines: MOCK_LINES,
    });

    await GET(makeRequest("doc-456"), {
      params: Promise.resolve({ documentId: "doc-456" }),
    });

    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "PE" }),
    );
  });

  it("non richiede autenticazione — nessuna dipendenza da Supabase auth", async () => {
    // Il route usa solo fetchPublicReceipt — nessun import Supabase
    // Il test passa senza mock Supabase → verifica l'assenza di auth
    const res = await GET(makeRequest("doc-456"), {
      params: Promise.resolve({ documentId: "doc-456" }),
    });

    expect(res.status).toBe(200);
  });
});
