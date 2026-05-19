// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetAuthenticatedUser,
  mockCheckBusinessOwnership,
  mockGetPlan,
  mockSelect,
  mockFetchLinesByDocIds,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockCheckBusinessOwnership: vi.fn(),
  mockGetPlan: vi.fn(),
  mockSelect: vi.fn(),
  mockFetchLinesByDocIds: vi.fn(),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
  checkBusinessOwnership: mockCheckBusinessOwnership,
}));

vi.mock("@/lib/plans", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/plans")>("@/lib/plans");
  return {
    ...actual,
    getPlan: mockGetPlan,
  };
});

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({ select: mockSelect }),
}));

vi.mock("@/db/schema", () => ({
  commercialDocuments: {
    id: "id",
    businessId: "business_id",
    kind: "kind",
    status: "status",
    createdAt: "created_at",
    publicRequest: "public_request",
  },
}));

vi.mock("@/lib/receipts/document-lines", () => ({
  fetchLinesByDocIds: mockFetchLinesByDocIds,
  groupLinesByDocId: (lines: { documentId: string }[]) => {
    const m = new Map<string, typeof lines>();
    for (const l of lines) {
      const arr = m.get(l.documentId) ?? [];
      arr.push(l);
      m.set(l.documentId, arr);
    }
    return m;
  },
  calcDocTotal: (
    lines: { grossUnitPrice: string; quantity: string }[],
  ): number =>
    lines.reduce(
      (s, l) =>
        s + Number.parseFloat(l.grossUnitPrice) * Number.parseFloat(l.quantity),
      0,
    ),
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ _and: args }),
  eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
  gte: (a: unknown, b: unknown) => ({ _gte: [a, b] }),
  lt: (a: unknown, b: unknown) => ({ _lt: [a, b] }),
  inArray: (a: unknown, b: unknown) => ({ _inArray: [a, b] }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import {
  fillMissingDays,
  normalizePaymentMethod,
  rangeToBounds,
} from "./analytics-helpers";
import {
  getAnalyticsKpis,
  getPaymentBreakdown,
  getRevenueTimeseries,
} from "./analytics-actions";

// --- Helpers ---

function makeSelectBuilder(result: unknown[]) {
  const builder = {
    from: vi.fn(),
    where: vi.fn(),
  };
  builder.from.mockReturnValue(builder);
  builder.where.mockReturnValue(Promise.resolve(result));
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthenticatedUser.mockResolvedValue({ id: "user-1" });
  mockCheckBusinessOwnership.mockResolvedValue(null);
  mockGetPlan.mockResolvedValue({
    plan: "pro",
    trialStartedAt: null,
    planExpiresAt: null,
  });
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("rangeToBounds", () => {
  it("returns a [from, to) interval of the requested length in days", () => {
    const { from, to } = rangeToBounds("30d", new Date("2026-05-19T12:00:00Z"));
    expect(to.toISOString()).toBe("2026-05-20T00:00:00.000Z");
    expect(from.toISOString()).toBe("2026-04-20T00:00:00.000Z");
  });

  it("supports 7d and 90d ranges", () => {
    const ref = new Date("2026-05-19T00:00:00Z");
    expect(rangeToBounds("7d", ref).from.toISOString()).toBe(
      "2026-05-13T00:00:00.000Z",
    );
    expect(rangeToBounds("90d", ref).from.toISOString()).toBe(
      "2026-02-19T00:00:00.000Z",
    );
  });
});

describe("normalizePaymentMethod", () => {
  it("maps known codes to canonical labels", () => {
    expect(normalizePaymentMethod("PC")).toBe("PC");
    expect(normalizePaymentMethod("PE")).toBe("PE");
  });

  it("maps null/empty/non-string to 'other'", () => {
    expect(normalizePaymentMethod(null)).toBe("other");
    expect(normalizePaymentMethod("")).toBe("other");
    expect(normalizePaymentMethod(undefined)).toBe("other");
    expect(normalizePaymentMethod(42 as unknown as string)).toBe("other");
  });

  it("maps any unrecognised string to 'other'", () => {
    expect(normalizePaymentMethod("UNKNOWN")).toBe("other");
  });
});

describe("fillMissingDays", () => {
  it("fills gaps with zero revenue across the full date range", () => {
    const data = new Map([
      ["2026-05-17", 1000],
      ["2026-05-19", 2500],
    ]);
    const out = fillMissingDays(
      data,
      new Date("2026-05-17T00:00:00Z"),
      new Date("2026-05-20T00:00:00Z"),
    );
    expect(out).toEqual([
      { date: "2026-05-17", revenueCents: 1000 },
      { date: "2026-05-18", revenueCents: 0 },
      { date: "2026-05-19", revenueCents: 2500 },
    ]);
  });

  it("returns an empty array when from >= to", () => {
    expect(
      fillMissingDays(
        new Map(),
        new Date("2026-05-19T00:00:00Z"),
        new Date("2026-05-19T00:00:00Z"),
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

describe("getAnalyticsKpis", () => {
  it("returns an error when ownership check fails", async () => {
    mockCheckBusinessOwnership.mockResolvedValue({ error: "Non autorizzato." });
    const res = await getAnalyticsKpis("biz-1", "30d");
    expect(res).toEqual({ error: "Non autorizzato." });
  });

  it("returns an error when the plan is not Pro", async () => {
    mockGetPlan.mockResolvedValue({
      plan: "starter",
      trialStartedAt: null,
      planExpiresAt: null,
    });
    const res = await getAnalyticsKpis("biz-1", "30d");
    expect(res).toMatchObject({ error: expect.stringMatching(/Pro/i) });
  });

  it("returns an error for an invalid range", async () => {
    const res = await getAnalyticsKpis("biz-1", "1y" as unknown as "30d");
    expect(res).toMatchObject({ error: expect.any(String) });
  });

  it("returns 0/0/0/0 when there are no documents in the range", async () => {
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    mockFetchLinesByDocIds.mockResolvedValue([]);
    const res = await getAnalyticsKpis("biz-1", "30d");
    expect(res).toEqual({
      revenueCents: 0,
      count: 0,
      aovCents: 0,
      voidCount: 0,
    });
  });

  it("computes revenue (cents), count, AOV, and voidCount", async () => {
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        { id: "d1", status: "ACCEPTED", createdAt: new Date() },
        { id: "d2", status: "ACCEPTED", createdAt: new Date() },
        { id: "d3", status: "VOID_ACCEPTED", createdAt: new Date() },
      ]),
    );
    mockFetchLinesByDocIds.mockResolvedValue([
      { documentId: "d1", grossUnitPrice: "10.00", quantity: "1" },
      { documentId: "d2", grossUnitPrice: "5.00", quantity: "2" },
      { documentId: "d3", grossUnitPrice: "99.00", quantity: "1" },
    ]);
    const res = await getAnalyticsKpis("biz-1", "30d");
    expect(res).toEqual({
      // 10 + 10 = 20.00 → 2000 cents (void excluded from revenue)
      revenueCents: 2000,
      count: 2,
      aovCents: 1000,
      voidCount: 1,
    });
  });

  it("does not divide by zero when computing AOV", async () => {
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        { id: "d1", status: "VOID_ACCEPTED", createdAt: new Date() },
      ]),
    );
    mockFetchLinesByDocIds.mockResolvedValue([
      { documentId: "d1", grossUnitPrice: "10.00", quantity: "1" },
    ]);
    const res = await getAnalyticsKpis("biz-1", "30d");
    expect(res).toEqual({
      revenueCents: 0,
      count: 0,
      aovCents: 0,
      voidCount: 1,
    });
  });
});

describe("getRevenueTimeseries", () => {
  it("groups revenue by UTC day and fills gaps with zero", async () => {
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        {
          id: "d1",
          status: "ACCEPTED",
          createdAt: new Date("2026-05-17T10:00:00Z"),
        },
        {
          id: "d2",
          status: "ACCEPTED",
          createdAt: new Date("2026-05-19T09:00:00Z"),
        },
        {
          id: "d3",
          status: "ACCEPTED",
          createdAt: new Date("2026-05-19T11:00:00Z"),
        },
      ]),
    );
    mockFetchLinesByDocIds.mockResolvedValue([
      { documentId: "d1", grossUnitPrice: "10.00", quantity: "1" },
      { documentId: "d2", grossUnitPrice: "5.00", quantity: "1" },
      { documentId: "d3", grossUnitPrice: "5.00", quantity: "1" },
    ]);

    const res = await getRevenueTimeseries(
      "biz-1",
      "7d",
      new Date("2026-05-19T12:00:00Z"),
    );

    expect(Array.isArray(res)).toBe(true);
    if (!Array.isArray(res)) return;
    expect(res).toHaveLength(7);
    const byDate = Object.fromEntries(res.map((p) => [p.date, p.revenueCents]));
    expect(byDate["2026-05-17"]).toBe(1000);
    expect(byDate["2026-05-18"]).toBe(0);
    expect(byDate["2026-05-19"]).toBe(1000);
  });

  it("excludes VOID_ACCEPTED documents from the timeseries", async () => {
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        {
          id: "d1",
          status: "VOID_ACCEPTED",
          createdAt: new Date("2026-05-19T09:00:00Z"),
        },
      ]),
    );
    mockFetchLinesByDocIds.mockResolvedValue([
      { documentId: "d1", grossUnitPrice: "100.00", quantity: "1" },
    ]);
    const res = await getRevenueTimeseries(
      "biz-1",
      "7d",
      new Date("2026-05-19T12:00:00Z"),
    );
    if (!Array.isArray(res)) throw new Error("Expected array");
    expect(res.every((p) => p.revenueCents === 0)).toBe(true);
  });
});

