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
  mockInsertValues,
  mockInsertOnConflict,
  mockInsertReturning,
  mockInsert,
  mockUpdateSet,
  mockUpdateWhere,
  mockUpdateReturning,
  mockUpdate,
  mockDeleteWhere,
  mockDelete,
  mockSelectWhere,
  mockSelectLimit,
  mockSelectFrom,
  mockSelect,
  mockTransaction,
} = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockGetStripe: vi.fn(),
  mockPlanFromPriceId: vi.fn(),
  mockIntervalFromPriceId: vi.fn(),
  mockGetDb: vi.fn(),
  mockSubscriptionsRetrieve: vi.fn(),
  mockInsertValues: vi.fn(),
  mockInsertOnConflict: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockUpdateReturning: vi.fn(),
  mockUpdate: vi.fn(),
  mockDeleteWhere: vi.fn(),
  mockDelete: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockSelectFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockTransaction: vi.fn(),
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
  stripeWebhookEvents: "stripe-webhook-events-table",
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { POST } from "@/app/api/stripe/webhook/route";
import { logger } from "@/lib/logger";

// --- Helpers ---

function makeWebhookRequest(body: string, signature = "valid-sig"): Request {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body,
  });
}

function makeStripeEvent(type: string, data: unknown, livemode = false) {
  return { id: "evt_test_default", type, data: { object: data }, livemode };
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
    vi.resetAllMocks(); // resets implementations + once-queue, not just call history

    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

    mockGetStripe.mockReturnValue({
      webhooks: { constructEvent: mockConstructEvent },
      subscriptions: { retrieve: mockSubscriptionsRetrieve },
    });
    mockPlanFromPriceId.mockReturnValue("starter");
    mockIntervalFromPriceId.mockReturnValue("month");
    mockSubscriptionsRetrieve.mockResolvedValue(makeStripeSubscription());

    // DB chain
    const mockDb = {
      insert: mockInsert,
      update: mockUpdate,
      select: mockSelect,
      delete: mockDelete,
      transaction: mockTransaction,
    };
    mockGetDb.mockReturnValue(mockDb);

    // INSERT chain — INSERT-first atomic claim with RETURNING.
    // Default: RETURNING returns a row → this request is the winner and will process.
    mockInsertReturning.mockResolvedValue([{ eventId: "evt_test_default" }]);
    mockInsertOnConflict.mockReturnValue({ returning: mockInsertReturning });
    mockInsertValues.mockReturnValue({
      onConflictDoNothing: mockInsertOnConflict,
    });
    mockInsert.mockReturnValue({ values: mockInsertValues });

    // UPDATE chain.
    // mockUpdateWhere returns { returning: mockUpdateReturning } synchronously.
    // This supports two call patterns:
    //   1. await tx.update().set().where()           → resolves to plain object (value unused)
    //   2. await db.update().set().where().returning() → calls mockUpdateReturning
    // Default: 1 row updated. Override with mockUpdateReturning.mockResolvedValueOnce([])
    // to simulate 0-rows-affected in specific tests.
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateReturning.mockResolvedValue([{ id: "sub-id-default" }]);

    // DELETE chain — used to release the claim when handleEvent fails.
    mockDeleteWhere.mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockDeleteWhere });

    // SELECT chain — used for subRow lookups inside syncSubscriptionData.
    // (Dedup is now handled by INSERT-first, not SELECT.)
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
    mockSelectLimit.mockResolvedValue([{ userId: "user-123" }]); // subRow lookups

    // transaction is a passthrough: calls callback with same mock db
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => fn(mockDb),
    );
  });

  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_EXPECT_LIVEMODE;
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

  it("syncSubscriptionData: returns 500 and logs error when no subscription row found", async () => {
    // Override: subRow lookup returns empty → no subscription row found → throws
    mockSelectLimit.mockResolvedValue([]);
    const subscription = makeStripeSubscription({ status: "active" });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.updated", subscription),
    );

    const response = await POST(makeWebhookRequest("{}"));

    // With the new throw-on-missing-row fix, this is now a 500 so Stripe retries
    expect(response.status).toBe(500);
    // profiles.plan must NOT be updated
    const profileUpdateCall = mockUpdateSet.mock.calls.find((args) =>
      Object.keys(args[0] as Record<string, unknown>).includes("plan"),
    );
    expect(profileUpdateCall).toBeUndefined();
    // anomaly must be observable via logger.error (not a silent no-op)
    expect(logger.error as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCustomerId: "cus_123" }),
      expect.stringContaining("no subscription row"),
    );
  });

  it("handles customer.subscription.deleted: skips profile downgrade when subRow is null", async () => {
    // Override: subRow lookup returns [] → no userId → skip profile downgrade
    mockSelectLimit.mockResolvedValue([]);
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

  it("handles invoice.payment_failed: sets status=past_due on subscription", async () => {
    const invoice = {
      parent: { subscription_details: { subscription: "sub_123" } },
    };
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("invoice.payment_failed", invoice),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "past_due" }),
    );
  });

  it("handles invoice.payment_failed: breaks early when invoice has no subscription", async () => {
    const invoice = {}; // no parent.subscription_details
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("invoice.payment_failed", invoice),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    expect(mockUpdate).not.toHaveBeenCalled();
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

  // P1-01: unknown priceId must not silently assign "starter"
  it("syncSubscriptionData: skips plan update and logs error on unknown priceId", async () => {
    mockPlanFromPriceId.mockReturnValue(null);
    mockIntervalFromPriceId.mockReturnValue(null);
    const subscription = makeStripeSubscription({ status: "active" });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.updated", subscription),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    // profiles.plan must NOT be updated
    const planUpdateCall = mockUpdateSet.mock.calls.find((args) =>
      Object.keys(args[0] as Record<string, unknown>).includes("plan"),
    );
    expect(planUpdateCall).toBeUndefined();
    // logger.error must be called with priceId context
    expect(logger.error as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ priceId: "price_starter_monthly" }),
      expect.any(String),
    );
  });

  it("syncSubscriptionData: proceeds normally when priceId is known", async () => {
    const subscription = makeStripeSubscription({ status: "active" });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.updated", subscription),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    const planUpdateCall = mockUpdateSet.mock.calls.find((args) =>
      Object.keys(args[0] as Record<string, unknown>).includes("plan"),
    );
    expect(planUpdateCall).toBeDefined();
  });

  // P3-02: livemode guard
  it("ignores event when livemode=false but STRIPE_EXPECT_LIVEMODE=true", async () => {
    process.env.STRIPE_EXPECT_LIVEMODE = "true";
    // event.livemode defaults to false in makeStripeEvent
    mockConstructEvent.mockReturnValue(
      makeStripeEvent(
        "customer.subscription.updated",
        makeStripeSubscription(),
      ),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(logger.warn as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ livemode: false, expected: true }),
      expect.any(String),
    );
  });

  it("ignores event when livemode=true but STRIPE_EXPECT_LIVEMODE=false", async () => {
    process.env.STRIPE_EXPECT_LIVEMODE = "false";
    mockConstructEvent.mockReturnValue(
      makeStripeEvent(
        "customer.subscription.updated",
        makeStripeSubscription(),
        true,
      ),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("processes event normally when livemode matches STRIPE_EXPECT_LIVEMODE", async () => {
    process.env.STRIPE_EXPECT_LIVEMODE = "false";
    // livemode=false (default) matches expected=false
    mockConstructEvent.mockReturnValue(
      makeStripeEvent(
        "customer.subscription.updated",
        makeStripeSubscription(),
      ),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("skips livemode check when STRIPE_EXPECT_LIVEMODE is not set", async () => {
    // No STRIPE_EXPECT_LIVEMODE env var set (deleted in afterEach, not set here)
    mockConstructEvent.mockReturnValue(
      makeStripeEvent(
        "customer.subscription.updated",
        makeStripeSubscription(),
        true,
      ),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  // ── P0-01: dedup correctness (INSERT-first atomic claim pattern) ────────────

  it("P0-01: skips already-claimed or -processed event — INSERT ON CONFLICT returns empty RETURNING", async () => {
    // INSERT RETURNING empty → event already claimed by another request or already processed.
    // No dedup SELECT needed — the INSERT itself is the atomic gate.
    mockInsertReturning.mockResolvedValueOnce([]);
    mockConstructEvent.mockReturnValue(
      makeStripeEvent(
        "customer.subscription.updated",
        makeStripeSubscription(),
      ),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.received).toBe(true);
    // handleEvent was NOT called: no DB updates
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(logger.warn as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_test_default" }),
      expect.stringContaining("already claimed"),
    );
  });

  it("P0-01: releases claim (DELETE) when handleEvent fails — enables Stripe retry", async () => {
    // INSERT RETURNING = winner (default from beforeEach) → we are the sole handler.
    // Simulate handleEvent failure via DB error inside handleEvent.
    // invoice.paid now calls .where().returning(), so we reject on mockUpdateReturning
    // (not on mockUpdateWhere, which only returns the sync { returning: fn } object).
    mockUpdateReturning.mockRejectedValueOnce(new Error("DB timeout"));
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("invoice.paid", {
        parent: { subscription_details: { subscription: "sub_123" } },
        period_end: 1800000000,
      }),
    );

    const response = await POST(makeWebhookRequest("{}"));

    // Stripe receives 500 → will retry the event
    expect(response.status).toBe(500);
    // Claim INSERT was called before processing
    expect(mockInsert).toHaveBeenCalled();
    // DELETE must have been called to release the claim so Stripe can retry
    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteWhere).toHaveBeenCalled();
  });

  it("P0-01: claim (INSERT) is made before processing; stays on success for permanent dedup", async () => {
    // INSERT RETURNING = winner (default) → we process the event.
    // On success, claim row stays → future duplicate deliveries see empty RETURNING.
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("some.unknown.event", {}),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    // INSERT must have been called to claim the event before processing
    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_test_default" }),
    );
    // DELETE must NOT have been called (success path keeps the claim as permanent dedup)
    expect(mockDelete).not.toHaveBeenCalled();
  });

  // ── B10: rows_affected check on write handlers ───────────────────────────
  // When an UPDATE affects 0 rows (subscription not found in DB), the handler
  // must log a warning so the anomaly is observable. The event is still
  // acknowledged (200) — throwing would cause infinite Stripe retries since
  // the missing row cannot self-heal via retry.

  it("B10: invoice.paid — logs warn and returns 200 when no subscription row found (0 rows updated)", async () => {
    mockUpdateReturning.mockResolvedValueOnce([]);
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("invoice.paid", {
        parent: { subscription_details: { subscription: "sub_missing" } },
        period_end: 1800000000,
      }),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    expect(logger.warn as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ stripeSubscriptionId: "sub_missing" }),
      expect.stringContaining("invoice.paid"),
    );
  });

  it("B10: invoice.payment_failed — logs warn and returns 200 when no subscription row found (0 rows updated)", async () => {
    mockUpdateReturning.mockResolvedValueOnce([]);
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("invoice.payment_failed", {
        parent: { subscription_details: { subscription: "sub_missing" } },
      }),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    expect(logger.warn as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ stripeSubscriptionId: "sub_missing" }),
      expect.stringContaining("invoice.payment_failed"),
    );
  });

  it("B10: invoice.payment_action_required — logs warn and returns 200 when no subscription row found (0 rows updated)", async () => {
    mockUpdateReturning.mockResolvedValueOnce([]);
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("invoice.payment_action_required", {
        parent: { subscription_details: { subscription: "sub_missing" } },
      }),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    expect(logger.warn as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ stripeSubscriptionId: "sub_missing" }),
      expect.stringContaining("invoice.payment_action_required"),
    );
  });

  it("B10: checkout.session.expired — logs warn and returns 200 when no pending subscription row found (0 rows updated)", async () => {
    mockUpdateReturning.mockResolvedValueOnce([]);
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("checkout.session.expired", {
        customer: "cus_missing",
      }),
    );

    const response = await POST(makeWebhookRequest("{}"));

    expect(response.status).toBe(200);
    expect(logger.warn as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCustomerId: "cus_missing" }),
      expect.stringContaining("checkout.session.expired"),
    );
  });
});
