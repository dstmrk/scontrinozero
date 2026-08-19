// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockFetchLinesByDocIds,
  mockGroupLinesByDocId,
  mockCalcDocTotal,
} = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockFetchLinesByDocIds: vi.fn(),
  mockGroupLinesByDocId: vi.fn(),
  mockCalcDocTotal: vi.fn(),
}));

vi.mock("@/db", () => ({ getDb: mockGetDb }));
vi.mock("@/db/schema", () => ({
  commercialDocuments: {
    id: "id",
    businessId: "business_id",
    kind: "kind",
    status: "status",
    adeRegisteredAt: "ade_registered_at",
    adeProgressive: "ade_progressive",
    adeTransactionId: "ade_transaction_id",
    lotteryCode: "lottery_code",
    voidedDocumentId: "voided_document_id",
    publicRequest: "public_request",
  },
}));

vi.mock("drizzle-orm/pg-core", () => ({
  alias: (_table: unknown, name: string) => ({
    _alias: name,
    id: `${name}.id`,
    kind: `${name}.kind`,
    status: `${name}.status`,
    voidedDocumentId: `${name}.voided_document_id`,
    adeRegisteredAt: `${name}.ade_registered_at`,
  }),
}));

vi.mock("@/lib/receipts/document-lines", () => ({
  fetchLinesByDocIds: mockFetchLinesByDocIds,
  groupLinesByDocId: mockGroupLinesByDocId,
  calcDocTotal: mockCalcDocTotal,
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ _and: args }),
  desc: (col: unknown) => ({ _desc: col }),
  eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
  gte: (a: unknown, b: unknown) => ({ _gte: [a, b] }),
  inArray: (a: unknown, b: unknown) => ({ _inArray: [a, b] }),
  lt: (a: unknown, b: unknown) => ({ _lt: [a, b] }),
}));

import {
  RECEIPT_CSV_HEADERS,
  RECEIPT_LINES_CSV_HEADERS,
  buildReceiptLinesCsvStream,
  buildReceiptsCsvStream,
  formatItalianQuantity,
  formatReceiptLineRows,
  formatReceiptRow,
  joinLineDescriptions,
  type ReceiptDocRow,
} from "./csv-export";

function doc(overrides: Partial<ReceiptDocRow> = {}): ReceiptDocRow {
  return {
    id: "doc-1",
    kind: "SALE",
    status: "ACCEPTED",
    adeRegisteredAt: new Date("2026-05-19T12:35:01.000Z"),
    adeProgressive: "00042",
    adeTransactionId: "tx-12345",
    lotteryCode: null,
    voidRegisteredAt: null,
    publicRequest: { paymentMethod: "PC" },
    ...overrides,
  };
}

describe("RECEIPT_CSV_HEADERS", () => {
  it("elenca le colonne in italiano, con gli id tecnici in fondo", () => {
    expect(RECEIPT_CSV_HEADERS).toEqual([
      "data",
      "ora",
      "numero_ade",
      "stato",
      "totale",
      "metodo_pagamento",
      "descrizione",
      "codice_lotteria",
      "data_annullo",
      "id_scontrino",
      "id_transazione_ade",
    ]);
  });

  // `tipo` valeva "SALE" su ogni riga (la query filtra kind = SALE) e
  // `id_documento_annullato` puntava a un documento che nel file non c'e'.
  it("non contiene piu' la colonna costante `tipo` ne' `id_documento_annullato`", () => {
    expect(RECEIPT_CSV_HEADERS).not.toContain("tipo");
    expect(RECEIPT_CSV_HEADERS).not.toContain("id_documento_annullato");
  });
});

