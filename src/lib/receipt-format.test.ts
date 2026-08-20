import { describe, expect, it } from "vitest";
import {
  PAYMENT_LABELS,
  RECEIPT_FOOTER_NOTE_MAX_CHARS,
  RECEIPT_FOOTER_NOTE_MAX_LINES,
  formatBusinessAddressLines,
  formatReceiptPrice,
  formatReceiptDate,
  formatReceiptDateTime,
  normalizeReceiptFooterNote,
  receiptFooterNoteLines,
} from "./receipt-format";

describe("PAYMENT_LABELS", () => {
  // Dicitura del layout standard AdE: la riga della modalità di pagamento si
  // legge "Pagamento contante 160,00", non "Contante 160,00".
  it("usa la dicitura del layout AdE (Pagamento contante / elettronico)", () => {
    expect(PAYMENT_LABELS.PC).toBe("Pagamento contante");
    expect(PAYMENT_LABELS.PE).toBe("Pagamento elettronico");
  });
});

describe("formatReceiptPrice", () => {
  it("formatta in italiano senza simbolo €", () => {
    expect(formatReceiptPrice(12.5)).toBe("12,50");
    expect(formatReceiptPrice(0)).toBe("0,00");
  });

  it("forza 2 decimali anche per importi interi", () => {
    expect(formatReceiptPrice(5)).toBe("5,00");
  });

  it("arrotonda al secondo decimale", () => {
    expect(formatReceiptPrice(1.005)).toBe("1,01");
    expect(formatReceiptPrice(1.004)).toBe("1,00");
  });
});

describe("formatReceiptDateTime", () => {
  it("usa il formato DD-MM-YYYY HH:MM", () => {
    expect(formatReceiptDateTime(new Date("2026-01-15T09:05:00Z"))).toBe(
      "15-01-2026 10:05",
    );
  });

  it("rende l'ora legale italiana, non l'UTC del container", () => {
    // Luglio: Roma è UTC+2. Con getHours() in un container UTC stamperemmo 12:32.
    expect(formatReceiptDateTime(new Date("2026-07-28T12:32:00Z"))).toBe(
      "28-07-2026 14:32",
    );
  });

  it("non sbaglia il giorno a cavallo della mezzanotte italiana", () => {
    // 23:30 UTC del 27 = 01:30 del 28 a Roma: la data deve avanzare.
    expect(formatReceiptDateTime(new Date("2026-07-27T23:30:00Z"))).toBe(
      "28-07-2026 01:30",
    );
  });
});

describe("formatBusinessAddressLines", () => {
  it("rende via e località su due righe, con la provincia fra parentesi", () => {
    expect(
      formatBusinessAddressLines({
        address: "Via Roma 1",
        city: "Milano",
        province: "MI",
        zipCode: "20100",
      }),
    ).toEqual(["Via Roma 1", "Milano(MI), 20100"]);
  });

  it("omette la riga via quando l'indirizzo manca", () => {
    expect(
      formatBusinessAddressLines({
        address: null,
        city: "Milano",
        province: "MI",
        zipCode: "20100",
      }),
    ).toEqual(["Milano(MI), 20100"]);
  });

  it("omette le parentesi quando la provincia manca", () => {
    expect(
      formatBusinessAddressLines({
        address: "Via Roma 1",
        city: "Milano",
        province: null,
        zipCode: "20100",
      }),
    ).toEqual(["Via Roma 1", "Milano, 20100"]);
  });

  it("omette il CAP quando manca", () => {
    expect(
      formatBusinessAddressLines({
        address: null,
        city: "Milano",
        province: "MI",
        zipCode: null,
      }),
    ).toEqual(["Milano(MI)"]);
  });

  it("senza città non stampa una provincia orfana fra parentesi", () => {
    expect(
      formatBusinessAddressLines({
        address: "Via Roma 1",
        city: null,
        province: "MI",
        zipCode: "20100",
      }),
    ).toEqual(["Via Roma 1", "20100"]);
  });

  it("restituisce un array vuoto quando non c'è alcun dato indirizzo", () => {
    expect(
      formatBusinessAddressLines({
        address: null,
        city: null,
        province: null,
        zipCode: null,
      }),
    ).toEqual([]);
  });

  it("ignora i campi composti da soli spazi", () => {
    expect(
      formatBusinessAddressLines({
        address: "   ",
        city: "Milano",
        province: "  ",
        zipCode: "20100",
      }),
    ).toEqual(["Milano, 20100"]);
  });
});

