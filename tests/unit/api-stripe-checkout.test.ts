// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const {
  mockGetAuthenticatedUser,
  mockIsValidPriceId,
  mockGetStripe,
  mockGetDb,
  mockLimit,
  mockWhere,
  mockFrom,
  mockSelect,
  mockInsertValues,
  mockInsert,
  mockCustomerCreate,
  mockSessionCreate,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockIsValidPriceId: vi.fn(),
  mockGetStripe: vi.fn(),
  mockGetDb: vi.fn(),
  mockLimit: vi.fn(),
  mockWhere: vi.fn(),
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockInsertValues: vi.fn(),
  mockInsert: vi.fn(),
  mockCustomerCreate: vi.fn(),
  mockSessionCreate: vi.fn(),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: mockGetStripe,
  isValidPriceId: mockIsValidPriceId,
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

    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-123",
      email: "user@example.com",
    });
    mockIsValidPriceId.mockReturnValue(true);
    mockGetStripe.mockReturnValue({
      customers: { create: mockCustomerCreate },
      checkout: { sessions: { create: mockSessionCreate } },
    });
    mockCustomerCreate.mockResolvedValue({ id: "cus_new_123" });
    mockSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/test",
    });

    // Default: no existing subscription
    mockGetDb.mockReturnValue({ select: mockSelect, insert: mockInsert });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockInsertValues.mockResolvedValue(undefined);
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

  it("creates a new Stripe customer when no existing subscription", async () => {
    await POST(makeRequest({ priceId: "price_starter_monthly" }));
    expect(mockCustomerCreate).toHaveBeenCalledWith({
      email: "user@example.com",
    });
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        stripeCustomerId: "cus_new_123",
      }),
    );
  });

  it("reuses existing Stripe customer from subscriptions table", async () => {
    mockLimit.mockResolvedValue([{ stripeCustomerId: "cus_existing_456" }]);
    await POST(makeRequest({ priceId: "price_starter_monthly" }));
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing_456" }),
    );
  });

  it("returns 200 with checkout URL on success", async () => {
    const response = await POST(makeRequest({ priceId: "price_pro_monthly" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.url).toBe("https://checkout.stripe.com/test");
  });

  it("creates session with subscription mode and correct price", async () => {
    await POST(makeRequest({ priceId: "price_pro_yearly" }));
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        line_items: [{ price: "price_pro_yearly", quantity: 1 }],
      }),
    );
  });

  it("does not apply Stripe trial (trial is managed internally)", async () => {
    await POST(makeRequest({ priceId: "price_starter_monthly" }));
    const sessionCall = mockSessionCreate.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    // No trial_period_days or trial_end in the session create call
    expect(sessionCall.subscription_data?.trial_period_days).toBeUndefined();
  });
});
