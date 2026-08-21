// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockGeneratePdf } = vi.hoisted(() => ({
  mockGeneratePdf: vi.fn(),
}));

vi.mock("@/lib/pdf/commercial-document", () => ({
  generateCommercialDocumentPdf: (...args: unknown[]) =>
    mockGeneratePdf(...args),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import { generatePdfResponse } from "./generate-pdf-response";
import * as trustedAppUrl from "@/lib/trusted-app-url";

const MOCK_DATA = {
  doc: {
    id: "6f8f857a-2b2a-4c8b-9b2a-2b2a4c8b9b2a",
    kind: "SALE" as const,
    publicRequest: { paymentMethod: "PC" },
    adeProgressive: "DCW2026/5111-0001",
    adeTransactionId: "trx-0001",
    // Le due date sono deliberatamente diverse: il PDF deve stampare l'istante
    // registrato dall'AdE, non quello in cui abbiamo inserito la riga.
    createdAt: new Date("2026-02-23T10:29:57Z"),
    adeRegisteredAt: new Date("2026-02-23T10:30:00Z"),
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
      lineDiscount: "0",
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

  it("Content-Disposition è 'inline', non 'attachment' (Safari iOS: 'attachment' apre il download senza toolbar Fine/Stampa)", async () => {
    const res = await generatePdfResponse(MOCK_DATA);
    const disposition = res.headers.get("content-disposition");
    expect(disposition).toMatch(/^inline;/);
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

  it("chiama generateCommercialDocumentPdf con i dati del documento e dell'attività", async () => {
    await generatePdfResponse(MOCK_DATA);
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        businessName: "Negozio Test",
        vatNumber: "12345678901",
        adeProgressive: "DCW2026/5111-0001",
        adeTransactionId: "trx-0001",
        paymentMethod: "PC",
        kind: "SALE",
      }),
    );
  });

  it("stampa ade_registered_at, non il createdAt della riga", async () => {
    await generatePdfResponse(MOCK_DATA);
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        adeRegisteredAt: new Date("2026-02-23T10:30:00Z"),
      }),
    );
    expect(mockGeneratePdf.mock.calls[0][0]).not.toHaveProperty("createdAt");
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

  it("passa lotteryCode al generatore PDF quando presente in publicRequest", async () => {
    await generatePdfResponse({
      ...MOCK_DATA,
      doc: {
        ...MOCK_DATA.doc,
        publicRequest: { paymentMethod: "PE", lotteryCode: "YYWLR30G" },
      },
    });
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({ lotteryCode: "YYWLR30G" }),
    );
  });

  it("passa lotteryCode null al generatore PDF quando assente in publicRequest", async () => {
    await generatePdfResponse(MOCK_DATA);
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({ lotteryCode: null }),
    );
  });

  it("non passa publicUrl al generatore PDF quando includeQr è assente o false (route pubblica)", async () => {
    await generatePdfResponse(MOCK_DATA);
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({ publicUrl: null }),
    );

    await generatePdfResponse(MOCK_DATA, { includeQr: false });
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({ publicUrl: null }),
    );
  });

  it("passa publicUrl /r/<id> al generatore PDF quando includeQr è true (route autenticata)", async () => {
    await generatePdfResponse(MOCK_DATA, { includeQr: true });
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        publicUrl: expect.stringContaining(
          `/r/${MOCK_DATA.doc.id}`,
        ) as unknown as string,
      }),
    );
  });

  it("degrada a PDF senza QR (publicUrl null) se getTrustedAppUrl è malformato, senza far fallire la richiesta", async () => {
    const spy = vi
      .spyOn(trustedAppUrl, "getTrustedAppUrl")
      .mockImplementation(() => {
        throw new trustedAppUrl.TrustedAppUrlError("malformed");
      });

    const res = await generatePdfResponse(MOCK_DATA, { includeQr: true });

    expect(res.status).toBe(200);
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({ publicUrl: null }),
    );
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Ricevuta di annullamento
// ---------------------------------------------------------------------------

const VOIDED_SALE = {
  adeProgressive: "DCW2026/5111-0001",
  adeRegisteredAt: new Date("2026-02-23T10:30:00Z"),
};

const VOID_DATA = {
  ...MOCK_DATA,
  doc: {
    ...MOCK_DATA.doc,
    id: "9b2a4c8b-2b2a-4c8b-9b2a-6f8f857a2b2a",
    kind: "VOID" as const,
    adeProgressive: "DCW2026/5111-0002",
    adeRegisteredAt: new Date("2026-02-24T09:15:00Z"),
    publicRequest: null,
  },
  voidedSale: VOIDED_SALE,
};

describe("generatePdfResponse — annullo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeneratePdf.mockResolvedValue(Buffer.from("%PDF-void"));
  });

  it("costruisce un documento kind VOID col riferimento alla vendita annullata", async () => {
    await generatePdfResponse(VOID_DATA);
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "VOID",
        adeProgressive: "DCW2026/5111-0002",
        adeRegisteredAt: new Date("2026-02-24T09:15:00Z"),
        voidedDocument: {
          adeProgressive: "DCW2026/5111-0001",
          adeRegisteredAt: new Date("2026-02-23T10:30:00Z"),
        },
      }),
    );
  });

  it("non passa paymentMethod né lotteryCode su un annullo", async () => {
    await generatePdfResponse(VOID_DATA);
    const arg = mockGeneratePdf.mock.calls[0][0];
    expect(arg).not.toHaveProperty("paymentMethod");
    expect(arg).not.toHaveProperty("lotteryCode");
  });

  it("ristampa le righe ricevute (quelle della vendita annullata)", async () => {
    await generatePdfResponse(VOID_DATA);
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [expect.objectContaining({ description: "Prodotto A" })],
      }),
    );
  });

  it("degrada a 404 se un VOID arriva senza la vendita annullata, invece di stampare un annullo senza referenza", async () => {
    const res = await generatePdfResponse({ ...VOID_DATA, voidedSale: null });
    expect(res.status).toBe(404);
    expect(mockGeneratePdf).not.toHaveBeenCalled();
  });
});

describe("generatePdfResponse — messaggio di cortesia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeneratePdf.mockResolvedValue(Buffer.from("%PDF-note"));
  });

  it("passa la nota al renderer su una vendita", async () => {
    await generatePdfResponse({
      ...MOCK_DATA,
      footerNote: "Arrivederci e grazie!",
    });
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "SALE",
        footerNote: "Arrivederci e grazie!",
      }),
    );
  });

  it("passa null quando il chiamante non la fornisce (nessuna nota o gate chiuso)", async () => {
    await generatePdfResponse(MOCK_DATA);
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      expect.objectContaining({ footerNote: null }),
    );
  });

  // Su un annullo la nota non esiste nemmeno come campo: e' l'unione
  // discriminata a impedirlo, e il builder non deve aggirarla.
  it("non la passa su un annullo, nemmeno se il chiamante la fornisce", async () => {
    await generatePdfResponse({
      ...VOID_DATA,
      footerNote: "Arrivederci e grazie!",
    });
    expect(mockGeneratePdf.mock.calls[0][0]).not.toHaveProperty("footerNote");
  });
});