describe("formatReceiptDate", () => {
  // Il blocco "Documento di riferimento" del layout di annullo cita la sola
  // data della vendita (`del 03-06-2020`), senza ora.
  it("rende solo la data, in formato DD-MM-YYYY", () => {
    expect(formatReceiptDate(new Date("2026-02-15T12:30:00Z"))).toBe(
      "15-02-2026",
    );
  });

  it("usa l'ora italiana, non l'UTC del container", () => {
    // 23:30 UTC del 31/12 è già l'1 gennaio a Roma (CET, +1).
    expect(formatReceiptDate(new Date("2026-12-31T23:30:00Z"))).toBe(
      "01-01-2027",
    );
  });

  it("regge l'ora legale (CEST, +2)", () => {
    // 22:30 UTC del 15/07 è il 16 luglio a Roma.
    expect(formatReceiptDate(new Date("2026-07-15T22:30:00Z"))).toBe(
      "16-07-2026",
    );
  });
});

describe("normalizeReceiptFooterNote", () => {
  it("restituisce null per input assente o di soli spazi", () => {
    expect(normalizeReceiptFooterNote(null)).toBeNull();
    expect(normalizeReceiptFooterNote(undefined)).toBeNull();
    expect(normalizeReceiptFooterNote("")).toBeNull();
    expect(normalizeReceiptFooterNote("   \n  \n ")).toBeNull();
  });

  it("normalizza i CRLF e scarta le righe vuote intermedie", () => {
    expect(normalizeReceiptFooterNote("Grazie!\r\n\r\n\r\nA presto")).toBe(
      "Grazie!\nA presto",
    );
  });

  it("taglia gli spazi ai bordi di ogni riga", () => {
    expect(normalizeReceiptFooterNote("  Grazie!  \n   A presto ")).toBe(
      "Grazie!\nA presto",
    );
  });

  // Un tab o un carattere di controllo da copia-incolla non ha resa definita
  // su nessuna delle tre superfici: sulla termica finisce nell'encoder come
  // byte di comando, sul PDF come glifo mancante.
  it("converte i tab in spazi e rimuove i caratteri di controllo", () => {
    expect(normalizeReceiptFooterNote("Gra\tzie!")).toBe("Gra zie!");
  });

  it("NON tronca: la lunghezza la valida il chiamante", () => {
    const long = "a".repeat(100);
    expect(normalizeReceiptFooterNote(long)).toBe(long);
  });

  it("NON taglia le righe in eccesso: il conteggio lo valida il chiamante", () => {
    expect(normalizeReceiptFooterNote("a\nb\nc")).toBe("a\nb\nc");
  });
});

describe("receiptFooterNoteLines", () => {
  it("restituisce un array vuoto per nota assente o di soli spazi", () => {
    expect(receiptFooterNoteLines(null)).toEqual([]);
    expect(receiptFooterNoteLines(undefined)).toEqual([]);
    expect(receiptFooterNoteLines("   ")).toEqual([]);
  });

  it("rende la nota su una riga sola quando non contiene a capo", () => {
    expect(receiptFooterNoteLines("Arrivederci e grazie!")).toEqual([
      "Arrivederci e grazie!",
    ]);
  });

  it("spezza sugli a capo scartando le righe vuote", () => {
    expect(receiptFooterNoteLines("Grazie!\n\n A presto ")).toEqual([
      "Grazie!",
      "A presto",
    ]);
  });

  // Cap difensivo: il vincolo vero è a monte (server action + CHECK DB), ma un
  // valore scritto a mano sul DB non deve poter allungare lo scontrino.
  it("taglia le righe oltre il massimo consentito", () => {
    expect(receiptFooterNoteLines("a\nb\nc")).toEqual(["a", "b"]);
    expect(RECEIPT_FOOTER_NOTE_MAX_LINES).toBe(2);
  });

  it("senza columns non manda a capo: il wrap lo fa la superficie", () => {
    const long = "Grazie per averci scelto, ti aspettiamo presto in negozio";
    expect(receiptFooterNoteLines(long)).toEqual([long]);
  });

  it("con columns manda a capo sulle parole, senza superare la larghezza", () => {
    const lines = receiptFooterNoteLines(
      "Grazie per averci scelto, ti aspettiamo presto!",
      { columns: 32 },
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(32);
    expect(lines.join(" ")).toBe(
      "Grazie per averci scelto, ti aspettiamo presto!",
    );
  });

  // Un URL o un handle social non ha spazi dove spezzare: meglio spezzarlo a
  // forza che far sbordare la colonna (sulla termica sborda davvero).
  it("spezza a forza una parola più lunga della colonna", () => {
    const lines = receiptFooterNoteLines("scontrinozero.it/promo/estate2026", {
      columns: 16,
    });
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(16);
    expect(lines.join("")).toBe("scontrinozero.it/promo/estate2026");
  });

  it("applica il wrap a ogni riga logica, dopo il cap sulle righe", () => {
    const lines = receiptFooterNoteLines("aaaa bbbb\ncccc dddd\neeee", {
      columns: 4,
    });
    expect(lines).toEqual(["aaaa", "bbbb", "cccc", "dddd"]);
  });

  it("il massimo di caratteri è quello di due righe di termica 58mm", () => {
    expect(RECEIPT_FOOTER_NOTE_MAX_CHARS).toBe(64);
  });
});
