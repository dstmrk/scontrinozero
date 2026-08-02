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
  STRIPE_WEBHOOK_REQUEST_OPTIONS: { timeout: 10_000, maxNetworkRetries: 2 },
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
  or: vi.fn(),
  lte: vi.fn(),
  isNull: vi.fn(),
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

function makeUpdateBuilder(
  returningResult: unknown[] = [{ id: "sub-id-default" }],
) {
  // .where() returns the builder (for chaining .returning()).
  // .returning() resolves to [row] by default (1 row updated); passare [] simula
  // un UPDATE che non tocca righe — è così che si testa la guardia di ordering
  // (REVIEW.md #61), che scarta gli eventi più vecchi del watermark.
  const builder = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue(returningResult),
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

import { isNull, lte, or } from "drizzle-orm";
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
    // UPDATE default: used to set completedAt on the claim after a
    // successful handleEvent (REVIEW.md #20); individual tests override this
    // when they need to assert against a specific subscriptions/profiles update.
    mockUpdate.mockReturnValue(makeUpdateBuilder());
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
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);

    mockConstructEvent.mockReturnValue({
      id: "evt_inc_002",
      type: "invoice.payment_action_required",
      data: { object: { parent: null } },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    // Only the claim's completedAt is updated (success path); no subscriptions update
    expect(updateBuilder.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "incomplete" }),
    );
  });
});