describe("joinLineDescriptions", () => {
  it("unisce le descrizioni delle righe con ` | `", () => {
    expect(
      joinLineDescriptions([
        { description: "Caffè" },
        { description: "Cornetto" },
      ]),
    ).toBe("Caffè | Cornetto");
  });

  it("restituisce la sola descrizione su uno scontrino a una riga", () => {
    expect(joinLineDescriptions([{ description: "Caffè" }])).toBe("Caffè");
  });

  it("restituisce stringa vuota se non ci sono righe", () => {
    expect(joinLineDescriptions([])).toBe("");
  });

  // Una cella `Caffè |  | Acqua` sembra un dato perso, non un articolo senza
  // nome: le descrizioni vuote o di soli spazi si saltano.
  it("salta le descrizioni vuote o di soli spazi e ripulisce i margini", () => {
    expect(
      joinLineDescriptions([
        { description: "  Caffè " },
        { description: "   " },
        { description: "" },
        { description: "Acqua" },
      ]),
    ).toBe("Caffè | Acqua");
  });
});

describe("formatReceiptRow", () => {
  it("formatta uno scontrino completo", () => {
    expect(formatReceiptRow(doc(), 12.34, "Caffè | Cornetto")).toEqual([
      "19/05/2026",
      "14:35:01",
      "00042",
      "emesso",
      "12,34",
      "contanti",
      "Caffè | Cornetto",
      "",
      "",
      "doc-1",
      "tx-12345",
    ]);
  });

  it("separa data e ora in due colonne, in ora italiana", () => {
    // Un timestamp unico in una cella sola non e' ordinabile ne' filtrabile
    // in un foglio di calcolo.
    const row = formatReceiptRow(doc(), 0, "");
    expect(row[0]).toBe("19/05/2026");
    expect(row[1]).toBe("14:35:01");
  });

  it("usa l'istante registrato dall'AdE, anche a cavallo del cambio mese", () => {
    // Vendita creata il 31/01 alle 23:59:58 (ora di Roma) e registrata
    // dall'AdE il 01/02 alle 00:00:01: la data del CSV e' quella dell'AdE,
    // la stessa che il cliente legge sul documento consegnato.
    const row = formatReceiptRow(
      doc({ adeRegisteredAt: new Date("2026-01-31T23:00:01.000Z") }),
      0,
      "",
    );
    expect(row[0]).toBe("01/02/2026");
    expect(row[1]).toBe("00:00:01");
  });

  it("usa la virgola come separatore decimale del totale", () => {
    expect(formatReceiptRow(doc(), 1234.5, "")[4]).toBe("1234,50");
    expect(formatReceiptRow(doc(), 0, "")[4]).toBe("0,00");
    expect(formatReceiptRow(doc(), 0.05, "")[4]).toBe("0,05");
  });

  it("traduce gli stati in italiano", () => {
    expect(formatReceiptRow(doc({ status: "ACCEPTED" }), 0, "")[3]).toBe(
      "emesso",
    );
    expect(formatReceiptRow(doc({ status: "VOID_ACCEPTED" }), 0, "")[3]).toBe(
      "annullato",
    );
  });

  // Uno stato nuovo e non ancora tradotto deve restare visibile nel file:
  // una cella vuota si legge come "nessun dato", non come "caso non previsto".
  it("ripiega sul codice grezzo su uno stato sconosciuto", () => {
    expect(formatReceiptRow(doc({ status: "FUTURO" }), 0, "")[3]).toBe(
      "FUTURO",
    );
  });

  it("traduce il metodo di pagamento in italiano", () => {
    expect(
      formatReceiptRow(
        doc({ publicRequest: { paymentMethod: "PC" } }),
        0,
        "",
      )[5],
    ).toBe("contanti");
    expect(
      formatReceiptRow(
        doc({ publicRequest: { paymentMethod: "PE" } }),
        0,
        "",
      )[5],
    ).toBe("elettronico");
  });

  it("ripiega sul codice grezzo su un metodo di pagamento sconosciuto", () => {
    expect(
      formatReceiptRow(
        doc({ publicRequest: { paymentMethod: "PX" } }),
        0,
        "",
      )[5],
    ).toBe("PX");
  });

  it("lascia vuoto il metodo di pagamento quando il jsonb non lo contiene", () => {
    expect(
      formatReceiptRow(
        doc({ publicRequest: { paymentMethod: null } }),
        0,
        "",
      )[5],
    ).toBe("");
    expect(
      formatReceiptRow(
        doc({ publicRequest: "not-an-object" as unknown as null }),
        0,
        "",
      )[5],
    ).toBe("");
    expect(formatReceiptRow(doc({ publicRequest: null }), 0, "")[5]).toBe("");
  });

  it("emette stringa vuota sui campi nullable", () => {
    const row = formatReceiptRow(
      doc({
        adeProgressive: null,
        adeTransactionId: null,
        lotteryCode: null,
        voidRegisteredAt: null,
      }),
      0,
      "",
    );
    expect(row[2]).toBe(""); // numero_ade
    expect(row[7]).toBe(""); // codice_lotteria
    expect(row[8]).toBe(""); // data_annullo
    expect(row[10]).toBe(""); // id_transazione_ade
  });

  it("emette il codice lotteria quando presente", () => {
    expect(formatReceiptRow(doc({ lotteryCode: "ABCDEFGH" }), 0, "")[7]).toBe(
      "ABCDEFGH",
    );
  });

  // `data_annullo` sostituisce il vecchio `id_documento_annullato`: dice
  // QUANDO e' avvenuta la rettifica, cioe' in che periodo cade.
  it("riporta la data dell'annullo sui documenti annullati", () => {
    const row = formatReceiptRow(
      doc({
        status: "VOID_ACCEPTED",
        voidRegisteredAt: new Date("2026-05-20T08:00:00.000Z"),
      }),
      0,
      "",
    );
    expect(row[3]).toBe("annullato");
    expect(row[8]).toBe("20/05/2026");
  });

  it("lascia data_annullo vuota sui documenti non annullati", () => {
    expect(formatReceiptRow(doc({ status: "ACCEPTED" }), 0, "")[8]).toBe("");
  });

  it("tiene gli identificativi tecnici nelle ultime due colonne", () => {
    const row = formatReceiptRow(doc(), 0, "");
    expect(row[9]).toBe("doc-1");
    expect(row[10]).toBe("tx-12345");
  });
});

