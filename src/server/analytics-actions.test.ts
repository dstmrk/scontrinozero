// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetAuthenticatedUser,
  mockCheckBusinessOwnership,
  mockGetPlan,
  mockSelect,
  mockFetchLinesByDocIds,
  mockRateLimitCheck,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockCheckBusinessOwnership: vi.fn(),
  mockGetPlan: vi.fn(),
  mockSelect: vi.fn(),
  mockFetchLinesByDocIds: vi.fn(),
  mockRateLimitCheck: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 900_000, HOURLY: 3_600_000 },
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimitCheck };
  }),
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
  getDb: vi.fn().mockReturnValue({
    select: mockSelect,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ select: mockSelect, execute: vi.fn() }),
  }),
}));

// withStatementTimeout wraps the query inside a transaction. In tests we want
// a passthrough that just invokes the callback with a fake tx exposing the
// same select mock so existing `makeSelectBuilder` chains keep working.
vi.mock("@/lib/db-timeout", () => ({
  withStatementTimeout: async (
    _timeoutMs: number,
    fn: (tx: unknown) => Promise<unknown>,
  ) => fn({ select: mockSelect, execute: vi.fn() }),
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
  formatRomeDay,
  normalizePaymentMethod,
  rangeToBounds,
  romeMidnightUtc,
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
    limit: vi.fn(),
  };
  builder.from.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.limit.mockReturnValue(Promise.resolve(result));
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
  mockRateLimitCheck.mockReturnValue({
    success: true,
    remaining: 59,
    resetAt: Date.now() + 3_600_000,
  });
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("formatRomeDay", () => {
  it("returns the Italian fiscal day for an instant in CEST (summer)", () => {
    // 19 maggio 2026 alle 00:30 Europe/Rome = 18 maggio 22:30 UTC (CEST = UTC+2)
    expect(formatRomeDay(new Date("2026-05-18T22:30:00Z"))).toBe("2026-05-19");
  });

  it("returns the Italian fiscal day for an instant in CET (winter)", () => {
    // 15 gennaio 2026 alle 00:30 Europe/Rome = 14 gennaio 23:30 UTC (CET = UTC+1)
    expect(formatRomeDay(new Date("2026-01-14T23:30:00Z"))).toBe("2026-01-15");
  });
});

describe("romeMidnightUtc", () => {
  it("returns the UTC instant of Rome midnight in CEST (summer = UTC+2)", () => {
    expect(romeMidnightUtc("2026-05-20").toISOString()).toBe(
      "2026-05-19T22:00:00.000Z",
    );
  });

  it("returns the UTC instant of Rome midnight in CET (winter = UTC+1)", () => {
    expect(romeMidnightUtc("2026-02-19").toISOString()).toBe(
      "2026-02-18T23:00:00.000Z",
    );
  });
});

describe("rangeToBounds", () => {
  it("anchors [from, to) to Europe/Rome midnights for the requested length", () => {
    // Reference 12:00 UTC del 19 maggio = 14:00 Rome → Rome day "2026-05-19"
    const { from, to } = rangeToBounds("30d", new Date("2026-05-19T12:00:00Z"));
    // `to` = mezzanotte Rome del 2026-05-20 (giorno dopo, exclusive) → 22:00Z (CEST)
    expect(to.toISOString()).toBe("2026-05-19T22:00:00.000Z");
    expect(formatRomeDay(to)).toBe("2026-05-20");
    // `from` = mezzanotte Rome del 2026-04-20 → 22:00Z (CEST)
    expect(from.toISOString()).toBe("2026-04-19T22:00:00.000Z");
    expect(formatRomeDay(from)).toBe("2026-04-20");
  });

  it("supports 7d and 90d ranges and crosses DST boundaries correctly", () => {
    const ref = new Date("2026-05-19T00:00:00Z"); // Rome day "2026-05-19"
    // 7d → fromDay = 2026-05-13 (CEST) → 22:00Z del 12 maggio
    expect(rangeToBounds("7d", ref).from.toISOString()).toBe(
      "2026-05-12T22:00:00.000Z",
    );
    // 90d → fromDay = 2026-02-19 (CET — gli orologi italiani sono ancora su UTC+1)
    expect(rangeToBounds("90d", ref).from.toISOString()).toBe(
      "2026-02-18T23:00:00.000Z",
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
  it("fills gaps with zero revenue across the full Rome calendar range", () => {
    const data = new Map([
      ["2026-05-17", 1000],
      ["2026-05-19", 2500],
    ]);
    // Bounds = mezzanotte Rome del 17 e del 20 maggio 2026 (CEST → 22:00Z giorno prima).
    const out = fillMissingDays(
      data,
      romeMidnightUtc("2026-05-17"),
      romeMidnightUtc("2026-05-20"),
    );
    expect(out).toEqual([
      { date: "2026-05-17", revenueCents: 1000 },
      { date: "2026-05-18", revenueCents: 0 },
      { date: "2026-05-19", revenueCents: 2500 },
    ]);
  });

  it("returns an empty array when from >= to", () => {
    const midnight = romeMidnightUtc("2026-05-19");
    expect(fillMissingDays(new Map(), midnight, midnight)).toEqual([]);
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

  it("returns 'Profilo non disponibile' on ProfileNotFoundError (orphan auth user)", async () => {
    const { ProfileNotFoundError } = await import("@/lib/plans");
    mockGetPlan.mockRejectedValue(new ProfileNotFoundError("user-1"));
    const res = await getAnalyticsKpis("biz-1", "30d");
    expect(res).toMatchObject({
      error: expect.stringContaining("Profilo non disponibile"),
    });
  });

  it("returns 'sovraccarico' on DB statement timeout (57014)", async () => {
    const timeoutErr = Object.assign(new Error("statement timeout"), {
      code: "57014",
    });
    mockGetPlan.mockRejectedValue(timeoutErr);
    const res = await getAnalyticsKpis("biz-1", "30d");
    expect(res).toMatchObject({
      error: expect.stringContaining("sovraccarico"),
    });
  });

  it("rilancia errori imprevisti di getPlan invece di mascherarli", async () => {
    mockGetPlan.mockRejectedValue(new Error("network glitch"));
    await expect(getAnalyticsKpis("biz-1", "30d")).rejects.toThrow(
      "network glitch",
    );
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

  it("returns rate-limit error and skips DB query when limiter rejects", async () => {
    mockRateLimitCheck.mockReturnValue({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 3_600_000,
    });
    const res = await getAnalyticsKpis("biz-1", "30d");
    expect(res).toMatchObject({ error: expect.stringMatching(/Troppe/i) });
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockRateLimitCheck).toHaveBeenCalledWith("analytics:user-1");
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
  it("buckets a midnight-Rome receipt by the correct fiscal day (DST fix)", async () => {
    // 2026-05-18T22:30Z = 00:30 Rome del 19 maggio (CEST). Deve finire
    // nel bucket "2026-05-19" (giorno fiscale), non in "2026-05-18".
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        {
          id: "d1",
          status: "ACCEPTED",
          createdAt: new Date("2026-05-18T22:30:00Z"),
        },
      ]),
    );
    mockFetchLinesByDocIds.mockResolvedValue([
      { documentId: "d1", grossUnitPrice: "10.00", quantity: "1" },
    ]);

    const res = await getRevenueTimeseries(
      "biz-1",
      "7d",
      new Date("2026-05-19T12:00:00Z"),
    );

    if (!Array.isArray(res)) throw new Error("Expected array");
    const byDate = Object.fromEntries(res.map((p) => [p.date, p.revenueCents]));
    expect(byDate["2026-05-19"]).toBe(1000);
    expect(byDate["2026-05-18"]).toBe(0);
  });

  it("groups revenue by Italian fiscal day and fills gaps with zero", async () => {
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

  it("returns rate-limit error and skips DB query when limiter rejects", async () => {
    mockRateLimitCheck.mockReturnValue({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 3_600_000,
    });
    const res = await getRevenueTimeseries("biz-1", "7d");
    expect(res).toMatchObject({ error: expect.stringMatching(/Troppe/i) });
    expect(mockSelect).not.toHaveBeenCalled();
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

  it("returns rate-limit error and skips DB query when limiter rejects", async () => {
    mockRateLimitCheck.mockReturnValue({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 3_600_000,
    });
    const res = await getPaymentBreakdown("biz-1", "30d");
    expect(res).toMatchObject({ error: expect.stringMatching(/Troppe/i) });
    expect(mockSelect).not.toHaveBeenCalled();
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
