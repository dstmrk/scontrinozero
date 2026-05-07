// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockGetAuthenticatedUser,
  mockRateLimiterCheck,
  mockSelect,
  mockInsert,
  mockUpdate,
  mockCustomerCreate,
  mockSessionCreate,
  mockIsValidPriceId,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockCustomerCreate: vi.fn(),
  mockSessionCreate: vi.fn(),
  mockIsValidPriceId: vi.fn(),
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
  getDb: vi.fn().mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  }),
}));

vi.mock("@/db/schema", () => ({
  subscriptions: "subscriptions-table",
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn().mockReturnValue({
    customers: { create: mockCustomerCreate },
    checkout: { sessions: { create: mockSessionCreate } },
  }),
  isValidPriceId: mockIsValidPriceId,
  intervalFromPriceId: vi.fn().mockReturnValue("month"),
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

/**
 * Builds an insert mock that supports .values().onConflictDoNothing().returning().
 * `returningResult` is what `.returning()` resolves with ([] = conflict, [row] = success).
 */
function makeInsertBuilder(returningResult: unknown[] = []) {
  const builder = {
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
    returning: vi.fn().mockResolvedValue(returningResult),
  };
  builder.values.mockReturnValue(builder);
  builder.onConflictDoNothing.mockReturnValue(builder);
  return builder;
}

function makeRequest(body: object) {
  return new Request("http://localhost/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { POST } from "./route";

describe("POST /api/stripe/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimiterCheck.mockReturnValue({ success: true });
    mockIsValidPriceId.mockReturnValue(true);
    mockSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session",
    });
  });

  it("restituisce 401 se non autenticato", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new Error("unauth"));
    const res = await POST(makeRequest({ priceId: "price_123" }));
    expect(res.status).toBe(401);
  });

  it("restituisce 429 se rate limit superato", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockRateLimiterCheck.mockReturnValue({ success: false });
    const res = await POST(makeRequest({ priceId: "price_123" }));
    expect(res.status).toBe(429);
  });

  it("restituisce 400 se body non è JSON valido", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    const req = new Request("http://localhost/api/stripe/checkout", {
      method: "POST",
      body: "non-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("restituisce 400 se priceId non è valido", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockIsValidPriceId.mockReturnValue(false);
    const res = await POST(makeRequest({ priceId: "price_invalid" }));
    expect(res.status).toBe(400);
  });

  it("usa il customer esistente se già in DB", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(
      makeSelectBuilder([{ stripeCustomerId: "cus_existing" }]),
    );

    const res = await POST(makeRequest({ priceId: "price_pro" }));
    expect(res.status).toBe(200);
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" }),
    );
  });

  it("crea un nuovo customer Stripe se non esiste", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    mockCustomerCreate.mockResolvedValue({ id: "cus_new" });
    mockInsert.mockReturnValue(
      makeInsertBuilder([{ stripeCustomerId: "cus_new" }]),
    );

    const res = await POST(makeRequest({ priceId: "price_pro" }));
    expect(res.status).toBe(200);
    expect(mockCustomerCreate).toHaveBeenCalledWith({ email: "a@b.it" });
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_new" }),
    );
  });

  it("non restituisce 500 su conflict INSERT concorrente (race condition)", async () => {
    // Simulate: initial SELECT finds nothing, INSERT conflicts (another request
    // won the race), then re-SELECT finds the winner's customerId.
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockCustomerCreate.mockResolvedValue({ id: "cus_race_loser" });

    // First SELECT: no existing subscription
    // Second SELECT (after conflict): returns the winner's row
    mockSelect
      .mockReturnValueOnce(makeSelectBuilder([]))
      .mockReturnValueOnce(
        makeSelectBuilder([{ stripeCustomerId: "cus_race_winner" }]),
      );

    // INSERT returns [] → conflict
    mockInsert.mockReturnValue(makeInsertBuilder([]));

    const res = await POST(makeRequest({ priceId: "price_pro" }));
    expect(res.status).toBe(200);
    // Uses the winner's customerId, not the loser's
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_race_winner" }),
    );
  });

  it("restituisce l'URL della checkout session", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(
      makeSelectBuilder([{ stripeCustomerId: "cus_existing" }]),
    );

    const res = await POST(makeRequest({ priceId: "price_starter" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://checkout.stripe.com/session");
  });

  it("passa allow_promotion_codes: true alla checkout session", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(
      makeSelectBuilder([{ stripeCustomerId: "cus_existing" }]),
    );

    await POST(makeRequest({ priceId: "price_pro" }));
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ allow_promotion_codes: true }),
    );
  });

  it("passa subscription_data.metadata con userId alla checkout session", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-42",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(
      makeSelectBuilder([{ stripeCustomerId: "cus_existing" }]),
    );

    await POST(makeRequest({ priceId: "price_pro" }));
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_data: {
          metadata: { userId: "user-42" },
        },
      }),
    );
  });
});
