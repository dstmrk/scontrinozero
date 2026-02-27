// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockGeneratePdf } = vi.hoisted(() => ({
  mockGeneratePdf: vi.fn(),
}));

vi.mock("@/lib/pdf/generate-sale-receipt", () => ({
  generateSaleReceiptPdf: (...args: unknown[]) => mockGeneratePdf(...args),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import { generatePdfResponse } from "./generate-pdf-response";

const MOCK_DATA = {
  doc: {
    publicRequest: { paymentMethod: "PC" },
    adeProgressive: "DCW2026/5111-0001",
    adeTransactionId: "trx-0001",
    createdAt: new Date("2026-02-23T10:30:00Z"),
  },
  biz: {
    businessName: "Negozio Test",
    vatNumber: "12345678901",
    address: "Via Roma 1",
    city: "Milano",
    province: "MI",
    zipCode: "20100",
  },
  lines: [
    {
      description: "Prodotto A",
      quantity: "1.000",
      grossUnitPrice: "10.00",
      vatCode: "22",
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generatePdfResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeneratePdf.mockResolvedValue(Buffer.from("fake-pdf"));
  });

  it("ritorna Response 200 con Content-Type application/pdf", async () => {
    const res = await generatePdfResponse(MOCK_DATA);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("Content-Disposition contiene il progressivo AdE sanitizzato (/ → -)", async () => {
    const res = await generatePdfResponse(MOCK_DATA);
    const disposition = res.headers.get("content-disposition");
    expect(disposition).toContain("DCW2026-5111-0001");
  });

  it("usa 'scontrino' come fallback nel filename se adeProgressive è null", async () => {
    const res = await generatePdfResponse({
      ...MOCK_DATA,
      doc: { ...MOCK_DATA.doc, adeProgressive: null },
    });
    expect(res.headers.get("content-disposition")).toContain("scontrino");
  });

  it("imposta Cache-Control private no-store", async () => {
    const res = await generatePdfResponse(MOCK_DATA);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("chiama generateSaleReceiptPdf con i dati del documento e dell'attività", async () => {
    await generatePdfResponse(MOCK_DATA);
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        businessName: "Negozio Test",
        vatNumber: "12345678901",
        adeProgressive: "DCW2026/5111-0001",
        adeTransactionId: "trx-0001",
        paymentMethod: "PC",
      }),
    );
  });

  it("usa paymentMethod PE quando specificato nel publicRequest", async () => {
    await generatePdfResponse({
      ...MOCK_DATA,
      doc: { ...MOCK_DATA.doc, publicRequest: { paymentMethod: "PE" } },
    });
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "PE" }),
    );
  });

  it("usa paymentMethod PC come default se publicRequest è null", async () => {
    await generatePdfResponse({
      ...MOCK_DATA,
      doc: { ...MOCK_DATA.doc, publicRequest: null },
    });
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "PC" }),
    );
  });

  it("usa paymentMethod PC come default per valori non riconosciuti", async () => {
    await generatePdfResponse({
      ...MOCK_DATA,
      doc: { ...MOCK_DATA.doc, publicRequest: { paymentMethod: "UNKNOWN" } },
    });
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "PC" }),
    );
  });
});
