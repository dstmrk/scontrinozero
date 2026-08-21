import { describe, it, expect } from "vitest";
import { buildReceiptCommands } from "./receipt-escpos";
import { computeReceiptTotals } from "@/lib/receipts/receipt-totals";
import { PAPER_COLUMNS } from "./types";
import type { PrintableReceipt, PrintableReceiptLine } from "./types";

/**
 * Mappa ogni byte sul code point omonimo (0x8A → U+008A), così le assert sui
 * byte di codepage sono dirette.
 *
 * NON si usa `new TextDecoder("latin1")`: per la spec WHATWG "latin1" è un
 * alias di windows-1252, che rimappa la fascia 0x80-0x9F (0x8A → U+0160 "Š") e
 * farebbe fallire proprio i controlli sugli accenti.
 */
function decode(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
}

/** Righe di testo stampate, senza sequenze di controllo e senza padding. */
function printedLines(bytes: Uint8Array): string[] {
  return decode(bytes)
    .replace(/\x1b[@!MtEadV]?.?|\x1c\.|\x1d[Vk(].*?(?=\n|$)/g, "")
    .split("\n")
    .map((l) => l.replace(/\r/g, "").trimEnd())
    .filter((l) => l.trim() !== "");
}

const HEADER = {
  businessName: "Bar da Mario",
  vatNumber: "12345678901",
  address: "Via Roma 1",
  city: "Milano",
  province: "MI",
  zipCode: "20100",
} as const;

function makeReceipt(
  lines: PrintableReceiptLine[],
  overrides: Partial<PrintableReceipt> = {},
): PrintableReceipt {
  return {
    header: HEADER,
    lines,
    kind: "SALE",
    paymentMethod: "PC",
    adeRegisteredAt: new Date("2026-07-28T12:32:00Z"),
    adeProgressive: "0001-0042",
    ...overrides,
  } as PrintableReceipt;
}

/** Ricevuta di annullamento: righe della vendita, riferimento all'originale. */
function makeVoidReceipt(
  lines: PrintableReceiptLine[],
  overrides: Partial<PrintableReceipt> = {},
): PrintableReceipt {
  return {
    header: HEADER,
    lines,
    kind: "VOID",
    adeRegisteredAt: new Date("2026-07-29T08:15:00Z"),
    adeProgressive: "0001-0043",
    voidedDocument: {
      adeProgressive: "0001-0042",
      adeRegisteredAt: new Date("2026-07-28T12:32:00Z"),
    },
    ...overrides,
  } as PrintableReceipt;
}

const SIMPLE_LINES: PrintableReceiptLine[] = [
  {
    description: "Caffè",
    quantity: "2",
    grossUnitPrice: "1.20",
    vatCode: "22",
  },
  {
    description: "Cornetto",
    quantity: "1",
    grossUnitPrice: "1.50",
    vatCode: "10",
  },
];

const OPTS = {
  columns: PAPER_COLUMNS["58"],
  printQr: false,
  language: "esc-pos",
} as const;

describe("buildReceiptCommands — struttura", () => {
  it("resetta la stampante (ESC @) prima di qualsiasi contenuto stampabile", () => {
    // L'encoder emette il padding di centratura della prima riga PRIMA dei byte
    // di initialize() — quirk verificato su v3, non aggirabile senza sprecare
    // carta. Innocuo: ESC @ svuota il buffer di stampa, quindi quegli spazi non
    // arrivano mai sulla carta. Quel che conta davvero è che nessun contenuto
    // *stampabile* preceda il reset.
    const out = decode(buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS));
    const beforeReset = out.slice(0, out.indexOf("\x1b@"));

    expect(out).toContain("\x1b@");
    expect(beforeReset.trim()).toBe("");
  });

  it("chiude con il comando di taglio GS V", () => {
    const out = decode(buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS));
    expect(out).toContain("\x1dV");
  });

  it("ritorna una Uint8Array pronta per il trasporto", () => {
    const out = buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS);
    expect(out).toBeInstanceOf(Uint8Array);
  });
});

