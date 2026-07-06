// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const {
  mockGetAuthenticatedUser,
  mockIsValidPriceId,
  mockIntervalFromPriceId,
  mockGetStripe,
  mockGetDb,
  mockLimit,
  mockWhere,
  mockFrom,
  mockSelect,
  mockInsertValues,
  mockInsertOnConflictDoNothing,
  mockInsertReturning,
  mockInsert,
  mockUpdateSet,
  mockUpdateWhere,
  mockUpdate,
  mockCustomerCreate,
  mockSessionCreate,
  mockRateLimiterCheck,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockIsValidPriceId: vi.fn(),
  mockIntervalFromPriceId: vi.fn(),
  mockGetStripe: vi.fn(),
  mockGetDb: vi.fn(),
  mockLimit: vi.fn(),
  mockWhere: vi.fn(),
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockInsertValues: vi.fn(),
  mockInsertOnConflictDoNothing: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockUpdate: vi.fn(),
  mockCustomerCreate: vi.fn(),
  mockSessionCreate: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: mockGetStripe,
  isValidPriceId: mockIsValidPriceId,
  intervalFromPriceId: mockIntervalFromPriceId,
}));

vi.mock("@/db", () => ({
  getDb: mockGetDb,
}));

vi.mock("@/db/schema", () => ({
  subscriptions: "subscriptions-table",
}));

import { POST } from "@/app/api/stripe/checkout/route";

// --- Helpers ---

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Tests ---

describe("POST /api/stripe/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRateLimiterCheck.mockReturnValue({
      success: true,
      remaining: 9,
      resetAt: Date.now() + 3_600_000,
    });

    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-123",
      email: "user@example.com",
    });
    mockIsValidPriceId.mockReturnValue(true);
    mockIntervalFromPriceId.mockReturnValue("month");
    mockGetStripe.mockReturnValue({
      customers: { create: mockCustomerCreate },
      checkout: { sessions: { create: mockSessionCreate } },
    });
    mockCustomerCreate.mockResolvedValue({ id: "cus_new_123" });
    mockSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/test",
    });

    // Default: no existing subscription row
    mockGetDb.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);

    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockInsertValues.mockReturnValue({
      onConflictDoNothing: mockInsertOnConflictDoNothing,
    });
    mockInsertOnConflictDoNothing.mockReturnValue({
      returning: mockInsertReturning,
    });
    // Default: claim wins (row inserted)
    mockInsertReturning.mockResolvedValue([{ id: "sub-row-1" }]);

    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new Error("Not authenticated"));
    const response = await POST(makeRequest({ priceId: "price_123" }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 when priceId is missing", async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 when priceId is invalid", async () => {
    mockIsValidPriceId.mockReturnValue(false);
    const response = await POST(makeRequest({ priceId: "price_invalid" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("claims a subscription row before creating a new Stripe customer", async () => {
    mockIntervalFromPriceId.mockReturnValue("year");
    await POST(makeRequest({ priceId: "price_starter_yearly" }));

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-123", status: "pending" }),
    );
    expect(mockCustomerCreate).toHaveBeenCalledWith(
      { email: "user@example.com" },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: "cus_new_123",
        stripePriceId: "price_starter_yearly",
        interval: "year",
      }),
    );
  });

  it("falls back to interval 'month' when intervalFromPriceId returns null", async () => {
    mockIntervalFromPriceId.mockReturnValue(null);
    await POST(makeRequest({ priceId: "price_unknown" }));
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ interval: "month" }),
    );
  });

  it("reuses existing Stripe customer from subscriptions table", async () => {
    mockLimit.mockResolvedValue([
      { stripeCustomerId: "cus_existing_456", status: "pending" },
    ]);
    await POST(makeRequest({ priceId: "price_starter_monthly" }));
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing_456" }),
      expect.any(Object),
    );
  });

  it("returns 409 when the user already has an active subscription", async () => {
    mockLimit.mockResolvedValue([
      { stripeCustomerId: "cus_existing_456", status: "active" },
    ]);
    const response = await POST(
      makeRequest({ priceId: "price_starter_monthly" }),
    );
    expect(response.status).toBe(409);
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("returns 503 when a concurrent request already claimed the row (stripeCustomerId still null)", async () => {
    mockLimit.mockResolvedValue([
      { stripeCustomerId: null, status: "pending" },
    ]);
    const response = await POST(
      makeRequest({ priceId: "price_starter_monthly" }),
    );
    expect(response.status).toBe(503);
    expect(mockCustomerCreate).not.toHaveBeenCalled();
  });

  it("returns 503 when the INSERT claim loses the race (ON CONFLICT DO NOTHING returns empty)", async () => {
    mockInsertReturning.mockResolvedValue([]);
    const response = await POST(
      makeRequest({ priceId: "price_starter_monthly" }),
    );
    expect(response.status).toBe(503);
    expect(mockCustomerCreate).not.toHaveBeenCalled();
  });

  it("returns 200 with checkout URL on success", async () => {
    const response = await POST(makeRequest({ priceId: "price_pro_monthly" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.url).toBe("https://checkout.stripe.com/test");
  });

  it("creates session with subscription mode, correct price and idempotency key", async () => {
    await POST(makeRequest({ priceId: "price_pro_yearly" }));
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        line_items: [{ price: "price_pro_yearly", quantity: 1 }],
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });

  it("does not apply Stripe trial (trial is managed internally)", async () => {
    await POST(makeRequest({ priceId: "price_starter_monthly" }));
    const sessionCall = mockSessionCreate.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    // No trial_period_days or trial_end in the session create call
    const subscriptionData = sessionCall.subscription_data as
      Record<string, unknown> | undefined;
    expect(subscriptionData?.trial_period_days).toBeUndefined();
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockRateLimiterCheck.mockReturnValue({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 3_600_000,
    });
    const response = await POST(
      makeRequest({ priceId: "price_starter_monthly" }),
    );
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("checks rate limit with per-user key", async () => {
    await POST(makeRequest({ priceId: "price_starter_monthly" }));
    expect(mockRateLimiterCheck).toHaveBeenCalledWith("checkout:user-123");
  });

  it("does not call Stripe when rate limit is exceeded", async () => {
    mockRateLimiterCheck.mockReturnValue({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 3_600_000,
    });
    await POST(makeRequest({ priceId: "price_starter_monthly" }));
    expect(mockSessionCreate).not.toHaveBeenCalled();
    expect(mockCustomerCreate).not.toHaveBeenCalled();
  });

  describe("Stripe error handling", () => {
    it("returns 503 when stripe.customers.create throws", async () => {
      mockCustomerCreate.mockRejectedValue(new Error("Stripe network error"));
      const response = await POST(
        makeRequest({ priceId: "price_starter_monthly" }),
      );
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });

    it("returns 503 when stripe.checkout.sessions.create throws", async () => {
      // Existing customer scenario so customer.create is skipped
      mockLimit.mockResolvedValue([
        { stripeCustomerId: "cus_existing_456", status: "pending" },
      ]);
      mockSessionCreate.mockRejectedValue(new Error("Stripe timeout"));
      const response = await POST(
        makeRequest({ priceId: "price_starter_monthly" }),
      );
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });

    it("does not call sessions.create when customers.create throws", async () => {
      mockCustomerCreate.mockRejectedValue(new Error("Stripe error"));
      await POST(makeRequest({ priceId: "price_starter_monthly" }));
      expect(mockSessionCreate).not.toHaveBeenCalled();
    });
  });
});
