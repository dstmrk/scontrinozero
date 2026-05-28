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
  type AnalyticsRange,
  fillMissingDays,
  formatRomeDay,
  normalizePaymentMethod,
  rangeToBounds,
  romeMidnightUtc,
} from "./analytics-helpers";
import { getAnalyticsBundle } from "./analytics-actions";

// Test helpers: unwrap the aggregated bundle for the specific dataset each
// test cares about. Mirrors the old per-dataset Server Action surface so
// existing test bodies keep their shape after the H1 consolidation.
async function getAnalyticsKpis(businessId: string, range: AnalyticsRange) {
  const res = await getAnalyticsBundle(businessId, range);
  return "error" in res ? res : res.kpis;
}
async function getRevenueTimeseries(
  businessId: string,
  range: AnalyticsRange,
  reference?: Date,
) {
  const res = await getAnalyticsBundle(businessId, range, reference);
  return "error" in res ? res : res.timeseries;
}
async function getPaymentBreakdown(businessId: string, range: AnalyticsRange) {
  const res = await getAnalyticsBundle(businessId, range);
  return "error" in res ? res : res.breakdown;
}
async function getProductBreakdown(businessId: string, range: AnalyticsRange) {
  const res = await getAnalyticsBundle(businessId, range);
  return "error" in res ? res : res.productBreakdown;
}

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

  it("supports ytd: from = mezzanotte Rome del 1° gennaio dell'anno della reference", () => {
    // Reference a maggio 2026 (CEST), 1° gennaio cade in CET (UTC+1).
    const refMay = new Date("2026-05-19T12:00:00Z"); // Rome day "2026-05-19"
    const ytdMay = rangeToBounds("ytd", refMay);
    expect(ytdMay.from.toISOString()).toBe("2025-12-31T23:00:00.000Z");
    expect(ytdMay.to.toISOString()).toBe("2026-05-19T22:00:00.000Z");
  });

  it("ytd il 1° gennaio produce un range di esattamente 1 giorno fiscale", () => {
    // Rome day "2026-01-01" → from = 2026-01-01 00:00 Rome, to = 2026-01-02 00:00 Rome.
    const refJan1 = new Date("2026-01-01T12:00:00Z");
    const { from, to } = rangeToBounds("ytd", refJan1);
    expect(formatRomeDay(from)).toBe("2026-01-01");
    expect(formatRomeDay(to)).toBe("2026-01-02");
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("ytd a fine anno bisestile copre 366 giorni fiscali", () => {
    // 2028 e' bisestile. Reference 31 dicembre 2028.
    const refDec31 = new Date("2028-12-31T12:00:00Z");
    const { from, to } = rangeToBounds("ytd", refDec31);
    expect(formatRomeDay(from)).toBe("2028-01-01");
    expect(formatRomeDay(to)).toBe("2029-01-01");
  });

  it("ytd a cavallo del cambio anno usa l'anno fiscale italiano della reference", () => {
    // Mezzanotte UTC del 1° gennaio 2026 = 01:00 Rome di "2026-01-01" (CET),
    // quindi l'anno fiscale italiano e' 2026, non 2025.
    const refMidnightUtc = new Date("2026-01-01T00:00:00Z");
    const { from } = rangeToBounds("ytd", refMidnightUtc);
    expect(formatRomeDay(from)).toBe("2026-01-01");
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
      {
        documentId: "d1",
        description: "Caffè",
        grossUnitPrice: "10.00",
        quantity: "1",
      },
      {
        documentId: "d2",
        description: "Cornetto",
        grossUnitPrice: "5.00",
        quantity: "2",
      },
      {
        documentId: "d3",
        description: "Brioche",
        grossUnitPrice: "99.00",
        quantity: "1",
      },
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

  it("scarta le righe che non passano isDocRow (drift schema DB)", async () => {
    // Drift simulato: una riga senza createdAt (Date) deve essere filtrata
    // senza crashare la pipeline analytics.
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        { id: "d1", status: "ACCEPTED", createdAt: new Date() },
        { id: "d2", status: "ACCEPTED" /* createdAt mancante */ },
      ]),
    );
    mockFetchLinesByDocIds.mockResolvedValue([
      {
        documentId: "d1",
        description: "Caffè",
        grossUnitPrice: "10.00",
        quantity: "1",
      },
    ]);
    const res = await getAnalyticsKpis("biz-1", "30d");
    expect(res).toEqual({
      revenueCents: 1000,
      count: 1,
      aovCents: 1000,
      voidCount: 0,
    });
  });

  it("does not divide by zero when computing AOV", async () => {
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        { id: "d1", status: "VOID_ACCEPTED", createdAt: new Date() },
      ]),
    );
    mockFetchLinesByDocIds.mockResolvedValue([
      {
        documentId: "d1",
        description: "Caffè",
        grossUnitPrice: "10.00",
        quantity: "1",
      },
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
      {
        documentId: "d1",
        description: "Caffè",
        grossUnitPrice: "10.00",
        quantity: "1",
      },
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
      {
        documentId: "d1",
        description: "Caffè",
        grossUnitPrice: "10.00",
        quantity: "1",
      },
      {
        documentId: "d2",
        description: "Caffè",
        grossUnitPrice: "5.00",
        quantity: "1",
      },
      {
        documentId: "d3",
        description: "Cornetto",
        grossUnitPrice: "5.00",
        quantity: "1",
      },
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
      {
        documentId: "d1",
        description: "Caffè",
        grossUnitPrice: "100.00",
        quantity: "1",
      },
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
    const at = new Date("2026-05-19T10:00:00Z");
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        {
          id: "d1",
          status: "ACCEPTED",
          createdAt: at,
          publicRequest: { paymentMethod: "PC" },
        },
        {
          id: "d2",
          status: "ACCEPTED",
          createdAt: at,
          publicRequest: { paymentMethod: "PE" },
        },
        {
          id: "d3",
          status: "ACCEPTED",
          createdAt: at,
          publicRequest: { paymentMethod: "PC" },
        },
        { id: "d4", status: "ACCEPTED", createdAt: at, publicRequest: null },
      ]),
    );
    mockFetchLinesByDocIds.mockResolvedValue([
      {
        documentId: "d1",
        description: "Caffè",
        grossUnitPrice: "10.00",
        quantity: "1",
      },
      {
        documentId: "d2",
        description: "Cornetto",
        grossUnitPrice: "20.00",
        quantity: "1",
      },
      {
        documentId: "d3",
        description: "Caffè",
        grossUnitPrice: "5.00",
        quantity: "2",
      },
      {
        documentId: "d4",
        description: "Brioche",
        grossUnitPrice: "1.00",
        quantity: "1",
      },
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
          createdAt: new Date("2026-05-19T10:00:00Z"),
          publicRequest: { paymentMethod: "PC" },
        },
      ]),
    );
    mockFetchLinesByDocIds.mockResolvedValue([]);
    const res = await getPaymentBreakdown("biz-1", "30d");
    expect(res).toEqual([]);
  });
});

