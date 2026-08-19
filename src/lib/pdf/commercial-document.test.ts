// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  extractPdfText,
  extractPdfTextRuns,
} from "../../../tests/_helpers/pdf-text";
import {
  generateCommercialDocumentPdf,
  type SaleDocumentPdfData,
  type VoidDocumentPdfData,
} from "./commercial-document";

/** Altezza pagina dal `/MediaBox`, sempre in chiaro nel dizionario pagina. */
function pdfPageHeight(buf: Buffer): number {
  const m = buf.toString("latin1").match(/\/MediaBox \[0 0 \d+ (\d+)\]/);
  return m ? Number.parseInt(m[1], 10) : 0;
}

/** Numero di pagine del PDF: la stima d'altezza non deve mai sottostimare. */
function pdfPageCount(buf: Buffer): number {
  return buf.toString("latin1").split("/Type /Page\n").length - 1;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_DATA: SaleDocumentPdfData = {
  kind: "SALE",
  businessName: "Trattoria da Mario",
  vatNumber: "12345678901",
  address: "Via Roma 1",
  city: "Milano",
  province: "MI",
  zipCode: "20100",
  lines: [
    {
      description: "Pizza Margherita",
      quantity: 2,
      grossUnitPrice: 8.5,
      vatCode: "10",
    },
    {
      description: "Acqua minerale",
      quantity: 1,
      grossUnitPrice: 2.0,
      vatCode: "22",
    },
  ],
  paymentMethod: "PC",
  adeRegisteredAt: new Date("2026-02-15T12:30:00Z"),
  adeProgressive: "DCW2026/5111-0042",
  adeTransactionId: "TRX-0042",
};

// ---------------------------------------------------------------------------
// generateCommercialDocumentPdf — integration test (real pdfkit, node env)
// ---------------------------------------------------------------------------

describe("generateCommercialDocumentPdf", () => {
  it("returns a non-empty Buffer with valid PDF magic number (%PDF)", async () => {
    const buf = await generateCommercialDocumentPdf(BASE_DATA);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
    // Every valid PDF starts with the ASCII bytes for "%PDF"
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("encodes business-specific data: different businessName/vatNumber/progressive produce distinct PDFs", async () => {
    // pdfkit uses FlateDecode (zlib) on content streams, so text is not
    // searchable in the raw buffer. Instead we verify that unique input data
    // yields a unique PDF — which proves the values are encoded in the document.
    const buf = await generateCommercialDocumentPdf(BASE_DATA);
    const buf2 = await generateCommercialDocumentPdf({
      ...BASE_DATA,
      businessName: "Altro Esercente",
      vatNumber: "99999999999",
      adeProgressive: "DCW2026/0001-0001",
    });
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(buf2.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(buf).not.toEqual(buf2);
  });

  it("works without optional address fields (null values)", async () => {
    const buf = await generateCommercialDocumentPdf({
      ...BASE_DATA,
      address: null,
      city: null,
      province: null,
      zipCode: null,
    });
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("works with a single line item", async () => {
    const buf = await generateCommercialDocumentPdf({
      ...BASE_DATA,
      lines: [
        {
          description: "Espresso",
          quantity: 1,
          grossUnitPrice: 1.0,
          vatCode: "22",
        },
      ],
    });
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("works with exempt VAT codes (N1-N6, no VAT amount)", async () => {
    const buf = await generateCommercialDocumentPdf({
      ...BASE_DATA,
      lines: [
        {
          description: "Prestazione esente",
          quantity: 1,
          grossUnitPrice: 100.0,
          vatCode: "N4",
        },
      ],
    });
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("works with non-integer quantity (e.g. 0.5 kg)", async () => {
    const buf = await generateCommercialDocumentPdf({
      ...BASE_DATA,
      lines: [
        {
          description: "Prosciutto",
          quantity: 0.5,
          grossUnitPrice: 12.0,
          vatCode: "10",
        },
      ],
    });
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("works with electronic payment method", async () => {
    const buf = await generateCommercialDocumentPdf({
      ...BASE_DATA,
      paymentMethod: "PE",
    });
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("genera un PDF valido con lotteryCode presente", async () => {
    const buf = await generateCommercialDocumentPdf({
      ...BASE_DATA,
      paymentMethod: "PE",
      lotteryCode: "YYWLR30G",
    });
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("PDF con lotteryCode è diverso da PDF senza (il codice è incluso nel contenuto)", async () => {
    const bufWith = await generateCommercialDocumentPdf({
      ...BASE_DATA,
      paymentMethod: "PE",
      lotteryCode: "YYWLR30G",
    });
    const bufWithout = await generateCommercialDocumentPdf({
      ...BASE_DATA,
      paymentMethod: "PE",
      lotteryCode: null,
    });
    expect(bufWith).not.toEqual(bufWithout);
  });

  it("generates a taller page with more line items", async () => {
    // pdfkit FlateDecode compression makes raw buffer size unreliable as a
    // proxy for content length (more repetitive content can compress smaller).
    // Instead we read the /MediaBox from the uncompressed PDF page dictionary,
    // which is always written in plaintext and reflects estimateHeight().
    const manyLines = Array.from({ length: 10 }, (_, i) => ({
      description: `Articolo ${i + 1}`,
      quantity: 1,
      grossUnitPrice: 5.0 + i,
      vatCode: "22" as const,
    }));
    const buf = await generateCommercialDocumentPdf({
      ...BASE_DATA,
      lines: manyLines,
    });
    const bufSingle = await generateCommercialDocumentPdf({
      ...BASE_DATA,
      lines: [manyLines[0]],
    });
    // More lines → taller page (estimateHeight adds 18pt per line)
    expect(pdfPageHeight(buf)).toBeGreaterThan(pdfPageHeight(bufSingle));
  });

  it("genera un PDF valido con publicUrl presente (QR)", async () => {
    const buf = await generateCommercialDocumentPdf({
      ...BASE_DATA,
      publicUrl: "https://app.scontrinozero.it/r/6f8f857a-2b2a-4c8b-9b2a",
    });
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("con publicUrl presente la pagina è più alta (spazio riservato al QR)", async () => {
    const withQr = await generateCommercialDocumentPdf({
      ...BASE_DATA,
      publicUrl: "https://app.scontrinozero.it/r/6f8f857a-2b2a-4c8b-9b2a",
    });
    const withoutQr = await generateCommercialDocumentPdf({
      ...BASE_DATA,
      publicUrl: null,
    });
    expect(pdfPageHeight(withQr)).toBeGreaterThan(pdfPageHeight(withoutQr));
  });

  it("senza publicUrl non disegna alcun QR (nessun errore, PDF invariato rispetto ad assenza del campo)", async () => {
    const bufMissing = await generateCommercialDocumentPdf(BASE_DATA);
    const bufNull = await generateCommercialDocumentPdf({
      ...BASE_DATA,
      publicUrl: null,
    });
    expect(bufMissing.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(bufNull.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});

// ---------------------------------------------------------------------------
// Layout — conformità al "layout standard" AdE del documento commerciale
//
// Il testo del PDF vive dentro content stream FlateDecode: `extractPdfText`
// li inflaziona e ricompone gli operatori di scrittura, così le asserzioni
// possono guardare etichette e ORDINE delle sezioni invece del solo %PDF.
// ---------------------------------------------------------------------------

describe("layout AdE — intestazione", () => {
  it("stampa P.IVA subito sotto la ragione sociale, poi via e località", async () => {
    const runs = extractPdfTextRuns(
      await generateCommercialDocumentPdf(BASE_DATA),
    );
    expect(runs.slice(0, 4)).toEqual([
      "Trattoria da Mario",
      "P.IVA: 12345678901",
      "Via Roma 1",
      "Milano(MI), 20100",
    ]);
  });

  it("non stampa righe indirizzo quando i campi sono nulli", async () => {
    const runs = extractPdfTextRuns(
      await generateCommercialDocumentPdf({
        ...BASE_DATA,
        address: null,
        city: null,
        province: null,
        zipCode: null,
      }),
    );
    expect(runs.slice(0, 3)).toEqual([
      "Trattoria da Mario",
      "P.IVA: 12345678901",
      "DOCUMENTO COMMERCIALE",
    ]);
  });
});

describe("layout AdE — tabella righe", () => {
  it("usa le intestazioni di colonna del layout standard", async () => {
    const text = extractPdfText(await generateCommercialDocumentPdf(BASE_DATA));
    expect(text).toContain("DESCRIZIONE");
    expect(text).toContain("Prezzo(€)");
  });

  it("stampa la riga quantità nella forma AdE `n.Q * prezzo`", async () => {
    const text = extractPdfText(await generateCommercialDocumentPdf(BASE_DATA));
    expect(text).toContain("n.2 * 8,50");
  });
});

describe("layout AdE — totali", () => {
  it("mette `di cui IVA` DOPO il totale complessivo, non prima", async () => {
    const runs = extractPdfTextRuns(
      await generateCommercialDocumentPdf(BASE_DATA),
    );
    const iSub = runs.indexOf("Subtotale");
    const iTot = runs.indexOf("TOTALE COMPLESSIVO");
    const iVat = runs.indexOf("di cui IVA");
    expect(iSub).toBeGreaterThan(-1);
    expect(iTot).toBeGreaterThan(iSub);
    expect(iVat).toBeGreaterThan(iTot);
  });

  it("espone l'IVA aggregata, somma delle aliquote presenti", async () => {
    // Pizza 17,00 @10% → 1,55 · Acqua 2,00 @22% → 0,36 · totale IVA 1,91
    const runs = extractPdfTextRuns(
      await generateCommercialDocumentPdf(BASE_DATA),
    );
    expect(runs[runs.indexOf("di cui IVA") + 1]).toBe("1,91");
  });

  it("aggiunge il dettaglio per aliquota quando le aliquote con IVA sono più di una", async () => {
    const text = extractPdfText(await generateCommercialDocumentPdf(BASE_DATA));
    expect(text).toContain("di cui IVA 10%");
    expect(text).toContain("di cui IVA 22%");
  });

  it("con una sola aliquota non duplica il dettaglio sotto l'aggregato", async () => {
    const text = extractPdfText(
      await generateCommercialDocumentPdf({
        ...BASE_DATA,
        lines: [
          {
            description: "Espresso",
            quantity: 1,
            grossUnitPrice: 1.22,
            vatCode: "22",
          },
        ],
      }),
    );
    expect(text).toContain("di cui IVA");
    expect(text).not.toContain("di cui IVA 22%");
  });

  it("omette `di cui IVA` quando tutte le righe sono a natura (IVA zero)", async () => {
    const text = extractPdfText(
      await generateCommercialDocumentPdf({
        ...BASE_DATA,
        lines: [
          {
            description: "Prestazione esente",
            quantity: 1,
            grossUnitPrice: 50,
            vatCode: "N4",
          },
        ],
      }),
    );
    expect(text).not.toContain("di cui IVA");
  });
});

describe("layout AdE — pagamento", () => {
  it("stampa la modalità di pagamento con la dicitura AdE e sempre `Importo pagato`", async () => {
    const runs = extractPdfTextRuns(
      await generateCommercialDocumentPdf(BASE_DATA),
    );
    const iPay = runs.indexOf("Pagamento contante");
    const iPaid = runs.indexOf("Importo pagato");
    expect(iPay).toBeGreaterThan(-1);
    expect(iPaid).toBe(iPay + 2); // label, importo, label
    expect(runs[iPaid + 1]).toBe("19,00");
  });

  it("usa `Pagamento elettronico` per il metodo PE", async () => {
    const text = extractPdfText(
      await generateCommercialDocumentPdf({
        ...BASE_DATA,
        paymentMethod: "PE",
      }),
    );
    expect(text).toContain("Pagamento elettronico");
    expect(text).not.toContain("Pagamento contante");
  });

  it("a totale zero omette la riga modalità ma tiene `Importo pagato` (prescrizioni risparmio carta)", async () => {
    const runs = extractPdfTextRuns(
      await generateCommercialDocumentPdf({
        ...BASE_DATA,
        lines: [
          {
            description: "Omaggio",
            quantity: 1,
            grossUnitPrice: 0,
            vatCode: "22",
          },
        ],
      }),
    );
    expect(runs).not.toContain("Pagamento contante");
    expect(runs).toContain("Importo pagato");
  });
});

describe("layout AdE — piede", () => {
  it("stampa il codice lotteria DOPO il numero documento, con la caption su riga propria", async () => {
    const runs = extractPdfTextRuns(
      await generateCommercialDocumentPdf({
        ...BASE_DATA,
        paymentMethod: "PE",
        lotteryCode: "YYWLR30G",
      }),
    );
    const iDoc = runs.findIndex((r) => r.startsWith("DOCUMENTO N."));
    const iCaption = runs.indexOf("Codice Lotteria");
    expect(iCaption).toBeGreaterThan(iDoc);
    expect(runs[iCaption + 1]).toBe("YYWLR30G");
  });

  it("senza codice lotteria non stampa la caption", async () => {
    const text = extractPdfText(await generateCommercialDocumentPdf(BASE_DATA));
    expect(text).not.toContain("Codice Lotteria");
  });

  it("chiude con data e numero documento in quest'ordine", async () => {
    const runs = extractPdfTextRuns(
      await generateCommercialDocumentPdf(BASE_DATA),
    );
    const iDate = runs.indexOf("15-02-2026 13:30");
    expect(iDate).toBeGreaterThan(-1);
    expect(runs[iDate + 1]).toBe("DOCUMENTO N. DCW2026/5111-0042");
  });
});

describe("layout AdE — codifica IVA in colonna e legenda", () => {
  const EXEMPT_DATA: SaleDocumentPdfData = {
    ...BASE_DATA,
    lines: [
      {
        description: "Prestazione esente",
        quantity: 1,
        grossUnitPrice: 100,
        vatCode: "N4",
      },
      {
        description: "Marca da bollo",
        quantity: 1,
        grossUnitPrice: 2,
        vatCode: "N1",
      },
    ],
  };

  it("stampa il mnemonico AdE in colonna invece dell'etichetta descrittiva", async () => {
    const runs = extractPdfTextRuns(
      await generateCommercialDocumentPdf(EXEMPT_DATA),
    );
    expect(runs).toContain("ES*");
    expect(runs).toContain("EE*");
    // "0% – Esente" andava a capo nella colonna larga 22pt, finendo a cavallo
    // del separatore: il wrapping produceva un run tronco "0% – ".
    expect(runs.some((r) => r.includes("0% –"))).toBe(false);
  });

  it("scioglie gli asterischi in legenda, nell'ordine della tabella AdE", async () => {
    const runs = extractPdfTextRuns(
      await generateCommercialDocumentPdf(EXEMPT_DATA),
    );
    const iEE = runs.indexOf("*EE = Esclusa");
    const iES = runs.indexOf("*ES = Esente");
    expect(iEE).toBeGreaterThan(-1);
    expect(iES).toBeGreaterThan(iEE);
  });

  it("mette la legenda dopo il blocco pagamenti e prima della data", async () => {
    const runs = extractPdfTextRuns(
      await generateCommercialDocumentPdf(EXEMPT_DATA),
    );
    const iPaid = runs.indexOf("Importo pagato");
    const iLegend = runs.indexOf("*ES = Esente");
    const iDate = runs.indexOf("15-02-2026 13:30");
    expect(iLegend).toBeGreaterThan(iPaid);
    expect(iDate).toBeGreaterThan(iLegend);
  });

  it("non stampa legenda quando il documento non ha nature", async () => {
    const text = extractPdfText(await generateCommercialDocumentPdf(BASE_DATA));
    expect(text).not.toContain(" = ");
  });

  it("riserva altezza pagina per la legenda", async () => {
    const withLegend = await generateCommercialDocumentPdf(EXEMPT_DATA);
    const withoutLegend = await generateCommercialDocumentPdf({
      ...EXEMPT_DATA,
      lines: EXEMPT_DATA.lines.map((l) => ({ ...l, vatCode: "22" })),
    });
    expect(pdfPageHeight(withLegend)).toBeGreaterThan(
      pdfPageHeight(withoutLegend),
    );
  });
});

describe("layout AdE — casi degeneri", () => {
  it("la vendita sta in una pagina sola, QR e legenda compresi", async () => {
    const buf = await generateCommercialDocumentPdf({
      ...BASE_DATA,
      lines: [
        ...BASE_DATA.lines,
        {
          description: "Prestazione esente",
          quantity: 3,
          grossUnitPrice: 40,
          vatCode: "N4",
        },
      ],
      lotteryCode: "YYWLR30G",
      publicUrl: "https://app.scontrinozero.it/r/sale-uuid",
    });
    expect(pdfPageCount(buf)).toBe(1);
  });

  it("genera un documento valido anche senza righe", async () => {
    const runs = extractPdfTextRuns(
      await generateCommercialDocumentPdf({ ...BASE_DATA, lines: [] }),
    );
    expect(runs).toContain("TOTALE COMPLESSIVO");
    expect(runs).toContain("Importo pagato");
    expect(runs).not.toContain("di cui IVA");
  });

  it("non stampa `di cui IVA` per un'aliquota che non produce nemmeno un centesimo", async () => {
    // 0,01 @4% → imponibile 0,01, imposta 0 centesimi: computeReceiptTotals
    // non crea la voce, quindi il documento non ha nulla da esporre.
    const text = extractPdfText(
      await generateCommercialDocumentPdf({
        ...BASE_DATA,
        lines: [
          {
            description: "Caramella",
            quantity: 1,
            grossUnitPrice: 0.01,
            vatCode: "4",
          },
        ],
      }),
    );
    expect(text).not.toContain("di cui IVA");
  });
});

// ---------------------------------------------------------------------------
// Ricevuta di annullamento — layout standard AdE, pagina "DOCUMENTO
// COMMERCIALE DI ANNULLO". Stesse sezioni della vendita, con tre differenze:
// sottotitolo, blocco "Documento di riferimento" e assenza dei pagamenti.
// ---------------------------------------------------------------------------

const VOID_DATA: VoidDocumentPdfData = {
  kind: "VOID",
  businessName: "Trattoria da Mario",
  vatNumber: "12345678901",
  address: "Via Roma 1",
  city: "Milano",
  province: "MI",
  zipCode: "20100",
  lines: BASE_DATA.lines,
  adeRegisteredAt: new Date("2026-02-16T09:15:00Z"),
  adeProgressive: "DCW2026/5111-0043",
  adeTransactionId: "TRX-0043",
  voidedDocument: {
    adeProgressive: "DCW2026/5111-0042",
    adeRegisteredAt: new Date("2026-02-15T12:30:00Z"),
  },
};

describe("documento di annullo — intestazione e riferimento", () => {
  it("usa il sottotitolo `emesso per ANNULLAMENTO`", async () => {
    const text = extractPdfText(await generateCommercialDocumentPdf(VOID_DATA));
    expect(text).toContain("emesso per ANNULLAMENTO");
    expect(text).not.toContain("di vendita o prestazione");
  });

  it("stampa il blocco `Documento di riferimento` col progressivo e la data della vendita", async () => {
    const runs = extractPdfTextRuns(
      await generateCommercialDocumentPdf(VOID_DATA),
    );
    const iRef = runs.indexOf("Documento di riferimento:");
    expect(iRef).toBeGreaterThan(-1);
    expect(runs[iRef + 1]).toBe("N. DCW2026/5111-0042 del 15-02-2026");
  });

  it("mette il riferimento fra il titolo e la tabella righe", async () => {
    const runs = extractPdfTextRuns(
      await generateCommercialDocumentPdf(VOID_DATA),
    );
    const iTitle = runs.indexOf("emesso per ANNULLAMENTO");
    const iRef = runs.indexOf("Documento di riferimento:");
    const iTable = runs.indexOf("DESCRIZIONE");
    expect(iRef).toBeGreaterThan(iTitle);
    expect(iTable).toBeGreaterThan(iRef);
  });

  it("il footer porta il progressivo e la data DELL'ANNULLO, non della vendita", async () => {
    const runs = extractPdfTextRuns(
      await generateCommercialDocumentPdf(VOID_DATA),
    );
    const iDate = runs.indexOf("16-02-2026 10:15");
    expect(iDate).toBeGreaterThan(-1);
    expect(runs[iDate + 1]).toBe("DOCUMENTO N. DCW2026/5111-0043");
  });
});

describe("documento di annullo — corpo", () => {
  it("ristampa le righe della vendita annullata, coi suoi totali", async () => {
    const text = extractPdfText(await generateCommercialDocumentPdf(VOID_DATA));
    expect(text).toContain("Pizza Margherita");
    expect(text).toContain("TOTALE COMPLESSIVO");
    expect(text).toContain("di cui IVA");
  });

  it("non stampa il blocco pagamenti: un annullo non incassa nulla", async () => {
    const text = extractPdfText(await generateCommercialDocumentPdf(VOID_DATA));
    expect(text).not.toContain("Pagamento");
    expect(text).not.toContain("Importo pagato");
  });

  it("non stampa il codice lotteria (HAR.md #16e)", async () => {
    const text = extractPdfText(await generateCommercialDocumentPdf(VOID_DATA));
    expect(text).not.toContain("Codice Lotteria");
  });

  it("mantiene la legenda IVA quando l'annullato aveva righe a natura", async () => {
    const text = extractPdfText(
      await generateCommercialDocumentPdf({
        ...VOID_DATA,
        lines: [
          {
            description: "Prestazione esente",
            quantity: 1,
            grossUnitPrice: 100,
            vatCode: "N4",
          },
        ],
      }),
    );
    expect(text).toContain("ES*");
    expect(text).toContain("*ES = Esente");
  });

  // Sottostimare l'altezza costa una seconda pagina: su uno scontrino termico
  // significa carta sprecata e un documento che si legge in due pezzi.
  it("sta in una pagina sola, QR e legenda compresi", async () => {
    const buf = await generateCommercialDocumentPdf({
      ...VOID_DATA,
      lines: [
        ...VOID_DATA.lines,
        {
          description: "Prestazione esente",
          quantity: 3,
          grossUnitPrice: 40,
          vatCode: "N4",
        },
      ],
      publicUrl: "https://app.scontrinozero.it/r/void-uuid",
    });
    expect(pdfPageCount(buf)).toBe(1);
  });

  it("riserva altezza al QR verso la copia pubblica dell'annullo", async () => {
    // Sull'altezza pagina e non sulla dimensione del buffer: pdfkit comprime
    // i content stream, quindi piu' contenuto puo' pesare meno.
    const withQr = await generateCommercialDocumentPdf({
      ...VOID_DATA,
      publicUrl: "https://app.scontrinozero.it/r/void-uuid",
    });
    const withoutQr = await generateCommercialDocumentPdf(VOID_DATA);
    expect(pdfPageHeight(withQr)).toBeGreaterThan(pdfPageHeight(withoutQr));
  });
});
