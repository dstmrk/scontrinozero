// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const {
  mockConstructEvent,
  mockGetStripe,
  mockPlanFromPriceId,
  mockIntervalFromPriceId,
  mockGetDb,
  mockSubscriptionsRetrieve,
  // DB chain mocks
  mockUpdateSet,
  mockUpdateWhere,
  mockUpdate,
  mockSelectWhere,
  mockSelectLimit,
  mockSelectFrom,
  mockSelect,
} = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockGetStripe: vi.fn(),
  mockPlanFromPriceId: vi.fn(),
  mockIntervalFromPriceId: vi.fn(),
  mockGetDb: vi.fn(),
  mockSubscriptionsRetrieve: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockUpdate: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockSelectFrom: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: mockGetStripe,
  planFromPriceId: mockPlanFromPriceId,
  intervalFromPriceId: mockIntervalFromPriceId,
}));

vi.mock("@/db", () => ({
  getDb: mockGetDb,
}));

vi.mock("@/db/schema", () => ({
  subscriptions: "subscriptions-table",
  profiles: "profiles-table",
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { POST } from "@/app/api/stripe/webhook/route";

// --- Helpers ---

function makeWebhookRequest(body: string, signature = "valid-sig"): Request {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body,
  });
}

function makeStripeEvent(type: string, data: unknown) {
  return { type, data: { object: data } };
}

function makeStripeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    items: {
      data: [
        {
          price: { id: "price_starter_monthly" },
          current_period_end: 1800000000,
        },
      ],
    },
    ...overrides,
  };
}

// --- Tests ---

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

    mockGetStripe.mockReturnValue({
      webhooks: { constructEvent: mockConstructEvent },
      subscriptions: { retrieve: mockSubscriptionsRetrieve },
    });
    mockPlanFromPriceId.mockReturnValue("starter");
    mockIntervalFromPriceId.mockReturnValue("month");
    mockSubscriptionsRetrieve.mockResolvedValue(makeStripeSubscription());

    // DB chain
    mockGetDb.mockReturnValue({ update: mockUpdate, select: mockSelect });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue(undefined);
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
    mockSelectLimit.mockResolvedValue([{ userId: "user-123" }]);
  });

  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });
    const response = await POST(makeWebhookRequest("{}", "bad-sig"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("returns 200 for unknown event types (ignored gracefully)", async () => {
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("some.unknown.event", {}),
    );
    const response = await POST(makeWebhookRequest("{}"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.received).toBe(true);
  });

  it("handles checkout.session.completed: retrieves subscription and updates DB", async () => {
    const session = {
      customer: "cus_123",
      subscription: "sub_123",
    };
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("checkout.session.completed", session),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith("sub_123");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("handles invoice.paid: updates currentPeriodEnd", async () => {
    const invoice = {
      parent: { subscription_details: { subscription: "sub_123" } },
      period_end: 1800000000,
    };
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("invoice.paid", invoice),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        currentPeriodEnd: new Date(1800000000 * 1000),
      }),
    );
  });

  it("handles customer.subscription.updated: updates subscription and profile plan", async () => {
    const subscription = makeStripeSubscription({ status: "active" });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.updated", subscription),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockPlanFromPriceId).toHaveBeenCalledWith("price_starter_monthly");
  });

  it("handles customer.subscription.deleted: sets status=canceled and plan=trial", async () => {
    const subscription = makeStripeSubscription({ status: "canceled" });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.deleted", subscription),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    // Should update subscription status to canceled
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "canceled" }),
    );
    // Should downgrade profile to trial
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "trial" }),
    );
  });

  it("returns 500 when handleEvent throws an unexpected error", async () => {
    mockConstructEvent.mockReturnValue(
      makeStripeEvent(
        "customer.subscription.updated",
        makeStripeSubscription(),
      ),
    );
    mockUpdateWhere.mockRejectedValue(new Error("DB connection lost"));

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("handles checkout.session.completed: breaks early when no subscription in session", async () => {
    const session = { customer: "cus_123" }; // no subscription field
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("checkout.session.completed", session),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it("handles invoice.paid: breaks early when invoice has no subscription", async () => {
    const invoice = { period_end: 1800000000 }; // no parent.subscription_details
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("invoice.paid", invoice),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("upsertSubscriptionData: skips profile update when no subscription row found", async () => {
    mockSelectLimit.mockResolvedValue([]); // no subRow
    const subscription = makeStripeSubscription({ status: "active" });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.updated", subscription),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    // update called once for subscriptions table, not a second time for profiles
    const profileUpdateCall = mockUpdateSet.mock.calls.find((args) =>
      Object.keys(args[0] as Record<string, unknown>).includes("plan"),
    );
    expect(profileUpdateCall).toBeUndefined();
  });

  it("handles customer.subscription.deleted: skips profile downgrade when subRow is null", async () => {
    mockSelectLimit.mockResolvedValue([]); // no subRow
    const subscription = makeStripeSubscription({ status: "canceled" });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.deleted", subscription),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    // status=canceled update should happen, but plan=trial profile update should not
    const planDowngradeCall = mockUpdateSet.mock.calls.find(
      (args) => (args[0] as Record<string, unknown>).plan === "trial",
    );
    expect(planDowngradeCall).toBeUndefined();
  });

  it("passes raw body string to constructEvent (not parsed JSON)", async () => {
    const rawBody = '{"type":"test"}';
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("some.unknown.event", {}),
    );
    await POST(makeWebhookRequest(rawBody, "sig_123"));
    expect(mockConstructEvent).toHaveBeenCalledWith(
      rawBody,
      "sig_123",
      "whsec_test",
    );
  });
});
