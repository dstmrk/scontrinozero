import { describe, it, expect } from "vitest";
import { buildReceiptCommands } from "./receipt-escpos";
import { computeReceiptTotals } from "@/lib/receipts/document-lines";
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
    paymentMethod: "PC",
    createdAt: new Date("2026-07-28T12:32:00Z"),
    adeProgressive: "0001-0042",
    ...overrides,
  };
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
  it("stampa intestazione, P.IVA e indirizzo dell'esercente", () => {
    const text = decode(buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS));
    expect(text).toContain("Bar da Mario");
    expect(text).toContain("P.IVA: 12345678901");
    expect(text).toContain("Via Roma 1");
  });

  it("stampa la dicitura del documento commerciale come nel PDF", () => {
    const text = decode(buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS));
    expect(text).toContain("DOCUMENTO COMMERCIALE");
    expect(text).toContain("di vendita o prestazione");
  });

  it("stampa il progressivo AdE e la data del documento", () => {
    const text = decode(buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS));
    expect(text).toContain("DOCUMENTO N. 0001-0042");
    // 12:32 UTC = 14:32 a Roma (ora legale): la data va resa in Europe/Rome
    // esattamente come fa il PDF, non in UTC del container.
    expect(text).toContain("28-07-2026 14:32");
  });

  it("stampa descrizione e totale riga", () => {
    const text = decode(buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS));
    // Descrizione senza accenti: la resa degli accenti ha il suo test dedicato,
    // qui interessa che la riga arrivi sulla carta col totale giusto (2×1,20).
    expect(text).toContain("Cornetto");
    expect(text).toContain("2,40");
  });

  it("aggiunge la riga quantità quando qty ≠ 1, come il PDF", () => {
    const text = decode(buildReceiptCommands(makeReceipt(SIMPLE_LINES), OPTS));
    expect(text).toContain("n.2 x 1,20");
  });

  it("omette la riga quantità quando qty = 1", () => {
    const single = makeReceipt([SIMPLE_LINES[1]]);
    expect(decode(buildReceiptCommands(single, OPTS))).not.toContain("n.1");
  });

  it("stampa il metodo di pagamento in chiaro", () => {
    const text = decode(
      buildReceiptCommands(
        makeReceipt(SIMPLE_LINES, { paymentMethod: "PE" }),
        OPTS,
      ),
    );
    expect(text).toContain("Elettronico");
  });

  it("stampa il codice lotteria quando presente", () => {
    const text = decode(
      buildReceiptCommands(
        makeReceipt(SIMPLE_LINES, { lotteryCode: "ABCD1234" }),
        OPTS,
      ),
    );
    expect(text).toContain("Cod. Lotteria: ABCD1234");
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

  it("usa la label IVA corta, che entra nella colonna a 32 caratteri", () => {
    const exempt: PrintableReceiptLine[] = [
      {
        description: "Marca da bollo",
        quantity: "1",
        grossUnitPrice: "2.00",
        vatCode: "N2",
      },
    ];
    const text = decode(buildReceiptCommands(makeReceipt(exempt), OPTS));
    expect(text).toContain("N2");
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