describe("getPaymentBreakdown", () => {
  it("groups ACCEPTED documents by paymentMethod with cents totals", async () => {
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        {
          id: "d1",
          status: "ACCEPTED",
          publicRequest: { paymentMethod: "PC" },
        },
        {
          id: "d2",
          status: "ACCEPTED",
          publicRequest: { paymentMethod: "PE" },
        },
        {
          id: "d3",
          status: "ACCEPTED",
          publicRequest: { paymentMethod: "PC" },
        },
        { id: "d4", status: "ACCEPTED", publicRequest: null },
      ]),
    );
    mockFetchLinesByDocIds.mockResolvedValue([
      { documentId: "d1", grossUnitPrice: "10.00", quantity: "1" },
      { documentId: "d2", grossUnitPrice: "20.00", quantity: "1" },
      { documentId: "d3", grossUnitPrice: "5.00", quantity: "2" },
      { documentId: "d4", grossUnitPrice: "1.00", quantity: "1" },
    ]);
    const res = await getPaymentBreakdown("biz-1", "30d");
    if (!Array.isArray(res)) throw new Error("Expected array");
    const byMethod = Object.fromEntries(res.map((e) => [e.method, e]));
    expect(byMethod.PC).toEqual({ method: "PC", count: 2, revenueCents: 2000 });
    expect(byMethod.PE).toEqual({ method: "PE", count: 1, revenueCents: 2000 });
    expect(byMethod.other).toEqual({
      method: "other",
      count: 1,
      revenueCents: 100,
    });
  });

  it("excludes VOID_ACCEPTED documents from the breakdown", async () => {
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        {
          id: "d1",
          status: "VOID_ACCEPTED",
          publicRequest: { paymentMethod: "PC" },
        },
      ]),
    );
    mockFetchLinesByDocIds.mockResolvedValue([]);
    const res = await getPaymentBreakdown("biz-1", "30d");
    expect(res).toEqual([]);
  });
});
