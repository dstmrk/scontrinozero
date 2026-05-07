// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockGetAuthenticatedUser,
  mockRateLimiterCheck,
  mockSelect,
  mockSessionCreate,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
  mockSelect: vi.fn(),
  mockSessionCreate: vi.fn(),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
}));

vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
}));

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({ select: mockSelect }),
}));

vi.mock("@/db/schema", () => ({
  subscriptions: "subscriptions-table",
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn().mockReturnValue({
    billingPortal: { sessions: { create: mockSessionCreate } },
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn() },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSelectBuilder(result: unknown[]) {
  const builder = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
  };
  builder.from.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  return builder;
}

const fakeRequest = new Request("http://localhost/api/stripe/portal");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { GET, POST } from "./route";

describe("GET /api/stripe/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimiterCheck.mockReturnValue({ success: true });
  });

  it("restituisce 401 se non autenticato", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new Error("unauth"));
    const res = await GET(fakeRequest);
    expect(res.status).toBe(401);
  });

  it("restituisce 429 se rate limit superato", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockRateLimiterCheck.mockReturnValue({ success: false });
    const res = await GET(fakeRequest);
    expect(res.status).toBe(429);
  });

  it("restituisce 400 se nessun abbonamento trovato", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    const res = await GET(fakeRequest);
    expect(res.status).toBe(400);
  });

  it("redirige all'URL del portale Stripe", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockSelect.mockReturnValue(
      makeSelectBuilder([{ stripeCustomerId: "cus_123" }]),
    );
    mockSessionCreate.mockResolvedValue({
      url: "https://billing.stripe.com/session",
    });
    const res = await GET(fakeRequest);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://billing.stripe.com/session",
    );
  });

  it("usa il return_url corretto", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockSelect.mockReturnValue(
      makeSelectBuilder([{ stripeCustomerId: "cus_123" }]),
    );
    mockSessionCreate.mockResolvedValue({
      url: "https://billing.stripe.com/session",
    });
    await GET(fakeRequest);
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_123",
        return_url: expect.stringContaining("/dashboard/settings"),
      }),
    );
  });
});

describe("POST /api/stripe/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimiterCheck.mockReturnValue({ success: true });
  });

  it("restituisce 401 se non autenticato", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new Error("unauth"));
    const res = await POST(fakeRequest);
    expect(res.status).toBe(401);
  });

  it("restituisce 200 con url JSON", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockSelect.mockReturnValue(
      makeSelectBuilder([{ stripeCustomerId: "cus_123" }]),
    );
    mockSessionCreate.mockResolvedValue({
      url: "https://billing.stripe.com/session",
    });
    const res = await POST(fakeRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://billing.stripe.com/session");
  });
});
