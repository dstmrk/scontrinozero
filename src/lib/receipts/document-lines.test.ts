// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({ select: mockSelect }),
}));

vi.mock("@/db/schema", () => ({
  commercialDocumentLines: "commercial-document-lines-table",
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSelectBuilder(result: unknown[]) {
  const builder = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn().mockResolvedValue(result),
  };
  builder.from.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  return builder;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import {
  fetchLinesByDocIds,
  groupLinesByDocId,
  calcDocTotal,
} from "./document-lines";

const DOC_A = "doc-aaaa";
const DOC_B = "doc-bbbb";

const LINE_A1 = {
  id: "line-a1",
  documentId: DOC_A,
  lineIndex: 0,
  description: "Prodotto A",
  quantity: "2.000",
  grossUnitPrice: "10.00",
  vatCode: "22",
};

const LINE_A2 = {
  id: "line-a2",
  documentId: DOC_A,
  lineIndex: 1,
  description: "Prodotto B",
  quantity: "1.000",
  grossUnitPrice: "5.50",
  vatCode: "10",
};

const LINE_B1 = {
  id: "line-b1",
  documentId: DOC_B,
  lineIndex: 0,
  description: "Servizio X",
  quantity: "3.000",
  grossUnitPrice: "8.00",
  vatCode: "22",
};

// ---------------------------------------------------------------------------
// fetchLinesByDocIds
// ---------------------------------------------------------------------------

describe("fetchLinesByDocIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restituisce le righe dal DB per i docIds forniti", async () => {
    mockSelect.mockReturnValueOnce(makeSelectBuilder([LINE_A1, LINE_A2]));

    const result = await fetchLinesByDocIds([DOC_A]);

    expect(result).toEqual([LINE_A1, LINE_A2]);
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("restituisce array vuoto se il DB non ha righe per i docIds", async () => {
    mockSelect.mockReturnValueOnce(makeSelectBuilder([]));

    const result = await fetchLinesByDocIds([DOC_A, DOC_B]);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// groupLinesByDocId
// ---------------------------------------------------------------------------

describe("groupLinesByDocId", () => {
  it("raggruppa correttamente righe di documenti diversi", () => {
    const lines = [LINE_A1, LINE_A2, LINE_B1];
    const map = groupLinesByDocId(lines);

    expect(map.size).toBe(2);
    expect(map.get(DOC_A)).toEqual([LINE_A1, LINE_A2]);
    expect(map.get(DOC_B)).toEqual([LINE_B1]);
  });

  it("restituisce Map vuota per input vuoto", () => {
    const map = groupLinesByDocId([]);

    expect(map.size).toBe(0);
  });

  it("gestisce un documento con una sola riga", () => {
    const map = groupLinesByDocId([LINE_A1]);

    expect(map.size).toBe(1);
    expect(map.get(DOC_A)).toEqual([LINE_A1]);
  });

  it("restituisce undefined per un documentId non presente", () => {
    const map = groupLinesByDocId([LINE_A1]);

    expect(map.get("doc-sconosciuto")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// calcDocTotal
// ---------------------------------------------------------------------------

describe("calcDocTotal", () => {
  it("calcola il totale correttamente per più righe", () => {
    // 2 * 10.00 + 1 * 5.50 = 25.50
    const total = calcDocTotal([LINE_A1, LINE_A2]);

    expect(total).toBe(25.5);
  });

  it("restituisce 0 per array vuoto", () => {
    expect(calcDocTotal([])).toBe(0);
  });

  it("arrotonda a 2 decimali", () => {
    const line = {
      ...LINE_A1,
      quantity: "1.000",
      grossUnitPrice: "0.01",
    };
    // 1 * 0.01 = 0.01
    expect(calcDocTotal([line])).toBe(0.01);
  });

  it("gestisce quantità decimali (3dp)", () => {
    const line = { ...LINE_A1, quantity: "1.500", grossUnitPrice: "4.00" };
    // 1.5 * 4.00 = 6.00
    expect(calcDocTotal([line])).toBe(6.0);
  });

  it("calcola il totale per una singola riga", () => {
    // 3 * 8.00 = 24.00
    expect(calcDocTotal([LINE_B1])).toBe(24.0);
  });
});