describe("buildReceiptCommands — contenuto fiscale", () => {
  // Casi che condividono lo stesso scontrino di riferimento e differiscono
  // solo per il frammento atteso: un frammento per riga, così un fallimento
  // dice QUALE manca invece di rompere un test cumulativo.
  it.each([
    ["la ragione sociale dell'esercente", "Bar da Mario"],
    ["la partita IVA", "P.IVA: 12345678901"],
    ["l'indirizzo dell'esercente", "Via Roma 1"],
    [
      "la dicitura del documento commerciale, come nel PDF",
      "DOCUMENTO COMMERCIALE",
    ],
    ["il sottotitolo della dicitura", "di vendita o prestazione"],
    ["il progressivo AdE", "DOCUMENTO N. 0001-0042"],
    // Il timestamp fiscale (`ade_registered_at`), non il createdAt della riga:
    // 12:32 UTC = 14:32 a Roma (ora legale), reso in Europe/Rome esattamente
    // come fa il PDF, non in UTC del container.
    ["la data del documento in ora italiana", "28-07-2026 14:32"],
    // Descrizione senza accenti: la resa degli accenti ha il suo test dedicato,
    // qui interessa che la riga arrivi sulla carta col totale giusto (2×1,20).
    ["la descrizione della riga", "Cornetto"],
    ["il totale di riga", "2,40"],
    ["la riga quantità quando qty ≠ 1, come il PDF", "n.2 * 1,20"],
  ])("stampa %s", (_caso, atteso) => {
    const text = decode(buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS));
    expect(text).toContain(atteso);
  });

  it("omette la riga quantità quando qty = 1", () => {
    const single = makeReceipt([SIMPLE_LINES[1]]);
    expect(decode(buildReceiptCommands(single, OPTS))).not.toContain("n.1");
  });

  it("stampa il metodo di pagamento con la dicitura AdE", () => {
    const text = decode(
      buildReceiptCommands(
        makeReceipt(SIMPLE_LINES, { paymentMethod: "PE" }),
        OPTS,
      ),
    );
    // "Pagamento elettronico" (21 char) sta nella colonna etichetta a 32
    // colonne (32 - AMOUNT_COL = 23): la dicitura estesa non tronca.
    expect(text).toContain("Pagamento elettronico");
  });

  it("stampa il codice lotteria quando presente", () => {
    const text = decode(
      buildReceiptCommands(
        makeReceipt(SIMPLE_LINES, { lotteryCode: "ABCD1234" }),
        OPTS,
      ),
    );
    expect(text).toContain("Codice Lotteria");
    expect(text).toContain("ABCD1234");
  });

  it("omette la riga lotteria quando assente", () => {
    const text = decode(buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS));
    expect(text).not.toContain("Lotteria");
  });
});

describe("buildReceiptCommands — totali (regola 17)", () => {
  it("il TOTALE COMPLESSIVO stampato coincide con computeReceiptTotals", () => {
    // Test d'oro: la carta, il PDF e l'importo trasmesso all'AdE devono
    // riconciliare al centesimo perché derivano tutti dalla stessa funzione.
    const lines: PrintableReceiptLine[] = [
      {
        description: "A",
        quantity: "3",
        grossUnitPrice: "0.10",
        vatCode: "22",
      },
      {
        description: "B",
        quantity: "1.5",
        grossUnitPrice: "2.33",
        vatCode: "10",
      },
      { description: "C", quantity: "7", grossUnitPrice: "1.11", vatCode: "4" },
    ];
    const expected = computeReceiptTotals(lines).grandTotal;
    const text = decode(buildReceiptCommands(makeReceipt(lines), OPTS));

    const formatted = expected.toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const totalRow = printedLines(
      buildReceiptCommands(makeReceipt(lines), OPTS),
    ).find((l) => l.includes("TOTALE COMPLESSIVO"));

    expect(text).toContain("TOTALE COMPLESSIVO");
    expect(totalRow).toContain(formatted);
  });

  it("stampa una riga 'di cui IVA' per ogni aliquota con imposta", () => {
    const text = decode(buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS));
    expect(text).toContain("di cui IVA 22%");
    expect(text).toContain("di cui IVA 10%");
  });

  it("non stampa 'di cui IVA' per i codici natura N1-N6", () => {
    const exempt: PrintableReceiptLine[] = [
      {
        description: "Marca da bollo",
        quantity: "1",
        grossUnitPrice: "2.00",
        vatCode: "N1",
      },
    ];
    const text = decode(buildReceiptCommands(makeReceipt(exempt), OPTS));
    expect(text).not.toContain("di cui IVA");
  });

  it("usa la codifica IVA AdE, che entra nella colonna a 32 caratteri", () => {
    const exempt: PrintableReceiptLine[] = [
      {
        description: "Marca da bollo",
        quantity: "1",
        grossUnitPrice: "2.00",
        vatCode: "N2",
      },
    ];
    const text = decode(buildReceiptCommands(makeReceipt(exempt), OPTS));
    expect(text).toContain("NS*");
    expect(text).not.toContain("Non sogg.");
  });
});

