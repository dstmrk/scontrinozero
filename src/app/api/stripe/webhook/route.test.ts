// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockConstructEvent,
  mockSubscriptionsRetrieve,
  mockInsert,
  mockUpdate,
  mockSelect,
  mockDelete,
  mockTransaction,
  mockPlanFromPriceId,
  mockIntervalFromPriceId,
  mockLoggerError,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockSubscriptionsRetrieve: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockSelect: vi.fn(),
  mockDelete: vi.fn(),
  mockTransaction: vi.fn(),
  mockPlanFromPriceId: vi.fn(),
  mockIntervalFromPriceId: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn().mockReturnValue({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
  }),
  planFromPriceId: mockPlanFromPriceId,
  intervalFromPriceId: mockIntervalFromPriceId,
}));

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
    delete: mockDelete,
    transaction: mockTransaction,
  }),
}));

vi.mock("@/db/schema", () => ({
  subscriptions: "subscriptions-table",
  profiles: "profiles-table",
  stripeWebhookEvents: "stripe-webhook-events-table",
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: mockLoggerError, warn: mockLoggerWarn },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

function makeInsertBuilder(result: unknown[]) {
  const b = {
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
    returning: vi.fn().mockResolvedValue(result),
  };
  b.values.mockReturnValue(b);
  b.onConflictDoNothing.mockReturnValue(b);
  return b;
}

function makeUpdateBuilder() {
  // .where() returns the builder (for chaining .returning()).
  // .returning() resolves to [row] by default (1 row updated).
  // Handlers that do `await tx.update().set().where()` receive the builder
  // object, which is discarded — that's fine since the value is never used.
  const builder = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue([{ id: "sub-id-default" }]),
  };
  builder.set.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  return builder;
}

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

function makeRequest(body = "{}", signature = "sig_test") {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    body,
    headers: { "stripe-signature": signature },
  });
}

/**
 * Sets up mockTransaction to run the callback with a tx object that has
 * the same update/select mocks as the outer db.
 */
function setupTransactionPassthrough() {
  mockTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<void>) => {
      await fn({ update: mockUpdate, select: mockSelect });
    },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { POST } from "./route";

describe("POST /api/stripe/webhook — request validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    // INSERT-first atomic claim: default = winner (RETURNING returns a row)
    mockInsert.mockReturnValue(makeInsertBuilder([{ eventId: "evt_default" }]));
    // SELECT is used for subRow lookups only (dedup is now INSERT-based)
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    // DELETE: called when handleEvent fails to release the claim
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  });

  it("restituisce 400 se manca l'header stripe-signature", async () => {
    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("restituisce 500 se STRIPE_WEBHOOK_SECRET non è configurato", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it("restituisce 400 se la firma non è valida", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid signature.");
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it("restituisce 200 { received: true } per eventi sconosciuti", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_unknown_001",
      type: "some.unknown.event",
      data: { object: {} },
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  it("restituisce 200 { received: true } senza processare se evento duplicato", async () => {
    // INSERT RETURNING empty → event already claimed or processed, skip handleEvent
    mockInsert.mockReturnValue(makeInsertBuilder([]));
    mockConstructEvent.mockReturnValue({
      id: "evt_dup_001",
      type: "customer.subscription.updated",
      data: { object: {} },
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    // handleEvent non deve essere chiamato
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_dup_001" }),
      expect.stringContaining("Duplicate"),
    );
  });

  it("restituisce 500 se il DB INSERT claim fallisce", async () => {
    // INSERT itself throws → caught by outer try/catch → 500
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("DB error")),
        }),
      }),
    });
    mockConstructEvent.mockReturnValue({
      id: "evt_dberr_001",
      type: "some.unknown.event",
      data: { object: {} },
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    expect(mockLoggerError).toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — invoice.payment_action_required", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mockInsert.mockReturnValue(makeInsertBuilder([{ eventId: "evt_default" }]));
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  });

  it("imposta status a 'incomplete' quando subscriptionId è presente", async () => {
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);

    mockConstructEvent.mockReturnValue({
      id: "evt_inc_001",
      type: "invoice.payment_action_required",
      data: {
        object: {
          parent: {
            subscription_details: { subscription: "sub_incomplete_123" },
          },
          period_end: 0,
        },
      },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith("subscriptions-table");
    expect(updateBuilder.set).toHaveBeenCalledWith({ status: "incomplete" });
  });

  it("ignora l'evento se subscriptionId è assente", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_inc_002",
      type: "invoice.payment_action_required",
      data: { object: { parent: null } },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — invoice.payment_failed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mockInsert.mockReturnValue(makeInsertBuilder([{ eventId: "evt_default" }]));
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  });

  it("imposta status a 'past_due'", async () => {
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);

    mockConstructEvent.mockReturnValue({
      id: "evt_pd_001",
      type: "invoice.payment_failed",
      data: {
        object: {
          parent: {
            subscription_details: { subscription: "sub_pastdue_123" },
          },
        },
      },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(updateBuilder.set).toHaveBeenCalledWith({ status: "past_due" });
  });
});