function setupDbMock(docs: ReceiptDocRow[]) {
  const limit = vi.fn().mockImplementation(() => {
    // First call returns the docs; subsequent calls return empty (loop exit).
    limit.mockResolvedValue([]);
    return Promise.resolve(docs);
  });
  const offset = vi.fn().mockReturnValue({ then: undefined });
  const order = vi.fn();
  const where = vi.fn();
  const leftJoin = vi.fn();
  const from = vi.fn();
  const select = vi.fn();

  select.mockReturnValue({ from });
  from.mockReturnValue({ leftJoin });
  leftJoin.mockReturnValue({ where });
  where.mockReturnValue({ orderBy: order });
  order.mockReturnValue({ limit: () => ({ offset: offset }) });
  offset.mockImplementation((n: number) => {
    return n === 0 ? Promise.resolve(docs) : Promise.resolve([]);
  });

  mockGetDb.mockReturnValue({ select });
}

async function streamToString(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

describe("RECEIPT_LINES_CSV_HEADERS", () => {
  it("elenca le colonne del dettaglio, con la chiave di join in fondo", () => {
    expect(RECEIPT_LINES_CSV_HEADERS).toEqual([
      "data",
      "ora",
      "numero_ade",
      "stato",
      "riga",
      "descrizione",
      "quantita",
      "prezzo_unitario",
      "totale_riga",
      "aliquota",
      "id_scontrino",
    ]);
  });

  it("condivide con il riepilogo le colonne che ricollegano i due file", () => {
    for (const shared of ["data", "ora", "numero_ade", "id_scontrino"]) {
      expect(RECEIPT_CSV_HEADERS).toContain(shared);
      expect(RECEIPT_LINES_CSV_HEADERS).toContain(shared);
    }
  });
});

describe("formatItalianQuantity", () => {
  // `numeric(10,3)` arriva da Postgres come "2.000": scritto cosi' nel CSV,
  // Excel italiano lo legge come DUEMILA.
  it("converte la stringa numeric in decimale italiano senza zeri di coda", () => {
    expect(formatItalianQuantity("2.000")).toBe("2");
    expect(formatItalianQuantity("0.500")).toBe("0,5");
    expect(formatItalianQuantity("1.250")).toBe("1,25");
    expect(formatItalianQuantity("12.345")).toBe("12,345");
  });

  it("tiene gli interi senza parte decimale", () => {
    expect(formatItalianQuantity("10.000")).toBe("10");
    expect(formatItalianQuantity("1000.000")).toBe("1000");
  });

  it("gestisce null e valori non numerici", () => {
    expect(formatItalianQuantity(null)).toBe("0");
    expect(formatItalianQuantity("abc")).toBe("");
  });
});

describe("formatReceiptLineRows", () => {
  const lines = [
    {
      id: "l1",
      documentId: "doc-1",
      lineIndex: 0,
      description: "Caffè",
      quantity: "2.000",
      grossUnitPrice: "1.20",
      vatCode: "22",
    },
    {
      id: "l2",
      documentId: "doc-1",
      lineIndex: 1,
      description: "Cornetto",
      quantity: "1.000",
      grossUnitPrice: "1.50",
      vatCode: "10",
    },
  ];

  it("emette una riga per voce venduta", () => {
    const rows = formatReceiptLineRows(doc(), lines);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual([
      "19/05/2026",
      "14:35:01",
      "00042",
      "emesso",
      "1",
      "Caffè",
      "2",
      "1,20",
      "2,40",
      "22",
      "doc-1",
    ]);
  });

  it("numera le righe da 1, non da 0", () => {
    const rows = formatReceiptLineRows(doc(), lines);
    expect(rows[0][4]).toBe("1");
    expect(rows[1][4]).toBe("2");
  });

  it("ripete i dati del documento su ogni riga (pivot-ready)", () => {
    const rows = formatReceiptLineRows(doc(), lines);
    for (const row of rows) {
      expect(row.slice(0, 4)).toEqual([
        "19/05/2026",
        "14:35:01",
        "00042",
        "emesso",
      ]);
      expect(row[10]).toBe("doc-1");
    }
  });

  it("porta il codice aliquota cosi' com'e', natura incluse", () => {
    const rows = formatReceiptLineRows(doc(), [{ ...lines[0], vatCode: "N2" }]);
    expect(rows[0][9]).toBe("N2");
  });

  // Sommando `totale_riga` si deve riottenere il `totale` del riepilogo: e' la
  // prima cosa che un commercialista verifica fra i due file. Entrambi
  // derivano dai centesimi interi per riga (regola 17).
  it("il totale riga riconcilia al centesimo col totale del riepilogo", () => {
    // 3 righe da 0,10 * 1: in float 0.1+0.2 = 0.30000000000000004
    const thirds = [0, 1, 2].map((i) => ({
      ...lines[0],
      lineIndex: i,
      quantity: "1.000",
      grossUnitPrice: "0.10",
    }));
    const rows = formatReceiptLineRows(doc(), thirds);
    const sumCents = rows.reduce(
      (acc, r) =>
        acc + Math.round(Number.parseFloat(r[8].replace(",", ".")) * 100),
      0,
    );
    expect(sumCents).toBe(30);
    expect(rows.map((r) => r[8])).toEqual(["0,10", "0,10", "0,10"]);
  });

  it("arrotonda il mezzo centesimo per eccesso, non tronca", () => {
    // 0,33 * 1,5 = 0,495 → 50 centesimi interi (round), non 49 (truncate).
    // E' il caso che le quantita' frazionarie (etti, litri, ore) producono
    // davvero in cassa.
    const rows = formatReceiptLineRows(doc(), [
      { ...lines[0], quantity: "1.500", grossUnitPrice: "0.33" },
    ]);
    expect(rows[0][6]).toBe("1,5");
    expect(rows[0][8]).toBe("0,50");
  });

  it("restituisce nessuna riga su un documento senza voci", () => {
    expect(formatReceiptLineRows(doc(), [])).toEqual([]);
  });
});

describe("buildReceiptLinesCsvStream", () => {
  it("emette BOM e header del dettaglio anche senza documenti", async () => {
    setupDbMock([]);
    const body = await streamToString(
      buildReceiptLinesCsvStream({
        businessId: "biz-1",
        status: null,
        dateFrom: null,
        dateTo: null,
      }),
    );
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body).toContain("data;ora;numero_ade;stato;riga;descrizione");
  });

  it("espande uno scontrino di 2 voci in 2 righe CSV", async () => {
    const docLines = [
      {
        documentId: "d1",
        lineIndex: 0,
        description: "Caffè",
        quantity: "2.000",
        grossUnitPrice: "1.20",
        vatCode: "22",
      },
      {
        documentId: "d1",
        lineIndex: 1,
        description: "Cornetto",
        quantity: "1.000",
        grossUnitPrice: "1.50",
        vatCode: "10",
      },
    ];
    setupDbMock([doc({ id: "d1" })]);
    mockFetchLinesByDocIds.mockResolvedValue(docLines);
    mockGroupLinesByDocId.mockReturnValue(new Map([["d1", docLines]]));

    const body = await streamToString(
      buildReceiptLinesCsvStream({
        businessId: "biz-1",
        status: null,
        dateFrom: null,
        dateTo: null,
      }),
    );

    const rows = body.split("\r\n").filter(Boolean);
    expect(rows).toHaveLength(3); // header + 2 voci
    expect(rows[1].split(";")[5]).toBe("Caffè");
    expect(rows[2].split(";")[5]).toBe("Cornetto");
  });
});