describe("buildReceiptCommands — larghezza carta", () => {
  it("nessuna riga di testo supera le 32 colonne a 58mm", () => {
    const lines: PrintableReceiptLine[] = [
      {
        description: "Descrizione articolo davvero molto lunga che va a capo",
        quantity: "2",
        grossUnitPrice: "12.34",
        vatCode: "22",
      },
    ];
    const rows = printedLines(buildReceiptCommands(makeReceipt(lines), OPTS));
    const tooWide = rows.filter((l) => l.length > 32);
    expect(tooWide).toEqual([]);
  });

  it("nessuna riga di testo supera le 48 colonne a 80mm", () => {
    const rows = printedLines(
      buildReceiptCommands(makeReceipt(SIMPLE_LINES), {
        ...OPTS,
        columns: PAPER_COLUMNS["80"],
      }),
    );
    const tooWide = rows.filter((l) => l.length > 48);
    expect(tooWide).toEqual([]);
  });
});

describe("buildReceiptCommands — caratteri italiani", () => {
  it("codifica le accentate minuscole senza sostituzioni", () => {
    const lines: PrintableReceiptLine[] = [
      {
        description: "Caffè",
        quantity: "1",
        grossUnitPrice: "1.00",
        vatCode: "22",
      },
    ];
    const out = decode(buildReceiptCommands(makeReceipt(lines), OPTS));
    // 0x8A = è in CP437. Se fosse "?" (0x3F) avremmo perso il carattere.
    expect(out).toContain("Caff\x8a");
  });

  it("traslittera le accentate maiuscole della ragione sociale invece di perderle", () => {
    const receipt = makeReceipt(SIMPLE_LINES, {
      header: { ...HEADER, businessName: "CAFFÈ CENTRALE" },
    });
    const out = decode(buildReceiptCommands(receipt, OPTS));
    expect(out).toContain("CAFFE' CENTRALE");
  });
});

describe("buildReceiptCommands — QR ricevuta digitale", () => {
  it("emette il comando QR nativo quando printQr è attivo e c'è un URL", () => {
    const receipt = makeReceipt(SIMPLE_LINES, {
      publicUrl: "https://scontrinozero.it/r/abc",
    });
    const out = decode(
      buildReceiptCommands(receipt, { ...OPTS, printQr: true }),
    );
    // GS ( k = famiglia di comandi QR dei simboli 2D.
    expect(out).toContain("\x1d(k");
    expect(out).toContain("https://scontrinozero.it/r/abc");
  });

  it("non emette QR quando printQr è disattivo", () => {
    const receipt = makeReceipt(SIMPLE_LINES, {
      publicUrl: "https://scontrinozero.it/r/abc",
    });
    const out = decode(buildReceiptCommands(receipt, OPTS));
    expect(out).not.toContain("https://scontrinozero.it/r/abc");
  });

  it("non emette QR quando manca l'URL pubblico", () => {
    const out = decode(
      buildReceiptCommands(makeReceipt(SIMPLE_LINES), {
        ...OPTS,
        printQr: true,
      }),
    );
    expect(out).not.toContain("\x1d(k");
  });
});

// ---------------------------------------------------------------------------
// Layout AdE — la termica rispecchia sezione per sezione il PDF a 58mm
// (`src/lib/pdf/commercial-document.ts`), a sua volta allineato al "layout
// standard" del documento commerciale.
// ---------------------------------------------------------------------------

