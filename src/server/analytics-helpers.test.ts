// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  computeBreakdown,
  computeKpis,
  computeProductBreakdown,
  computeTimeseries,
  fillMissingDays,
  formatRomeDay,
  normalizePaymentMethod,
  rangeToBounds,
  romeMidnightUtc,
  toCents,
} from "./analytics-helpers";

type DocRow = {
  id: string;
  status: string;
  createdAt: Date;
  publicRequest?: unknown;
};

function makeDoc(
  id: string,
  status: string,
  createdAt: Date,
  publicRequest?: unknown,
): DocRow {
  return { id, status, createdAt, publicRequest };
}

describe("toCents", () => {
  it("rounds floating amounts to integer cents", () => {
    expect(toCents(1.235)).toBe(124);
    expect(toCents(0)).toBe(0);
    expect(toCents(10)).toBe(1000);
  });
});

describe("normalizePaymentMethod", () => {
  it("returns PC and PE unchanged", () => {
    expect(normalizePaymentMethod("PC")).toBe("PC");
    expect(normalizePaymentMethod("PE")).toBe("PE");
  });

  it("maps unknown values to 'other'", () => {
    expect(normalizePaymentMethod("XX")).toBe("other");
    expect(normalizePaymentMethod(null)).toBe("other");
    expect(normalizePaymentMethod(undefined)).toBe("other");
    expect(normalizePaymentMethod(123)).toBe("other");
  });
});

describe("formatRomeDay / romeMidnightUtc", () => {
  it("buckets a midnight-Rome receipt under the correct fiscal day", () => {
    // 2026-05-18T22:30Z = 00:30 Rome del 19 maggio (CEST)
    expect(formatRomeDay(new Date("2026-05-18T22:30:00Z"))).toBe("2026-05-19");
  });

  it("romeMidnightUtc returns the UTC instant of Rome midnight", () => {
    // In CEST (DST), midnight Rome = 22:00 UTC del giorno precedente.
    const utc = romeMidnightUtc("2026-05-19");
    expect(utc.toISOString()).toBe("2026-05-18T22:00:00.000Z");
  });
});

describe("computeKpis", () => {
  it("returns all zeros for empty docs", () => {
    const kpis = computeKpis([], new Map());
    expect(kpis).toEqual({
      revenueCents: 0,
      count: 0,
      aovCents: 0,
      voidCount: 0,
    });
  });

  it("sums revenue and counts only ACCEPTED, separating VOID_ACCEPTED", () => {
    const docs = [
      makeDoc("a", "ACCEPTED", new Date("2026-05-01T10:00:00Z")),
      makeDoc("b", "ACCEPTED", new Date("2026-05-02T10:00:00Z")),
      makeDoc("c", "VOID_ACCEPTED", new Date("2026-05-03T10:00:00Z")),
    ];
    const totals = new Map([
      ["a", 10],
      ["b", 5],
      ["c", 20],
    ]);

    const kpis = computeKpis(docs, totals);
    expect(kpis.revenueCents).toBe(1500);
    expect(kpis.count).toBe(2);
    // aovCents = revenue / count = 1500 / 2 = 750
    expect(kpis.aovCents).toBe(750);
    expect(kpis.voidCount).toBe(1);
  });

  it("uses 0 as fallback for docs without a total entry", () => {
    const docs = [makeDoc("a", "ACCEPTED", new Date())];
    const kpis = computeKpis(docs, new Map());
    expect(kpis.revenueCents).toBe(0);
    expect(kpis.count).toBe(1);
    expect(kpis.aovCents).toBe(0);
  });
});

