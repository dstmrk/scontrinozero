// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetAuthenticatedUser,
  mockAssertProPlan,
  mockRateLimiterCheck,
  mockSelect,
  mockBuildReceiptsCsvStream,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockAssertProPlan: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
  mockSelect: vi.fn(),
  mockBuildReceiptsCsvStream: vi.fn(),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
}));

vi.mock("@/lib/plans", () => ({
  assertProPlan: mockAssertProPlan,
}));

vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 900_000, HOURLY: 3_600_000 },
}));

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({ select: mockSelect }),
}));

vi.mock("@/db/schema", () => ({
  profiles: { id: "p_id", authUserId: "p_auth" },
  businesses: { id: "b_id", profileId: "b_profile" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/receipts/csv-export", () => ({
  buildReceiptsCsvStream: mockBuildReceiptsCsvStream,
}));

import { GET } from "./route";

// --- Helpers ---

function makeSelectBuilder(result: unknown[]) {
  const builder = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
  };
  builder.from.mockReturnValue(builder);
  builder.innerJoin.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  return builder;
}

function makeRequest(qs = ""): Request {
  return new Request(`http://localhost/api/export/receipts${qs}`);
}

function makeFakeStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode("hello"));
      c.close();
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthenticatedUser.mockResolvedValue({ id: "user-1" });
  mockAssertProPlan.mockResolvedValue({ ok: true, plan: "pro" });
  mockRateLimiterCheck.mockReturnValue({
    success: true,
    remaining: 9,
    resetAt: 0,
  });
  mockSelect.mockReturnValue(makeSelectBuilder([{ id: "biz-1" }]));
  mockBuildReceiptsCsvStream.mockReturnValue(makeFakeStream());
});

describe("GET /api/export/receipts", () => {
  it("restituisce 401 se non autenticato", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(
      new Error("UnauthenticatedError"),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockAssertProPlan).not.toHaveBeenCalled();
  });

  it("restituisce 403 se il piano non e' Pro", async () => {
    mockAssertProPlan.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Funzionalità riservata al piano Pro.",
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("restituisce 429 se rate limit superato", async () => {
    mockRateLimiterCheck.mockReturnValue({
      success: false,
      remaining: 0,
      resetAt: 0,
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
    expect(mockBuildReceiptsCsvStream).not.toHaveBeenCalled();
  });

  it("restituisce 404 se l'utente non ha un business", async () => {
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });

  it.each([
    {
      name: "restituisce 400 se la data 'from' non e' yyyy-MM-dd",
      query: "?from=2026/01/01",
    },
    {
      name: "restituisce 400 se status non e' tra i valori ammessi",
      query: "?status=PENDING",
    },
    {
      name: "restituisce 400 se dateFrom > dateTo",
      query: "?from=2026-05-19&to=2026-01-01",
    },
  ])("$name", async ({ query }) => {
    const res = await GET(makeRequest(query));
    expect(res.status).toBe(400);
  });

  it("restituisce 200 con header text/csv per il piano Pro", async () => {
    const res = await GET(makeRequest("?from=2026-01-01&to=2026-05-19"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toContain(
      'filename="scontrini-2026-01-01-2026-05-19.csv"',
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("passa businessId, dateFrom e dateTo (exclusive) a buildReceiptsCsvStream", async () => {
    await GET(makeRequest("?from=2026-01-01&to=2026-05-19&status=ACCEPTED"));
    expect(mockBuildReceiptsCsvStream).toHaveBeenCalledWith({
      businessId: "biz-1",
      status: "ACCEPTED",
      dateFrom: new Date("2026-01-01T00:00:00.000Z"),
      // dateTo viene convertito in upper bound exclusive (giorno successivo)
      dateTo: new Date("2026-05-20T00:00:00.000Z"),
    });
  });

  it("passa null per i filtri opzionali assenti", async () => {
    await GET(makeRequest());
    expect(mockBuildReceiptsCsvStream).toHaveBeenCalledWith({
      businessId: "biz-1",
      status: null,
      dateFrom: null,
      dateTo: null,
    });
  });

  it("usa rate limit key per-user (csv:<userId>)", async () => {
    await GET(makeRequest());
    expect(mockRateLimiterCheck).toHaveBeenCalledWith("csv:user-1");
  });
});