describe("buildReceiptCommands — layout AdE", () => {
  /** Indice della prima riga stampata che contiene `fragment`. */
  function rowIndexOf(rows: string[], fragment: string): number {
    return rows.findIndex((l) => l.includes(fragment));
  }

  it("stampa P.IVA subito sotto la ragione sociale, poi via e località", () => {
    const rows = printedLines(
      buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS),
    );
    // Solo l'ordine: il padding di centratura è dell'encoder, e sulla prima
    // riga `printedLines` lascia un residuo di sequenza di controllo.
    expect(rows[0]).toContain("Bar da Mario");
    expect(rows.slice(1, 4).map((l) => l.trim())).toEqual([
      "P.IVA: 12345678901",
      "Via Roma 1",
      "Milano(MI), 20100",
    ]);
  });

  it("usa le intestazioni di colonna del layout standard", () => {
    const text = decode(buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS));
    expect(text).toContain("DESCRIZIONE");
    expect(text).toContain("Prezzo");
  });

  it("stampa la riga quantità nella forma AdE `n.Q * prezzo`", () => {
    const text = decode(buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS));
    expect(text).toContain("n.2 * 1,20");
  });

  it("mette `di cui IVA` dopo il totale complessivo", () => {
    const rows = printedLines(
      buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS),
    );
    const iSub = rowIndexOf(rows, "Subtotale");
    const iTot = rowIndexOf(rows, "TOTALE COMPLESSIVO");
    const iVat = rowIndexOf(rows, "di cui IVA");
    expect(iTot).toBeGreaterThan(iSub);
    expect(iVat).toBeGreaterThan(iTot);
  });

  it("espone l'IVA aggregata coerente con computeReceiptTotals", () => {
    const rows = printedLines(
      buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS),
    );
    const { vatTotal } = computeReceiptTotals(SIMPLE_LINES);
    const aggregate = rows.find((l) => l.trimStart().startsWith("di cui IVA "));
    expect(vatTotal).toBeGreaterThan(0);
    expect(aggregate).toContain(
      vatTotal.toLocaleString("it-IT", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    );
  });

  it("con una sola aliquota non ripete il dettaglio sotto l'aggregato", () => {
    const single: PrintableReceiptLine[] = [
      {
        description: "Caffè",
        quantity: "2",
        grossUnitPrice: "1.20",
        vatCode: "22",
      },
    ];
    const text = decode(buildReceiptCommands(makeReceipt(single), OPTS));
    expect(text).toContain("di cui IVA");
    expect(text).not.toContain("di cui IVA 22%");
  });

  it("stampa sempre `Importo pagato` sotto la modalità di pagamento", () => {
    const rows = printedLines(
      buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS),
    );
    const iPay = rowIndexOf(rows, "Pagamento contante");
    const iPaid = rowIndexOf(rows, "Importo pagato");
    expect(iPay).toBeGreaterThan(-1);
    expect(iPaid).toBe(iPay + 1);
  });

  it("stampa lo sconto a pagare fra la modalità e `Importo pagato`", () => {
    // Layout normativo AdE (HAR.md voce #17b): `Sconto a pagare` è l'ultima
    // voce del blocco pagamenti, subito prima di `Importo pagato`.
    const rows = printedLines(
      buildReceiptCommands(
        makeReceipt(SIMPLE_LINES, { globalDiscountCents: 40 }),
        OPTS,
      ),
    );
    const iPay = rowIndexOf(rows, "Pagamento contante");
    const iDiscount = rowIndexOf(rows, "Sconto a pagare");
    const iPaid = rowIndexOf(rows, "Importo pagato");
    expect(iDiscount).toBe(iPay + 1);
    expect(iPaid).toBe(iDiscount + 1);
  });

  it("scala l'abbuono da `Importo pagato` e dalla modalità, non dal totale", () => {
    // HAR.md voce #3b: lo sconto a pagare NON riduce il corrispettivo. Il
    // totale complessivo resta pieno, l'incassato scende. Voce #17b: nel
    // campione ufficiale `Importo pagato` esclude l'abbuono.
    const rows = printedLines(
      buildReceiptCommands(
        makeReceipt(SIMPLE_LINES, { globalDiscountCents: 40 }),
        OPTS,
      ),
    );
    // SIMPLE_LINES vale 3,90 (2 x 1,20 + 1,50): totale pieno, incassato 3,50.
    expect(rows.find((r) => r.includes("TOTALE COMPLESSIVO"))).toContain(
      "3,90",
    );
    expect(rows.find((r) => r.includes("Pagamento contante"))).toContain(
      "3,50",
    );
    expect(rows.find((r) => r.includes("Sconto a pagare"))).toContain("0,40");
    expect(rows.find((r) => r.includes("Importo pagato"))).toContain("3,50");
  });

  it("omette la riga sconto a pagare quando l'abbuono è zero", () => {
    // Prescrizione risparmio carta (voce #17c): niente voci di pagamento a
    // zero. Vale per i documenti storici, che non hanno affatto il campo.
    const text = decode(buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS));
    expect(text).not.toContain("Sconto a pagare");
  });

  it("a totale zero omette la modalità ma tiene `Importo pagato`", () => {
    const free: PrintableReceiptLine[] = [
      {
        description: "Omaggio",
        quantity: "1",
        grossUnitPrice: "0.00",
        vatCode: "22",
      },
    ];
    const text = decode(buildReceiptCommands(makeReceipt(free), OPTS));
    expect(text).not.toContain("Pagamento contante");
    expect(text).toContain("Importo pagato");
  });

  it("stampa il codice lotteria dopo il numero documento, con la caption su riga propria", () => {
    const rows = printedLines(
      buildReceiptCommands(
        makeReceipt(SIMPLE_LINES, { lotteryCode: "ABCD1234" }),
        OPTS,
      ),
    );
    const iDoc = rowIndexOf(rows, "DOCUMENTO N.");
    const iCaption = rowIndexOf(rows, "Codice Lotteria");
    expect(iCaption).toBeGreaterThan(iDoc);
    expect(rows[iCaption + 1]).toContain("ABCD1234");
  });
});