describe("computeTimeseries", () => {
  it("groups revenue by Italian fiscal day and fills gaps with zero", () => {
    const { from, to } = rangeToBounds("7d", new Date("2026-05-19T12:00:00Z"));
    const docs = [
      makeDoc("d1", "ACCEPTED", new Date("2026-05-17T10:00:00Z")),
      makeDoc("d2", "ACCEPTED", new Date("2026-05-19T09:00:00Z")),
      makeDoc("d3", "ACCEPTED", new Date("2026-05-19T11:00:00Z")),
    ];
    const totals = new Map([
      ["d1", 10],
      ["d2", 5],
      ["d3", 5],
    ]);

    const ts = computeTimeseries(docs, totals, from, to);
    expect(ts).toHaveLength(7);
    const byDate = Object.fromEntries(ts.map((p) => [p.date, p.revenueCents]));
    expect(byDate["2026-05-17"]).toBe(1000);
    expect(byDate["2026-05-18"]).toBe(0);
    expect(byDate["2026-05-19"]).toBe(1000);
  });

  it("excludes VOID_ACCEPTED documents from the timeseries", () => {
    const { from, to } = rangeToBounds("7d", new Date("2026-05-19T12:00:00Z"));
    const docs = [
      makeDoc("a", "VOID_ACCEPTED", new Date("2026-05-18T10:00:00Z")),
    ];
    const totals = new Map([["a", 999]]);

    const ts = computeTimeseries(docs, totals, from, to);
    const byDate = Object.fromEntries(ts.map((p) => [p.date, p.revenueCents]));
    expect(byDate["2026-05-18"]).toBe(0);
  });
});

describe("computeBreakdown", () => {
  it("aggregates by payment method ignoring VOID_ACCEPTED", () => {
    const docs = [
      makeDoc("a", "ACCEPTED", new Date(), { paymentMethod: "PC" }),
      makeDoc("b", "ACCEPTED", new Date(), { paymentMethod: "PE" }),
      makeDoc("c", "ACCEPTED", new Date(), { paymentMethod: "PC" }),
      makeDoc("d", "VOID_ACCEPTED", new Date(), { paymentMethod: "PC" }),
    ];
    const totals = new Map([
      ["a", 10],
      ["b", 5],
      ["c", 3],
      ["d", 999],
    ]);

    const breakdown = computeBreakdown(docs, totals);
    const byMethod = Object.fromEntries(breakdown.map((e) => [e.method, e]));

    expect(byMethod["PC"]).toEqual({
      method: "PC",
      count: 2,
      revenueCents: 1300,
    });
    expect(byMethod["PE"]).toEqual({
      method: "PE",
      count: 1,
      revenueCents: 500,
    });
    expect(byMethod["VOID"]).toBeUndefined();
  });

  it("maps unknown payment methods to 'other'", () => {
    const docs = [
      makeDoc("a", "ACCEPTED", new Date(), { paymentMethod: "XX" }),
      makeDoc("b", "ACCEPTED", new Date(), { paymentMethod: undefined }),
      makeDoc("c", "ACCEPTED", new Date(), null),
    ];
    const totals = new Map([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);

    const breakdown = computeBreakdown(docs, totals);
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0].method).toBe("other");
    expect(breakdown[0].count).toBe(3);
    expect(breakdown[0].revenueCents).toBe(600);
  });

  it("returns empty array for no ACCEPTED docs", () => {
    const docs = [makeDoc("a", "VOID_ACCEPTED", new Date())];
    const totals = new Map([["a", 10]]);
    expect(computeBreakdown(docs, totals)).toEqual([]);
  });
});