describe("getProductBreakdown", () => {
  it("returns an error when ownership check fails", async () => {
    mockCheckBusinessOwnership.mockResolvedValue({ error: "Non autorizzato." });
    const res = await getProductBreakdown("biz-1", "30d");
    expect(res).toEqual({ error: "Non autorizzato." });
  });

  it("returns an error when the plan is not Pro", async () => {
    mockGetPlan.mockResolvedValue({
      plan: "starter",
      trialStartedAt: null,
      planExpiresAt: null,
    });
    const res = await getProductBreakdown("biz-1", "30d");
    expect(res).toMatchObject({ error: expect.stringMatching(/Pro/i) });
  });

  it("returns rate-limit error and skips DB query when limiter rejects", async () => {
    mockRateLimitCheck.mockReturnValue({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 3_600_000,
    });
    const res = await getProductBreakdown("biz-1", "30d");
    expect(res).toMatchObject({ error: expect.stringMatching(/Troppe/i) });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns an error for an invalid range", async () => {
    const res = await getProductBreakdown("biz-1", "1y" as unknown as "30d");
    expect(res).toMatchObject({ error: expect.any(String) });
  });

  it("aggregates ACCEPTED lines by description (case-insensitive + trim)", async () => {
    const at = new Date("2026-05-19T10:00:00Z");
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        { id: "d1", status: "ACCEPTED", createdAt: at },
        { id: "d2", status: "ACCEPTED", createdAt: at },
        { id: "d3", status: "VOID_ACCEPTED", createdAt: at },
      ]),
    );
    mockFetchLinesByDocIds.mockResolvedValue([
      {
        documentId: "d1",
        description: "Caffè",
        quantity: "2",
        grossUnitPrice: "1.50",
      },
      {
        documentId: "d2",
        description: " caffè ",
        quantity: "1",
        grossUnitPrice: "1.50",
      },
      {
        documentId: "d2",
        description: "Cornetto",
        quantity: "1",
        grossUnitPrice: "1.20",
      },
      {
        documentId: "d3",
        description: "Caffè",
        quantity: "10",
        grossUnitPrice: "1.50",
      },
    ]);
    const res = await getProductBreakdown("biz-1", "30d");
    if (!Array.isArray(res)) throw new Error("Expected array");
    expect(res).toHaveLength(2);
    expect(res[0]).toEqual({
      description: "Caffè",
      revenueCents: 450, // 2*1.50 + 1*1.50 = 4.50 (VOID escluso)
      count: 2,
    });
    expect(res[1]).toEqual({
      description: "Cornetto",
      revenueCents: 120,
      count: 1,
    });
  });

  it("returns empty array when no documents are present", async () => {
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    mockFetchLinesByDocIds.mockResolvedValue([]);
    const res = await getProductBreakdown("biz-1", "30d");
    expect(res).toEqual([]);
  });
});