describe("buildReceiptCommands — messaggio di cortesia (Pro)", () => {
  /** Indice della prima riga stampata che contiene `fragment`. */
  function rowIndexOf(rows: string[], fragment: string): number {
    return rows.findIndex((l) => l.includes(fragment));
  }

  it("stampa la nota in coda, dopo il numero documento", () => {
    const rows = printedLines(
      buildReceiptCommands(
        makeReceipt(SIMPLE_LINES, { footerNote: "Arrivederci e grazie!" }),
        OPTS,
      ),
    );
    const iDoc = rowIndexOf(rows, "DOCUMENTO N.");
    const iNote = rowIndexOf(rows, "Arrivederci e grazie!");
    expect(iNote).toBeGreaterThan(iDoc);
  });

  it("stampa la nota dopo il codice lotteria", () => {
    const rows = printedLines(
      buildReceiptCommands(
        makeReceipt(SIMPLE_LINES, {
          lotteryCode: "ABCD1234",
          footerNote: "Arrivederci e grazie!",
        }),
        OPTS,
      ),
    );
    expect(rowIndexOf(rows, "Arrivederci e grazie!")).toBeGreaterThan(
      rowIndexOf(rows, "ABCD1234"),
    );
  });

  it("senza nota non stampa righe in più", () => {
    const withNote = printedLines(
      buildReceiptCommands(
        makeReceipt(SIMPLE_LINES, { footerNote: "Grazie!" }),
        OPTS,
      ),
    );
    const without = printedLines(
      buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS),
    );
    expect(withNote).toHaveLength(without.length + 1);
    expect(
      printedLines(
        buildReceiptCommands(
          makeReceipt(SIMPLE_LINES, { footerNote: "   " }),
          OPTS,
        ),
      ),
    ).toEqual(without);
  });

  // Il wrap lo facciamo noi, non l'encoder: e' l'unico modo perche'
  // l'anteprima nelle impostazioni mostri esattamente le righe che escono.
  it("manda a capo la nota entro le colonne della carta", () => {
    const rows = printedLines(
      buildReceiptCommands(
        makeReceipt(SIMPLE_LINES, {
          footerNote: "Grazie per averci scelto, ti aspettiamo presto!",
        }),
        OPTS,
      ),
    );
    const iNote = rows.findIndex((r) => r.includes("Grazie per averci"));
    expect(iNote).toBeGreaterThan(-1);
    expect(rows[iNote].trim().length).toBeLessThanOrEqual(PAPER_COLUMNS["58"]);
    expect(rows[iNote + 1]).toContain("aspettiamo");
  });

  // Le accentate maiuscole non esistono in CP437: senza sanitizzazione la
  // stampante emette "?" al posto della lettera.
  it("passa la nota per la sanitizzazione termica", () => {
    const text = decode(
      buildReceiptCommands(
        makeReceipt(SIMPLE_LINES, { footerNote: "È SEMPRE UN PIACERE" }),
        OPTS,
      ),
    );
    expect(text).toContain("E' SEMPRE UN PIACERE");
  });

  it("non stampa alcuna nota sulla ricevuta di annullamento", () => {
    const rows = printedLines(
      buildReceiptCommands(
        makeVoidReceipt(SIMPLE_LINES, {
          footerNote: "Arrivederci e grazie!",
        } as Partial<PrintableReceipt>),
        OPTS,
      ),
    );
    expect(rows.some((r) => r.includes("Arrivederci"))).toBe(false);
  });
});