describe("POST /api/stripe/webhook — invoice.paid (REVIEW #70)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mockInsert.mockReturnValue(makeInsertBuilder([{ eventId: "evt_default" }]));
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockPlanFromPriceId.mockReturnValue("pro");
    mockIntervalFromPriceId.mockReturnValue("month");
  });

  it("non scrive currentPeriodEnd: period_end è la fine del periodo appena chiuso", async () => {
    // `invoice.period_end` è la fine del ciclo di fatturazione *chiuso*
    // (≈ l'istante del rinnovo), non la fine del nuovo periodo pagato. Poiché
    // invoice.paid e customer.subscription.updated arrivano insieme senza
    // ordering garantito, il valore sbagliato sovrascriveva quello corretto
    // circa metà delle volte, e ci restava per un intero ciclo.
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);

    mockConstructEvent.mockReturnValue({
      id: "evt_paid_001",
      type: "invoice.paid",
      data: {
        object: {
          parent: {
            subscription_details: { subscription: "sub_paid_123" },
          },
          period_end: 1_700_000_000,
        },
      },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(updateBuilder.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ currentPeriodEnd: expect.anything() }),
    );
  });

  it("customer.subscription.updated resta l'unico writer di currentPeriodEnd", async () => {
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);
    mockSelect.mockReturnValue(makeSelectBuilder([{ userId: "user-123" }]));
    setupTransactionPassthrough();

    mockConstructEvent.mockReturnValue({
      id: "evt_sub_upd_period",
      type: "customer.subscription.updated",
      created: 1_700_000_000,
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          cancel_at_period_end: false,
          items: {
            data: [
              { price: { id: "price_pro" }, current_period_end: 1_800_000_000 },
            ],
          },
        },
      },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        currentPeriodEnd: new Date(1_800_000_000 * 1000),
      }),
    );
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

  it("azzera anche stripeSubscriptionId/stripePriceId/currentPeriodEnd su cancellazione (no stale state per re-checkout)", async () => {
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);
    // SELECT inside transaction: userId lookup → has userId
    mockSelect.mockReturnValue(makeSelectBuilder([{ userId: "user-abc" }]));
    setupTransactionPassthrough();

    mockConstructEvent.mockReturnValue({
      id: "evt_del_001",
      type: "customer.subscription.deleted",
      created: 1_700_000_000,
      data: { object: { id: "sub_deleted_123", customer: "cus_123" } },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
    // First update: subscription → canceled + null su id/price/period, più il
    // watermark di ordering (REVIEW.md #61).
    // Necessario perché un futuro customer.subscription.updated cerca per
    // stripeSubscriptionId e non troverebbe la nuova sub se la riga ne porta uno stale.
    expect(updateBuilder.set).toHaveBeenCalledWith({
      status: "canceled",
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodEnd: null,
      lastStripeEventCreated: new Date(1_700_000_000 * 1000),
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
      created: 1_700_000_000,
      data: { object: { id: "sub_deleted_456", customer: "cus_456" } },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
    // Two .set() calls: the subscription cancellation inside the tx, plus the
    // claim's completedAt update in processWithClaimRelease (REVIEW.md #20).
    // No profile update happens since no userId was found.
    expect(updateBuilder.set).toHaveBeenCalledTimes(2);
    expect(updateBuilder.set).toHaveBeenCalledWith({
      status: "canceled",
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodEnd: null,
      lastStripeEventCreated: new Date(1_700_000_000 * 1000),
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
      created: 1_700_000_000,
      data: {
        object: {
          subscription: "sub_123",
          customer: "cus_123",
        },
      },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    // Timeout + maxNetworkRetries per-request (non globali)
    // Stripe SDK signature: retrieve(id, params?, options?)
    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith(
      "sub_123",
      undefined,
      expect.objectContaining({
        timeout: expect.any(Number),
        maxNetworkRetries: expect.any(Number),
      }),
    );
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("logga errorClass + rilascia il claim se stripe.subscriptions.retrieve fallisce", async () => {
    class StripeConnectionError extends Error {
      constructor() {
        super("upstream connect timeout");
        this.name = "StripeConnectionError";
      }
    }
    mockSubscriptionsRetrieve.mockRejectedValue(new StripeConnectionError());

    mockConstructEvent.mockReturnValue({
      id: "evt_co_err_001",
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_123",
          customer: "cus_123",
        },
      },
    });

    const res = await POST(makeRequest());
    // 500 → Stripe retries; claim released so the retry can re-process.
    expect(res.status).toBe(500);
    expect(mockSubscriptionsRetrieve).toHaveBeenCalled();
    // Structured log con errorClass per dashboard/observability
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        errorClass: "StripeConnectionError",
        eventType: "checkout.session.completed",
      }),
      expect.stringContaining("stripe.subscriptions.retrieve"),
    );
    // DELETE chiamato per liberare il claim atomico
    expect(mockDelete).toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — customer.subscription.updated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mockInsert.mockReturnValue(makeInsertBuilder([{ eventId: "evt_default" }]));
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockPlanFromPriceId.mockReturnValue("pro");
    mockIntervalFromPriceId.mockReturnValue("month");
  });

  function makeUpdatedEvent(cancelAtPeriodEnd: boolean) {
    return {
      id: `evt_sub_upd_${cancelAtPeriodEnd}`,
      type: "customer.subscription.updated",
      created: 1_700_000_000,
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          cancel_at_period_end: cancelAtPeriodEnd,
          items: {
            data: [{ price: { id: "price_pro" }, current_period_end: 9999 }],
          },
        },
      },
    };
  }

  it("persiste cancelAtPeriodEnd=true quando l'utente annulla a fine periodo", async () => {
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);
    mockSelect.mockReturnValue(makeSelectBuilder([{ userId: "user-123" }]));
    setupTransactionPassthrough();

    mockConstructEvent.mockReturnValue(makeUpdatedEvent(true));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({ cancelAtPeriodEnd: true }),
    );
  });

  it("persiste cancelAtPeriodEnd=false quando l'abbonamento viene riattivato", async () => {
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);
    mockSelect.mockReturnValue(makeSelectBuilder([{ userId: "user-123" }]));
    setupTransactionPassthrough();

    mockConstructEvent.mockReturnValue(makeUpdatedEvent(false));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({ cancelAtPeriodEnd: false }),
    );
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
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);

    mockConstructEvent.mockReturnValue({
      id: "evt_exp_002",
      type: "checkout.session.expired",
      data: { object: { customer: null } },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    // Only the claim's completedAt is updated (success path); no subscriptions update
    expect(updateBuilder.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "canceled" }),
    );
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
    // Only the claim's completedAt is updated (success path); no other DB write
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — ordering guard event.created (REVIEW #61)", () => {
  const OLD_EVENT_CREATED = 1_700_000_000;
  const NEW_EVENT_CREATED = 1_700_009_999;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mockInsert.mockReturnValue(makeInsertBuilder([{ eventId: "evt_default" }]));
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockSelect.mockReturnValue(makeSelectBuilder([{ userId: "user-123" }]));
    mockPlanFromPriceId.mockReturnValue("pro");
    mockIntervalFromPriceId.mockReturnValue("month");
    setupTransactionPassthrough();
  });

  function makeUpdatedEvent(created: number, cancelAtPeriodEnd: boolean) {
    return {
      id: `evt_sub_upd_${created}`,
      type: "customer.subscription.updated",
      created,
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          cancel_at_period_end: cancelAtPeriodEnd,
          items: {
            data: [{ price: { id: "price_pro" }, current_period_end: 9999 }],
          },
        },
      },
    };
  }

  it("registra event.created come watermark quando l'evento viene applicato", async () => {
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);

    mockConstructEvent.mockReturnValue(
      makeUpdatedEvent(NEW_EVENT_CREATED, false),
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        lastStripeEventCreated: new Date(NEW_EVENT_CREATED * 1000),
      }),
    );
  });

  it("costruisce la guardia come (watermark IS NULL OR watermark <= event.created)", async () => {
    // `lte` (non `lt`): due eventi possono condividere lo stesso `created` e la
    // dedup per event.id impedisce comunque di riapplicare lo stesso evento.
    // La colonna NULL (primo evento in assoluto) deve sempre passare.
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);

    mockConstructEvent.mockReturnValue(
      makeUpdatedEvent(NEW_EVENT_CREATED, false),
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    // `@/db/schema` è mockato come stringa, quindi la colonna passata agli
    // operatori non è ispezionabile: si asserisce il secondo argomento di
    // `lte` (la data dell'evento) e la presenza del ramo IS NULL nell'OR.
    expect(vi.mocked(lte).mock.calls[0]?.[1]).toEqual(
      new Date(NEW_EVENT_CREATED * 1000),
    );
    expect(vi.mocked(isNull)).toHaveBeenCalled();
    expect(vi.mocked(or)).toHaveBeenCalled();
  });

  it("scarta un customer.subscription.updated più vecchio del watermark senza toccare il profilo", async () => {
    // 0 righe aggiornate = la guardia ha respinto l'evento: la riga esiste
    // (il SELECT trova userId) ma porta un watermark più recente.
    const updateBuilder = makeUpdateBuilder([]);
    mockUpdate.mockReturnValue(updateBuilder);

    mockConstructEvent.mockReturnValue(
      makeUpdatedEvent(OLD_EVENT_CREATED, true),
    );

    const res = await POST(makeRequest());
    // 200: ack, non è un errore da ritentare — l'evento è semplicemente stale.
    expect(res.status).toBe(200);
    expect(updateBuilder.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ plan: "pro" }),
    );
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: "cus_123",
        eventCreated: OLD_EVENT_CREATED,
      }),
      expect.stringContaining("stripe_event_out_of_order"),
    );
  });

  it("applica normalmente quando la guardia lascia passare l'evento", async () => {
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);

    mockConstructEvent.mockReturnValue(
      makeUpdatedEvent(NEW_EVENT_CREATED, true),
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({ cancelAtPeriodEnd: true }),
    );
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "pro" }),
    );
    expect(mockLoggerWarn).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("stripe_event_out_of_order"),
    );
  });

  it("propaga event.created anche da checkout.session.completed", async () => {
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_123",
      status: "active",
      customer: "cus_123",
      cancel_at_period_end: false,
      items: {
        data: [{ price: { id: "price_pro" }, current_period_end: 9999 }],
      },
    });

    mockConstructEvent.mockReturnValue({
      id: "evt_co_watermark",
      type: "checkout.session.completed",
      created: NEW_EVENT_CREATED,
      data: { object: { subscription: "sub_123", customer: "cus_123" } },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        lastStripeEventCreated: new Date(NEW_EVENT_CREATED * 1000),
      }),
    );
  });

  it("scarta un customer.subscription.deleted più vecchio senza declassare il profilo a trial", async () => {
    const updateBuilder = makeUpdateBuilder([]);
    mockUpdate.mockReturnValue(updateBuilder);

    mockConstructEvent.mockReturnValue({
      id: "evt_del_stale",
      type: "customer.subscription.deleted",
      created: OLD_EVENT_CREATED,
      data: { object: { id: "sub_123", customer: "cus_123" } },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(updateBuilder.set).not.toHaveBeenCalledWith({ plan: "trial" });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: "sub_123",
        eventCreated: OLD_EVENT_CREATED,
      }),
      expect.stringContaining("stripe_event_out_of_order"),
    );
  });

  it("distingue riga assente da evento fuori ordine su customer.subscription.deleted", async () => {
    // 0 righe aggiornate ma nessuna riga trovata dal SELECT: non è un problema
    // di ordering, è una subscription che non abbiamo mai registrato.
    const updateBuilder = makeUpdateBuilder([]);
    mockUpdate.mockReturnValue(updateBuilder);
    mockSelect.mockReturnValue(makeSelectBuilder([]));

    mockConstructEvent.mockReturnValue({
      id: "evt_del_missing",
      type: "customer.subscription.deleted",
      created: NEW_EVENT_CREATED,
      data: { object: { id: "sub_unknown", customer: "cus_unknown" } },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockLoggerWarn).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("stripe_event_out_of_order"),
    );
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ stripeSubscriptionId: "sub_unknown" }),
      expect.stringContaining("no subscription row found"),
    );
  });

  it("non rilascia il claim su un evento scartato (niente retry di Stripe)", async () => {
    // Un evento stale è *processato*, non fallito: il claim resta e la dedup
    // impedisce che i retry di Stripe (fino a 3 giorni) lo ripresentino.
    const updateBuilder = makeUpdateBuilder([]);
    mockUpdate.mockReturnValue(updateBuilder);

    mockConstructEvent.mockReturnValue(
      makeUpdatedEvent(OLD_EVENT_CREATED, true),
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("continua a fallire con 500 se la riga subscription non esiste affatto", async () => {
    // Il lookup precede l'UPDATE proprio per non confondere questo desync
    // (riga mai creata → Stripe deve ritentare) con un evento fuori ordine.
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        await fn({ update: mockUpdate, select: mockSelect });
      },
    );

    mockConstructEvent.mockReturnValue(
      makeUpdatedEvent(NEW_EVENT_CREATED, false),
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCustomerId: "cus_123" }),
      expect.stringContaining("no subscription row found"),
    );
    // Claim rilasciato: questo sì che deve essere ritentato da Stripe.
    expect(mockDelete).toHaveBeenCalled();
  });

  it("non alza il watermark dagli handler invoice.* (full-sync appaiato non va perso)", async () => {
    // invoice.payment_failed scrive solo `status`: se alzasse il watermark col
    // proprio `created`, il customer.subscription.updated appaiato — che ha
    // spesso un `created` di poco precedente — verrebbe scartato.
    const updateBuilder = makeUpdateBuilder();
    mockUpdate.mockReturnValue(updateBuilder);

    mockConstructEvent.mockReturnValue({
      id: "evt_pd_watermark",
      type: "invoice.payment_failed",
      created: NEW_EVENT_CREATED,
      data: {
        object: {
          parent: { subscription_details: { subscription: "sub_123" } },
        },
      },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(updateBuilder.set).toHaveBeenCalledWith({ status: "past_due" });
    expect(updateBuilder.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ lastStripeEventCreated: expect.anything() }),
    );
  });
});