describe("computeProductBreakdown", () => {
  type LineRow = {
    documentId: string;
    description: string;
    quantity: string;
    grossUnitPrice: string;
  };
  function makeLines(rows: LineRow[]): Map<string, LineRow[]> {
    const map = new Map<string, LineRow[]>();
    for (const r of rows) {
      const arr = map.get(r.documentId) ?? [];
      arr.push(r);
      map.set(r.documentId, arr);
    }
    return map;
  }

  it("returns empty array when there are no docs", () => {
    expect(computeProductBreakdown([], new Map())).toEqual([]);
  });

  it("excludes lines from VOID_ACCEPTED documents", () => {
    const docs = [
      makeDoc("a", "VOID_ACCEPTED", new Date("2026-05-01T10:00:00Z")),
    ];
    const linesByDoc = makeLines([
      {
        documentId: "a",
        description: "Caffè",
        quantity: "1",
        grossUnitPrice: "1.50",
      },
    ]);
    expect(computeProductBreakdown(docs, linesByDoc)).toEqual([]);
  });

  it("groups by case-insensitive + trimmed description (label = most frequent variant)", () => {
    const docs = [
      makeDoc("a", "ACCEPTED", new Date()),
      makeDoc("b", "ACCEPTED", new Date()),
      makeDoc("c", "ACCEPTED", new Date()),
    ];
    const linesByDoc = makeLines([
      {
        documentId: "a",
        description: "Caffè",
        quantity: "1",
        grossUnitPrice: "1.00",
      },
      {
        documentId: "b",
        description: "  caffè ",
        quantity: "1",
        grossUnitPrice: "1.00",
      },
      {
        documentId: "c",
        description: "Caffè",
        quantity: "1",
        grossUnitPrice: "1.00",
      },
    ]);
    const out = computeProductBreakdown(docs, linesByDoc);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      description: "Caffè",
      revenueCents: 300,
      count: 3,
    });
  });

  it("renders empty description as '(senza descrizione)'", () => {
    const docs = [makeDoc("a", "ACCEPTED", new Date())];
    const linesByDoc = makeLines([
      {
        documentId: "a",
        description: "   ",
        quantity: "2",
        grossUnitPrice: "1.50",
      },
    ]);
    const out = computeProductBreakdown(docs, linesByDoc);
    expect(out).toEqual([
      { description: "(senza descrizione)", revenueCents: 300, count: 1 },
    ]);
  });

  it("orders by revenue desc and keeps Top 10 with 'Altro' bucket aggregating the tail", () => {
    const docs: ReturnType<typeof makeDoc>[] = [];
    const lines: LineRow[] = [];
    // 12 distinct products: prod-01 revenue 12.00, prod-02 revenue 11.00, ...
    // prod-12 revenue 1.00. Top 10 = prod-01..prod-10, "Altro" = prod-11 + prod-12 = 3.00.
    for (let i = 1; i <= 12; i++) {
      const id = `d${i}`;
      docs.push(makeDoc(id, "ACCEPTED", new Date()));
      const price = (13 - i).toFixed(2); // 12.00, 11.00, ..., 1.00
      lines.push({
        documentId: id,
        description: `prod-${String(i).padStart(2, "0")}`,
        quantity: "1",
        grossUnitPrice: price,
      });
    }
    const out = computeProductBreakdown(docs, makeLines(lines));
    expect(out).toHaveLength(11);
    expect(out[0]).toEqual({
      description: "prod-01",
      revenueCents: 1200,
      count: 1,
    });
    expect(out[9]).toEqual({
      description: "prod-10",
      revenueCents: 300,
      count: 1,
    });
    expect(out[10]).toEqual({
      description: "Altro",
      revenueCents: 300, // prod-11 (2.00) + prod-12 (1.00)
      count: 2,
    });
  });

  it("L1: tiebreak also handles the reverse order branch (a > b)", () => {
    // Three products with same revenue, names that force the sort to call
    // the comparator multiple times in both directions. Ensures both
    // branches of the tiebreak (`< -1` and `> +1`) are exercised.
    const docs = [
      makeDoc("a", "ACCEPTED", new Date()),
      makeDoc("b", "ACCEPTED", new Date()),
      makeDoc("c", "ACCEPTED", new Date()),
    ];
    const linesByDoc = makeLines([
      {
        documentId: "a",
        description: "ciliegia",
        quantity: "1",
        grossUnitPrice: "2.00",
      },
      {
        documentId: "b",
        description: "ananas",
        quantity: "1",
        grossUnitPrice: "2.00",
      },
      {
        documentId: "c",
        description: "banana",
        quantity: "1",
        grossUnitPrice: "2.00",
      },
    ]);
    const out = computeProductBreakdown(docs, linesByDoc);
    expect(out.map((e) => e.description)).toEqual([
      "ananas",
      "banana",
      "ciliegia",
    ]);
  });

  it("L1: tiebreak is byte-wise Unicode (no localeCompare), stable across container locales", () => {
    // Due prodotti con stesso revenue ma chiavi che ordinano DIVERSAMENTE
    // sotto locale "it_IT" vs byte-wise. `caffè` (U+00E8) vs `caffé`
    // (U+00E9): byte-wise → "caffè" < "caffé" è FALSO (è > perché 0xE8 < 0xE9
    // ma poiché entrambi hanno la stessa lunghezza, e8 < e9 → "caffè" < "caffé").
    // Inversamente sotto locale italiano collation. Il test fissa l'ordine
    // atteso per il confronto puro Unicode così che dev/CI/prod/sandbox
    // restituiscano sempre lo stesso top-N.
    const docs = [
      makeDoc("a", "ACCEPTED", new Date()),
      makeDoc("b", "ACCEPTED", new Date()),
    ];
    const linesByDoc = makeLines([
      {
        documentId: "a",
        description: "caffè", // 0x63 0x61 0x66 0x66 0xE8
        quantity: "1",
        grossUnitPrice: "2.00",
      },
      {
        documentId: "b",
        description: "caffé", // 0x63 0x61 0x66 0x66 0xE9
        quantity: "1",
        grossUnitPrice: "2.00",
      },
    ]);
    const out = computeProductBreakdown(docs, linesByDoc);
    // Stesso revenue → tiebreak alfabetico byte-wise: 'è' (0xE8) viene
    // prima di 'é' (0xE9), quindi "caffè" è primo.
    expect(out[0]?.description).toBe("caffè");
    expect(out[1]?.description).toBe("caffé");
  });

  it("does not append 'Altro' when product count is <= topN", () => {
    const docs: ReturnType<typeof makeDoc>[] = [];
    const lines: LineRow[] = [];
    for (let i = 1; i <= 10; i++) {
      const id = `d${i}`;
      docs.push(makeDoc(id, "ACCEPTED", new Date()));
      lines.push({
        documentId: id,
        description: `prod-${i}`,
        quantity: "1",
        grossUnitPrice: (11 - i).toFixed(2),
      });
    }
    const out = computeProductBreakdown(docs, makeLines(lines));
    expect(out).toHaveLength(10);
    expect(out.find((e) => e.description === "Altro")).toBeUndefined();
  });

  it("uses integer cents math (no IEEE-754 drift with fractional qty)", () => {
    const docs = [makeDoc("a", "ACCEPTED", new Date())];
    const linesByDoc = makeLines([
      {
        documentId: "a",
        description: "X",
        quantity: "0.1",
        grossUnitPrice: "0.20",
      },
      {
        documentId: "a",
        description: "X",
        quantity: "0.1",
        grossUnitPrice: "0.20",
      },
      {
        documentId: "a",
        description: "X",
        quantity: "0.1",
        grossUnitPrice: "0.20",
      },
    ]);
    const out = computeProductBreakdown(docs, linesByDoc);
    // 3 × Math.round(0.1 * 0.20 * 100) = 3 × Math.round(2) = 6 cents
    expect(out[0].revenueCents).toBe(6);
    expect(out[0].count).toBe(3);
  });

  it("picks alphabetically-first variant on frequency tie (deterministic label)", () => {
    const docs = [
      makeDoc("a", "ACCEPTED", new Date()),
      makeDoc("b", "ACCEPTED", new Date()),
    ];
    const linesByDoc = makeLines([
      {
        documentId: "a",
        description: "Pizza",
        quantity: "1",
        grossUnitPrice: "5.00",
      },
      {
        documentId: "b",
        description: "PIZZA",
        quantity: "1",
        grossUnitPrice: "5.00",
      },
    ]);
    const out = computeProductBreakdown(docs, linesByDoc);
    expect(out).toHaveLength(1);
    // Tie 1-1: alphabetical → "PIZZA" before "Pizza" (uppercase < lowercase)
    expect(out[0].description).toBe("PIZZA");
  });

  it("matches doc-level rounding (calcDocTotal) so KPI and product totals reconcile", () => {
    // 3 righe stesso prodotto, qty=0.333, price=1.00.
    // Round per-riga: round(33.3) * 3 = 99 cents (WRONG, drift).
    // Doc-level round: round((0.333+0.333+0.333) * 100) = round(99.9) = 100.
    // Il breakdown DEVE usare il doc-level per essere coerente con i KPI.
    const docs = [makeDoc("a", "ACCEPTED", new Date())];
    const linesByDoc = makeLines([
      {
        documentId: "a",
        description: "X",
        quantity: "0.333",
        grossUnitPrice: "1.00",
      },
      {
        documentId: "a",
        description: "X",
        quantity: "0.333",
        grossUnitPrice: "1.00",
      },
      {
        documentId: "a",
        description: "X",
        quantity: "0.333",
        grossUnitPrice: "1.00",
      },
    ]);
    const out = computeProductBreakdown(docs, linesByDoc);
    expect(out[0].revenueCents).toBe(100);
    expect(out[0].count).toBe(3);
  });

  it("uses deterministic alphabetical tiebreak when revenues are equal", () => {
    // Tre prodotti con stesso revenue (200 cents). Senza tiebreak l'ordine
    // dipende dall'insertion order (e quindi dall'ordine delle righe DB).
    // Con tiebreak per chiave normalizzata: banana → ciliegia → mela.
    const docs = [
      makeDoc("a", "ACCEPTED", new Date()),
      makeDoc("b", "ACCEPTED", new Date()),
      makeDoc("c", "ACCEPTED", new Date()),
    ];
    const linesByDoc = makeLines([
      {
        documentId: "a",
        description: "mela",
        quantity: "1",
        grossUnitPrice: "2.00",
      },
      {
        documentId: "b",
        description: "ciliegia",
        quantity: "1",
        grossUnitPrice: "2.00",
      },
      {
        documentId: "c",
        description: "banana",
        quantity: "1",
        grossUnitPrice: "2.00",
      },
    ]);
    const out = computeProductBreakdown(docs, linesByDoc);
    expect(out.map((e) => e.description)).toEqual([
      "banana",
      "ciliegia",
      "mela",
    ]);
  });

  it("respects a custom topN parameter", () => {
    const docs: ReturnType<typeof makeDoc>[] = [];
    const lines: LineRow[] = [];
    for (let i = 1; i <= 5; i++) {
      const id = `d${i}`;
      docs.push(makeDoc(id, "ACCEPTED", new Date()));
      lines.push({
        documentId: id,
        description: `prod-${i}`,
        quantity: "1",
        grossUnitPrice: (6 - i).toFixed(2),
      });
    }
    const out = computeProductBreakdown(docs, makeLines(lines), 3);
    expect(out).toHaveLength(4); // Top 3 + Altro
    expect(out[3]).toEqual({
      description: "Altro",
      revenueCents: 300, // 2 + 1 = 3.00
      count: 2,
    });
  });
});

describe("fillMissingDays", () => {
  it("returns one entry per fiscal day in the range", () => {
    const { from, to } = rangeToBounds("7d", new Date("2026-05-19T12:00:00Z"));
    const out = fillMissingDays(new Map([["2026-05-19", 100]]), from, to);
    expect(out).toHaveLength(7);
    expect(out.find((p) => p.date === "2026-05-19")?.revenueCents).toBe(100);
    expect(out.find((p) => p.date === "2026-05-18")?.revenueCents).toBe(0);
  });
});