describe("buildReceiptCommands — codifica IVA AdE", () => {
  const EXEMPT_LINES: PrintableReceiptLine[] = [
    {
      description: "Prestazione esente",
      quantity: "1",
      grossUnitPrice: "100.00",
      vatCode: "N4",
    },
    {
      description: "Marca da bollo",
      quantity: "1",
      grossUnitPrice: "2.00",
      vatCode: "N1",
    },
  ];

  it("stampa il mnemonico AdE in colonna al posto del codice grezzo", () => {
    const text = decode(buildReceiptCommands(makeReceipt(EXEMPT_LINES), OPTS));
    expect(text).toContain("ES*");
    expect(text).toContain("EE*");
  });

  it("scioglie gli asterischi in legenda dopo il blocco pagamenti", () => {
    const rows = printedLines(
      buildReceiptCommands(makeReceipt(EXEMPT_LINES), OPTS),
    );
    const iPaid = rows.findIndex((l) => l.includes("Importo pagato"));
    const iLegend = rows.findIndex((l) => l.includes("*ES = Esente"));
    const iDate = rows.findIndex((l) => l.includes("28-07-2026"));
    expect(iLegend).toBeGreaterThan(iPaid);
    expect(iDate).toBeGreaterThan(iLegend);
  });

  it("non stampa legenda quando il documento non ha nature", () => {
    const text = decode(buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS));
    expect(text).not.toContain(" = ");
  });

  it("la legenda non sfora le 32 colonne", () => {
    const allNatures: PrintableReceiptLine[] = (
      ["N1", "N2", "N3", "N4", "N5", "N6"] as const
    ).map((vatCode, i) => ({
      description: `Riga ${i}`,
      quantity: "1",
      grossUnitPrice: "1.00",
      vatCode,
    }));
    const rows = printedLines(
      buildReceiptCommands(makeReceipt(allNatures), OPTS),
    );
    expect(rows.filter((l) => l.length > 32)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Ricevuta di annullamento su termica — rispecchia il PDF sezione per sezione.
// ---------------------------------------------------------------------------

describe("buildReceiptCommands — ricevuta di annullamento", () => {
  it("usa il sottotitolo `emesso per ANNULLAMENTO`", () => {
    const text = decode(
      buildReceiptCommands(makeVoidReceipt(SIMPLE_LINES), OPTS),
    );
    expect(text).toContain("emesso per ANNULLAMENTO");
    expect(text).not.toContain("di vendita o prestazione");
  });

  it("cita la vendita annullata con progressivo e data", () => {
    const rows = printedLines(
      buildReceiptCommands(makeVoidReceipt(SIMPLE_LINES), OPTS),
    );
    const iRef = rows.findIndex((l) => l.includes("Documento di riferimento:"));
    expect(iRef).toBeGreaterThan(-1);
    expect(rows[iRef + 1]).toContain("N. 0001-0042 del 28-07-2026");
  });

  it("mette il riferimento fra il titolo e la tabella righe", () => {
    const rows = printedLines(
      buildReceiptCommands(makeVoidReceipt(SIMPLE_LINES), OPTS),
    );
    const iTitle = rows.findIndex((l) => l.includes("ANNULLAMENTO"));
    const iRef = rows.findIndex((l) => l.includes("Documento di riferimento:"));
    const iTable = rows.findIndex((l) => l.includes("DESCRIZIONE"));
    expect(iRef).toBeGreaterThan(iTitle);
    expect(iTable).toBeGreaterThan(iRef);
  });

  it("non stampa il blocco pagamenti", () => {
    const text = decode(
      buildReceiptCommands(makeVoidReceipt(SIMPLE_LINES), OPTS),
    );
    expect(text).not.toContain("Pagamento");
    expect(text).not.toContain("Importo pagato");
  });

  it("porta nel piede progressivo e data DELL'ANNULLO", () => {
    const text = decode(
      buildReceiptCommands(makeVoidReceipt(SIMPLE_LINES), OPTS),
    );
    expect(text).toContain("DOCUMENTO N. 0001-0043");
    // 08:15 UTC = 10:15 a Roma (ora legale).
    expect(text).toContain("29-07-2026 10:15");
  });

  it("ristampa righe e totali della vendita annullata", () => {
    const text = decode(
      buildReceiptCommands(makeVoidReceipt(SIMPLE_LINES), OPTS),
    );
    expect(text).toContain("Cornetto");
    expect(text).toContain("TOTALE COMPLESSIVO");
  });

  it("nessuna riga supera le 32 colonne", () => {
    const rows = printedLines(
      buildReceiptCommands(makeVoidReceipt(SIMPLE_LINES), OPTS),
    );
    expect(rows.filter((l) => l.length > 32)).toEqual([]);
  });
});