describe("POST /api/stripe/webhook — customer.subscription.deleted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mockInsert.mockReturnValue(makeInsertBuilder([{ eventId: "evt_default" }]));
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  });

  it("P1-02: azzera anche stripeSubscriptionId/stripePriceId/currentPeriodEnd su cancellazione (no stale state per re-checkout)", async () => {
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);
    // SELECT inside transaction: userId lookup → has userId
    mockSelect.mockReturnValue(makeSelectBuilder([{ userId: "user-abc" }]));
    setupTransactionPassthrough();

    mockConstructEvent.mockReturnValue({
      id: "evt_del_001",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_deleted_123", customer: "cus_123" } },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
    // First update: subscription → canceled + null su id/price/period.
    // Necessario perché un futuro customer.subscription.updated cerca per
    // stripeSubscriptionId e non troverebbe la nuova sub se la riga ne porta uno stale.
    expect(updateBuilder.set).toHaveBeenCalledWith({
      status: "canceled",
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodEnd: null,
    });
    // Second update: profile → trial
    expect(updateBuilder.set).toHaveBeenCalledWith({ plan: "trial" });
  });

  it("non aggiorna il profilo se la subscription non ha userId nel DB", async () => {
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);
    // Both dedup check and userId lookup return empty
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    setupTransactionPassthrough();

    mockConstructEvent.mockReturnValue({
      id: "evt_del_002",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_deleted_456", customer: "cus_456" } },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
    expect(updateBuilder.set).toHaveBeenCalledTimes(1);
    expect(updateBuilder.set).toHaveBeenCalledWith({
      status: "canceled",
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodEnd: null,
    });
  });

  it("restituisce 500 se la transazione fallisce (rollback garantito)", async () => {
    // SELECT inside transaction: userId lookup (but tx throws before using it)
    mockSelect.mockReturnValue(makeSelectBuilder([{ userId: "user-abc" }]));
    // Transaction itself throws → simulates DB error mid-transaction
    mockTransaction.mockRejectedValue(new Error("DB error"));

    mockConstructEvent.mockReturnValue({
      id: "evt_del_003",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_err_789", customer: "cus_789" } },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    expect(mockLoggerError).toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — checkout.session.completed type guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mockInsert.mockReturnValue(makeInsertBuilder([{ eventId: "evt_default" }]));
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  });

  it("ignora la sessione se subscription non è una stringa", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_co_001",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: null,
          customer: "cus_123",
        },
      },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it("recupera la subscription e la sincronizza in una transazione", async () => {
    const fakeSub = {
      id: "sub_123",
      status: "active",
      customer: "cus_123",
      items: {
        data: [{ price: { id: "price_pro" }, current_period_end: 9999 }],
      },
    };
    mockSubscriptionsRetrieve.mockResolvedValue(fakeSub);
    mockPlanFromPriceId.mockReturnValue("pro");
    mockIntervalFromPriceId.mockReturnValue("month");

    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);
    // SELECT inside transaction: subRow lookup → has userId
    mockSelect.mockReturnValue(makeSelectBuilder([{ userId: "user-123" }]));
    setupTransactionPassthrough();

    mockConstructEvent.mockReturnValue({
      id: "evt_co_002",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_123",
          customer: "cus_123",
        },
      },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith("sub_123");
    expect(mockTransaction).toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — checkout.session.expired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mockInsert.mockReturnValue(makeInsertBuilder([{ eventId: "evt_default" }]));
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  });

  it("marca la subscription pending come canceled quando la sessione scade", async () => {
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);

    mockConstructEvent.mockReturnValue({
      id: "evt_exp_001",
      type: "checkout.session.expired",
      data: { object: { customer: "cus_expired_123" } },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith("subscriptions-table");
    expect(updateBuilder.set).toHaveBeenCalledWith({ status: "canceled" });
    expect(updateBuilder.where).toHaveBeenCalled();
  });

  it("ignora l'evento se customer è assente nella sessione scaduta", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_exp_002",
      type: "checkout.session.expired",
      data: { object: { customer: null } },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — charge.dispute.created", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mockInsert.mockReturnValue(makeInsertBuilder([{ eventId: "evt_default" }]));
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  });

  it("loga l'errore con critical: true e i dettagli della disputa", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_disp_001",
      type: "charge.dispute.created",
      data: {
        object: {
          id: "dp_dispute_123",
          charge: "ch_charge_456",
          amount: 999,
          reason: "fraudulent",
        },
      },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        critical: true,
        disputeId: "dp_dispute_123",
        chargeId: "ch_charge_456",
        amount: 999,
        reason: "fraudulent",
      }),
      expect.stringContaining("dispute"),
    );
  });

  it("non esegue operazioni DB per una disputa", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_disp_002",
      type: "charge.dispute.created",
      data: {
        object: {
          id: "dp_002",
          charge: "ch_002",
          amount: 100,
          reason: "duplicate",
        },
      },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