describe("getAnalyticsBundle", () => {
  it("returns kpis/timeseries/breakdown/productBreakdown from a single dataset fetch", async () => {
    const at = new Date("2026-05-19T10:00:00Z");
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        {
          id: "d1",
          status: "ACCEPTED",
          createdAt: at,
          publicRequest: { paymentMethod: "PC" },
        },
      ]),
    );
    mockFetchLinesByDocIds.mockResolvedValue([
      {
        documentId: "d1",
        description: "Caffè",
        quantity: "2",
        grossUnitPrice: "1.50",
      },
    ]);

    const res = await getAnalyticsBundle(
      "biz-1",
      "7d",
      new Date("2026-05-19T12:00:00Z"),
    );

    if ("error" in res) throw new Error(`Expected bundle, got: ${res.error}`);
    expect(res.kpis).toEqual({
      revenueCents: 300,
      count: 1,
      aovCents: 300,
      voidCount: 0,
    });
    expect(res.breakdown).toEqual([
      { method: "PC", count: 1, revenueCents: 300 },
    ]);
    expect(res.productBreakdown).toEqual([
      // count == lines (1), revenue == qty*price (2 * 1.50 = 3.00 → 300 cents)
      { description: "Caffè", revenueCents: 300, count: 1 },
    ]);
    expect(
      res.timeseries.find((p) => p.date === "2026-05-19")?.revenueCents,
    ).toBe(300);
  });

  it("fetches the dataset only once per call (H1: collapses 4 round-trips into 1)", async () => {
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    mockFetchLinesByDocIds.mockResolvedValue([]);

    await getAnalyticsBundle("biz-1", "30d");

    // mockSelect è chiamato 1× per fetchSaleDocsInRange.
    // Senza l'aggregazione (4 server action separate) verrebbe chiamato 4×.
    expect(mockSelect).toHaveBeenCalledTimes(1);
    // fetchLinesByDocIds invocato 0× perché non ci sono documenti, ma anche
    // con dati sarebbe 1× soltanto (mock helper sopra lo conferma).
    expect(mockFetchLinesByDocIds).toHaveBeenCalledTimes(0);
  });

  it("returns { error } when auth fails (single error path for the whole bundle)", async () => {
    mockCheckBusinessOwnership.mockResolvedValue({ error: "Non autorizzato." });
    const res = await getAnalyticsBundle("biz-1", "30d");
    expect(res).toEqual({ error: "Non autorizzato." });
  });
});