describe("buildReceiptsCsvStream", () => {
  it("emits BOM + header row when there are no documents", async () => {
    setupDbMock([]);
    const stream = buildReceiptsCsvStream({
      businessId: "biz-1",
      status: null,
      dateFrom: null,
      dateTo: null,
    });
    const body = await streamToString(stream);
    expect(body.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(body).toContain("data;ora;numero_ade");
    expect(body.trim().split("\r\n")).toHaveLength(1);
  });

  it("streams one CSV row per document, with totals computed from lines", async () => {
    const documents = [doc({ id: "d1" }), doc({ id: "d2" })];
    setupDbMock(documents);

    const d1Lines = [
      {
        documentId: "d1",
        grossUnitPrice: "10.00",
        quantity: "1",
        description: "Caffè",
      },
    ];
    const d2Lines = [
      {
        documentId: "d2",
        grossUnitPrice: "5.00",
        quantity: "2",
        description: "Cornetto",
      },
    ];
    mockFetchLinesByDocIds.mockResolvedValue([...d1Lines, ...d2Lines]);
    mockGroupLinesByDocId.mockReturnValue(
      new Map([
        ["d1", d1Lines],
        ["d2", d2Lines],
      ]),
    );
    mockCalcDocTotal.mockImplementation((lines: unknown[]) =>
      lines[0] && (lines[0] as { documentId: string }).documentId === "d1"
        ? 10
        : 10,
    );

    const stream = buildReceiptsCsvStream({
      businessId: "biz-1",
      status: null,
      dateFrom: null,
      dateTo: null,
    });
    const body = await streamToString(stream);

    const lines = body.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toContain("d1");
    expect(lines[2]).toContain("d2");
    // Le righe articolo del documento collassano nella colonna `descrizione`.
    expect(lines[1].split(";")[6]).toBe("Caffè");
    expect(lines[2].split(";")[6]).toBe("Cornetto");
  });

  // La descrizione e' testo libero dell'utente: e' l'unica colonna in cui
  // possono entrare il separatore, le virgolette o un leader di formula.
  it("quota e neutralizza una descrizione ostile", async () => {
    setupDbMock([doc({ id: "d1" })]);
    const lines = [
      {
        documentId: "d1",
        grossUnitPrice: "1.00",
        quantity: "1",
        description: '=SOMMA(A1); "sconto"',
      },
    ];
    mockFetchLinesByDocIds.mockResolvedValue(lines);
    mockGroupLinesByDocId.mockReturnValue(new Map([["d1", lines]]));
    mockCalcDocTotal.mockReturnValue(1);

    const body = await streamToString(
      buildReceiptsCsvStream({
        businessId: "biz-1",
        status: null,
        dateFrom: null,
        dateTo: null,
      }),
    );

    // Apostrofo davanti (Excel non esegue la formula), virgolette raddoppiate
    // e cella quotata: il `;` interno non spezza la riga in due colonne.
    expect(body).toContain('"\'=SOMMA(A1); ""sconto"""');
    expect(body.split("\r\n").filter(Boolean)).toHaveLength(2);
  });

  it("propagates DB errors via stream.error so callers can detect failure", async () => {
    const limit = vi.fn();
    const order = vi.fn();
    const where = vi.fn();
    const leftJoin = vi.fn();
    const from = vi.fn();
    const select = vi.fn();

    select.mockReturnValue({ from });
    from.mockReturnValue({ leftJoin });
    leftJoin.mockReturnValue({ where });
    where.mockReturnValue({ orderBy: order });
    order.mockReturnValue({
      limit: () => ({
        offset: () => Promise.reject(new Error("db down")),
      }),
    });
    mockGetDb.mockReturnValue({ select });

    const stream = buildReceiptsCsvStream({
      businessId: "biz-1",
      status: null,
      dateFrom: null,
      dateTo: null,
    });

    await expect(streamToString(stream)).rejects.toThrow("db down");
    // Reference unused vars to satisfy strict mode
    expect(limit).toHaveBeenCalledTimes(0);
  });

  it("ordina per ade_registered_at DESC con `id` come chiave secondaria stabile", async () => {
    const order = vi.fn();
    const where = vi.fn();
    const leftJoin = vi.fn();
    const from = vi.fn();
    const select = vi.fn();

    select.mockReturnValue({ from });
    from.mockReturnValue({ leftJoin });
    leftJoin.mockReturnValue({ where });
    where.mockReturnValue({ orderBy: order });
    order.mockReturnValue({ limit: () => ({ offset: () => [] }) });
    mockGetDb.mockReturnValue({ select });

    const stream = buildReceiptsCsvStream({
      businessId: "biz-1",
      status: null,
      dateFrom: null,
      dateTo: null,
    });
    await streamToString(stream);

    // Senza il tiebreaker su `id` l'ordine fra righe con lo stesso
    // `ade_registered_at` non e' definito in Postgres → LIMIT/OFFSET non
    // deterministico.
    expect(order).toHaveBeenCalledWith(
      { _desc: "ade_registered_at" },
      { _desc: "id" },
    );
  });

  it("filtra l'intervallo su ade_registered_at, non su created_at", async () => {
    const order = vi.fn();
    const where = vi.fn();
    const leftJoin = vi.fn();
    const from = vi.fn();
    const select = vi.fn();

    select.mockReturnValue({ from });
    from.mockReturnValue({ leftJoin });
    leftJoin.mockReturnValue({ where });
    where.mockReturnValue({ orderBy: order });
    order.mockReturnValue({ limit: () => ({ offset: () => [] }) });
    mockGetDb.mockReturnValue({ select });

    const dateFrom = new Date("2026-01-01T00:00:00.000Z");
    const dateTo = new Date("2026-02-01T00:00:00.000Z");
    const stream = buildReceiptsCsvStream({
      businessId: "biz-1",
      status: null,
      dateFrom,
      dateTo,
    });
    await streamToString(stream);

    // Colonna mostrata e predicato di selezione devono essere la stessa
    // grandezza: un CSV in cui la data di una riga contraddice il filtro che
    // l'ha inclusa e' peggio di entrambe le scelte prese da sole.
    const conditions = (where.mock.calls[0][0] as { _and: unknown[] })._and;
    expect(conditions).toContainEqual({
      _gte: ["ade_registered_at", dateFrom],
    });
    expect(conditions).toContainEqual({ _lt: ["ade_registered_at", dateTo] });
  });
});

/**
 * Regressione finding #74: con `ade_registered_at` duplicati la paginazione
 * LIMIT/OFFSET puo' ripetere o saltare righe se l'ORDER BY non e' un ordine
 * *totale*. Il fake DB qui sotto simula un Postgres che riordina liberamente
 * le righe a parita' di chiave di ordinamento — comportamento legittimo e
 * osservabile in produzione (piani diversi, letture parallele, sort non stabile).
 */
describe("buildReceiptsCsvStream — paginazione con ade_registered_at duplicati", () => {
  const SAME_INSTANT = new Date("2026-05-19T12:34:56.789Z");

  function makeDocs(n: number): ReceiptDocRow[] {
    return Array.from({ length: n }, (_, i) =>
      doc({
        id: `d${String(i).padStart(4, "0")}`,
        adeRegisteredAt: SAME_INSTANT,
      }),
    );
  }

  /**
   * Applica l'ORDER BY richiesto. A parita' di `ade_registered_at`:
   * - con tiebreaker su `id` → ordine totale, identico a ogni esecuzione;
   * - senza → l'ordine fra i pari varia a ogni query (qui: rotazione).
   */
  function applyOrder(
    all: ReceiptDocRow[],
    orderKeys: { _desc: string }[],
    queryIndex: number,
  ): ReceiptDocRow[] {
    const byRegisteredDesc = [...all].sort(
      (a, b) => b.adeRegisteredAt.getTime() - a.adeRegisteredAt.getTime(),
    );
    if (orderKeys.some((k) => k._desc === "id")) {
      return byRegisteredDesc.sort(
        (a, b) =>
          b.adeRegisteredAt.getTime() - a.adeRegisteredAt.getTime() ||
          b.id.localeCompare(a.id),
      );
    }
    const shift = (queryIndex * 7) % byRegisteredDesc.length;
    return [
      ...byRegisteredDesc.slice(shift),
      ...byRegisteredDesc.slice(0, shift),
    ];
  }

  function setupUnstableDbMock(all: ReceiptDocRow[]) {
    let queryIndex = 0;
    let orderKeys: { _desc: string }[] = [];

    const select = vi.fn().mockReturnValue({
      from: () => ({
        leftJoin: () => ({
          where: () => ({
            orderBy: (...keys: { _desc: string }[]) => {
              orderKeys = keys;
              return {
                limit: (batchSize: number) => ({
                  offset: (offset: number) => {
                    const ordered = applyOrder(all, orderKeys, queryIndex);
                    queryIndex += 1;
                    return Promise.resolve(
                      ordered.slice(offset, offset + batchSize),
                    );
                  },
                }),
              };
            },
          }),
        }),
      }),
    });

    mockGetDb.mockReturnValue({ select });
  }

  it("emette esattamente una riga per documento su 1200 doc con lo stesso ade_registered_at", async () => {
    const all = makeDocs(1200); // 3 batch da 500
    setupUnstableDbMock(all);
    mockFetchLinesByDocIds.mockResolvedValue([]);
    mockGroupLinesByDocId.mockReturnValue(new Map());
    mockCalcDocTotal.mockReturnValue(0);

    const stream = buildReceiptsCsvStream({
      businessId: "biz-1",
      status: null,
      dateFrom: null,
      dateTo: null,
    });
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
    let body = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();

    const rows = body.split("\r\n").filter(Boolean).slice(1); // scarta l'header
    // `id_scontrino` e' la decima colonna (gli id tecnici stanno in fondo).
    const ids = rows.map((r) => r.split(";")[9]);

    expect(rows).toHaveLength(1200);
    expect(new Set(ids).size).toBe(1200);
    expect(new Set(ids)).toEqual(new Set(all.map((d) => d.id)));
  });
});
