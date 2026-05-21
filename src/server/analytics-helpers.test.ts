// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  computeBreakdown,
  computeKpis,
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

describe("fillMissingDays", () => {
  it("returns one entry per fiscal day in the range", () => {
    const { from, to } = rangeToBounds("7d", new Date("2026-05-19T12:00:00Z"));
    const out = fillMissingDays(new Map([["2026-05-19", 100]]), from, to);
    expect(out).toHaveLength(7);
    expect(out.find((p) => p.date === "2026-05-19")?.revenueCents).toBe(100);
    expect(out.find((p) => p.date === "2026-05-18")?.revenueCents).toBe(0);
  });
});
