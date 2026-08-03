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
    createdAt: "created_at",
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
  buildReceiptsCsvStream,
  formatReceiptRow,
  type ReceiptDocRow,
} from "./csv-export";

function doc(overrides: Partial<ReceiptDocRow> = {}): ReceiptDocRow {
  return {
    id: "doc-1",
    kind: "SALE",
    status: "ACCEPTED",
    createdAt: new Date("2026-05-19T12:34:56.789Z"),
    adeProgressive: "00042",
    adeTransactionId: "tx-12345",
    lotteryCode: null,
    voidingDocumentId: null,
    publicRequest: { paymentMethod: "PC" },
    ...overrides,
  };
}

describe("RECEIPT_CSV_HEADERS", () => {
  it("has the expected Italian column names", () => {
    expect(RECEIPT_CSV_HEADERS).toEqual([
      "id",
      "numero_ade",
      "data_emissione",
      "tipo",
      "stato",
      "totale",
      "metodo_pagamento",
      "codice_lotteria",
      "id_transazione_ade",
      "id_documento_annullato",
    ]);
  });
});

describe("formatReceiptRow", () => {
  it("formats a fully populated SALE document", () => {
    const row = formatReceiptRow(doc(), 12.34);
    expect(row).toEqual([
      "doc-1",
      "00042",
      "2026-05-19T14:34:56+02:00",
      "SALE",
      "ACCEPTED",
      "12,34",
      "PC",
      "",
      "tx-12345",
      "",
    ]);
  });

  it("uses Italian comma as decimal separator for the total", () => {
    expect(formatReceiptRow(doc(), 1234.5)[5]).toBe("1234,50");
    expect(formatReceiptRow(doc(), 0)[5]).toBe("0,00");
    expect(formatReceiptRow(doc(), 0.05)[5]).toBe("0,05");
  });

  it("emits empty strings for nullable fields", () => {
    const row = formatReceiptRow(
      doc({
        adeProgressive: null,
        adeTransactionId: null,
        lotteryCode: null,
        voidingDocumentId: null,
        publicRequest: null,
      }),
      0,
    );
    expect(row[1]).toBe(""); // numero_ade
    expect(row[6]).toBe(""); // metodo_pagamento
    expect(row[7]).toBe(""); // codice_lotteria
    expect(row[8]).toBe(""); // id_transazione_ade
    expect(row[9]).toBe(""); // id_documento_annullato
  });

  it("emits lotteryCode when present", () => {
    const row = formatReceiptRow(doc({ lotteryCode: "ABCDEFGH" }), 0);
    expect(row[7]).toBe("ABCDEFGH");
  });

  it("popola id_documento_annullato dal LEFT JOIN su VOID quando il SALE e' annullato", () => {
    // Su un SALE VOID_ACCEPTED, voidingDocumentId arriva dal JOIN
    // (= id del documento VOID che ha annullato questo SALE).
    const row = formatReceiptRow(
      doc({ status: "VOID_ACCEPTED", voidingDocumentId: "void-doc-99" }),
      0,
    );
    expect(row[4]).toBe("VOID_ACCEPTED");
    expect(row[9]).toBe("void-doc-99");
  });

  it("lascia id_documento_annullato vuoto sui SALE non annullati", () => {
    const row = formatReceiptRow(
      doc({ status: "ACCEPTED", voidingDocumentId: null }),
      0,
    );
    expect(row[9]).toBe("");
  });

  it("extracts paymentMethod from publicRequest jsonb", () => {
    expect(
      formatReceiptRow(doc({ publicRequest: { paymentMethod: "PE" } }), 0)[6],
    ).toBe("PE");
    expect(
      formatReceiptRow(doc({ publicRequest: { paymentMethod: null } }), 0)[6],
    ).toBe("");
    expect(
      formatReceiptRow(
        doc({ publicRequest: "not-an-object" as unknown as null }),
        0,
      )[6],
    ).toBe("");
  });
});

describe("buildReceiptsCsvStream", () => {
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
    expect(body).toContain("id,numero_ade,data_emissione");
    expect(body.trim().split("\r\n")).toHaveLength(1);
  });

  it("streams one CSV row per document, with totals computed from lines", async () => {
    const documents = [doc({ id: "d1" }), doc({ id: "d2" })];
    setupDbMock(documents);

    mockFetchLinesByDocIds.mockResolvedValue([
      { documentId: "d1", grossUnitPrice: "10.00", quantity: "1" },
      { documentId: "d2", grossUnitPrice: "5.00", quantity: "2" },
    ]);
    mockGroupLinesByDocId.mockReturnValue(
      new Map([
        ["d1", [{ documentId: "d1", grossUnitPrice: "10.00", quantity: "1" }]],
        ["d2", [{ documentId: "d2", grossUnitPrice: "5.00", quantity: "2" }]],
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

  it("ordina per created_at DESC con `id` come chiave secondaria stabile", async () => {
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
    // `created_at` non e' definito in Postgres → LIMIT/OFFSET non deterministico.
    expect(order).toHaveBeenCalledWith(
      { _desc: "created_at" },
      { _desc: "id" },
    );
  });
});

/**
 * Regressione finding #74: con `created_at` duplicati la paginazione
 * LIMIT/OFFSET puo' ripetere o saltare righe se l'ORDER BY non e' un ordine
 * *totale*. Il fake DB qui sotto simula un Postgres che riordina liberamente
 * le righe a parita' di chiave di ordinamento — comportamento legittimo e
 * osservabile in produzione (piani diversi, letture parallele, sort non stabile).
 */
describe("buildReceiptsCsvStream — paginazione con created_at duplicati", () => {
  const SAME_INSTANT = new Date("2026-05-19T12:34:56.789Z");

  function makeDocs(n: number): ReceiptDocRow[] {
    return Array.from({ length: n }, (_, i) =>
      doc({ id: `d${String(i).padStart(4, "0")}`, createdAt: SAME_INSTANT }),
    );
  }

  /**
   * Applica l'ORDER BY richiesto. A parita' di `created_at`:
   * - con tiebreaker su `id` → ordine totale, identico a ogni esecuzione;
   * - senza → l'ordine fra i pari varia a ogni query (qui: rotazione).
   */
  function applyOrder(
    all: ReceiptDocRow[],
    orderKeys: { _desc: string }[],
    queryIndex: number,
  ): ReceiptDocRow[] {
    const byCreatedDesc = [...all].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    if (orderKeys.some((k) => k._desc === "id")) {
      return byCreatedDesc.sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.id.localeCompare(a.id),
      );
    }
    const shift = (queryIndex * 7) % byCreatedDesc.length;
    return [...byCreatedDesc.slice(shift), ...byCreatedDesc.slice(0, shift)];
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

  it("emette esattamente una riga per documento su 1200 doc con lo stesso created_at", async () => {
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
    const ids = rows.map((r) => r.split(",")[0]);

    expect(rows).toHaveLength(1200);
    expect(new Set(ids).size).toBe(1200);
    expect(new Set(ids)).toEqual(new Set(all.map((d) => d.id)));
  });
});
