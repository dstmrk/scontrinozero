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
  mockIntervalFromPriceId,
  mockIsCollaborator,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockCustomerCreate: vi.fn(),
  mockSessionCreate: vi.fn(),
  mockIsValidPriceId: vi.fn(),
  mockIntervalFromPriceId: vi.fn(),
  mockIsCollaborator: vi.fn(),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
}));

vi.mock("@/lib/business-permissions", () => ({
  isCollaborator: mockIsCollaborator,
  OWNER_ONLY_MESSAGE:
    "Questa operazione è riservata al titolare dell'attività.",
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
  intervalFromPriceId: mockIntervalFromPriceId,
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

const { mockGetTrustedAppUrl } = vi.hoisted(() => ({
  mockGetTrustedAppUrl: vi.fn(),
}));
vi.mock("@/lib/trusted-app-url", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trusted-app-url")>(
    "@/lib/trusted-app-url",
  );
  return {
    ...actual,
    getTrustedAppUrl: mockGetTrustedAppUrl,
  };
});

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

/**
 * Builds an update mock that supports .set().where().
 */
function makeUpdateBuilder() {
  const builder = {
    set: vi.fn(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  builder.set.mockReturnValue(builder);
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
    mockIntervalFromPriceId.mockReturnValue("month");
    mockIsCollaborator.mockResolvedValue(false);
    mockSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/session",
    });
    mockGetTrustedAppUrl.mockReturnValue("https://app.scontrinozero.it");
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
    // Limite per utente; superato, Stripe non viene toccato.
    expect(mockRateLimiterCheck).toHaveBeenCalledWith("checkout:user-1");
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("restituisce 400 se priceId manca", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect(mockSelect).not.toHaveBeenCalled();
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

  // Issue #1099: il piano è dell'attività e lo compra il titolare. Un
  // collaboratore che arrivasse qui creerebbe un cliente Stripe e un
  // abbonamento a suo nome, che il webhook non saprebbe a chi attribuire.
  it("restituisce 403 a un collaboratore, prima di toccare DB e Stripe", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-collab",
      email: "c@b.it",
    });
    mockIsCollaborator.mockResolvedValue(true);

    const res = await POST(makeRequest({ priceId: "price_team" }));

    expect(res.status).toBe(403);
    expect(mockIsCollaborator).toHaveBeenCalledWith("user-collab");
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "restituisce 409 se esiste una subscription active",
      status: "active",
    },
    {
      name: "restituisce 409 se esiste una subscription past_due (evita sub duplicata)",
      status: "past_due",
    },
    {
      name: "restituisce 409 se esiste una subscription unpaid (evita sub duplicata)",
      status: "unpaid",
    },
  ])("$name", async ({ status }) => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(
      makeSelectBuilder([{ stripeCustomerId: "cus_existing", status }]),
    );

    const res = await POST(makeRequest({ priceId: "price_pro" }));
    expect(res.status).toBe(409);
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("consente il checkout se la subscription è incomplete (retry primo pagamento)", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        { stripeCustomerId: "cus_existing", status: "incomplete" },
      ]),
    );

    const res = await POST(makeRequest({ priceId: "price_pro" }));
    expect(res.status).toBe(200);
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" }),
      expect.anything(),
    );
  });

  it("consente il checkout se la subscription è canceled (riattivazione)", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        { stripeCustomerId: "cus_existing", status: "canceled" },
      ]),
    );

    const res = await POST(makeRequest({ priceId: "price_pro" }));
    expect(res.status).toBe(200);
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" }),
      expect.anything(),
    );
  });

  it("usa il customer esistente se già in DB", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        { stripeCustomerId: "cus_existing", status: "pending" },
      ]),
    );

    const res = await POST(makeRequest({ priceId: "price_pro" }));
    expect(res.status).toBe(200);
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" }),
      expect.anything(),
    );
  });

  it("crea un nuovo customer Stripe se non esiste", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    mockCustomerCreate.mockResolvedValue({ id: "cus_new" });
    const insert = makeInsertBuilder([{ id: "sub-row-1" }]);
    mockInsert.mockReturnValue(insert);
    const update = makeUpdateBuilder();
    mockUpdate.mockReturnValue(update);
    mockIntervalFromPriceId.mockReturnValue("year");

    const res = await POST(makeRequest({ priceId: "price_pro" }));
    expect(res.status).toBe(200);
    // Prima si reclama la riga, poi si crea il customer: chi perde la
    // race non crea un secondo cliente Stripe.
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", status: "pending" }),
    );
    expect(insert.values.mock.invocationCallOrder[0]).toBeLessThan(
      mockCustomerCreate.mock.invocationCallOrder[0],
    );
    expect(mockCustomerCreate).toHaveBeenCalledWith(
      { email: "a@b.it" },
      { idempotencyKey: expect.any(String) },
    );
    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: "cus_new",
        stripePriceId: "price_pro",
        interval: "year",
      }),
    );
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_new" }),
      expect.anything(),
    );
  });

  it("non restituisce 500 su conflict INSERT concorrente (race condition)", async () => {
    // Simulate: initial SELECT finds nothing, INSERT conflicts (another
    // request already claimed the row and is creating the Stripe customer).
    // The loser must back off with 503, never create its own Stripe customer.
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });

    mockSelect.mockReturnValue(makeSelectBuilder([]));
    // INSERT returns [] → conflict (another request already claimed it)
    mockInsert.mockReturnValue(makeInsertBuilder([]));

    const res = await POST(makeRequest({ priceId: "price_pro" }));
    expect(res.status).toBe(503);
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("restituisce l'URL della checkout session", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        { stripeCustomerId: "cus_existing", status: "pending" },
      ]),
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
      makeSelectBuilder([
        { stripeCustomerId: "cus_existing", status: "pending" },
      ]),
    );

    await POST(makeRequest({ priceId: "price_pro" }));
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ allow_promotion_codes: true }),
      expect.anything(),
    );
  });

  it("restituisce 503 se NEXT_PUBLIC_APP_URL non passa la validazione", async () => {
    const { TrustedAppUrlError } = await import("@/lib/trusted-app-url");
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        { stripeCustomerId: "cus_existing", status: "pending" },
      ]),
    );
    mockGetTrustedAppUrl.mockImplementationOnce(() => {
      throw new TrustedAppUrlError("hostname not in allowlist");
    });

    const res = await POST(makeRequest({ priceId: "price_pro" }));
    expect(res.status).toBe(503);
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("passa subscription_data.metadata con userId alla checkout session", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-42",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        { stripeCustomerId: "cus_existing", status: "pending" },
      ]),
    );

    await POST(makeRequest({ priceId: "price_pro" }));
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_data: {
          metadata: { userId: "user-42" },
        },
      }),
      expect.anything(),
    );
  });

  it("registra interval 'month' quando il prezzo non ne dichiara uno", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    mockCustomerCreate.mockResolvedValue({ id: "cus_new" });
    mockInsert.mockReturnValue(makeInsertBuilder([{ id: "sub-row-1" }]));
    const update = makeUpdateBuilder();
    mockUpdate.mockReturnValue(update);
    mockIntervalFromPriceId.mockReturnValue(null);

    await POST(makeRequest({ priceId: "price_pro" }));

    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({ interval: "month" }),
    );
  });

  it("restituisce 503 se un'altra richiesta ha già reclamato la riga (customer ancora null)", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(
      makeSelectBuilder([{ stripeCustomerId: null, status: "pending" }]),
    );

    const res = await POST(makeRequest({ priceId: "price_pro" }));
    expect(res.status).toBe(503);
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("crea la sessione in modalità subscription, col prezzo scelto e una chiave di idempotenza", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        { stripeCustomerId: "cus_existing", status: "pending" },
      ]),
    );

    await POST(makeRequest({ priceId: "price_pro_yearly" }));
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        line_items: [{ price: "price_pro_yearly", quantity: 1 }],
      }),
      { idempotencyKey: expect.any(String) },
    );
  });

  it("restituisce 503 e non apre la sessione se Stripe fallisce la creazione del customer", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(makeSelectBuilder([]));
    mockInsert.mockReturnValue(makeInsertBuilder([{ id: "sub-row-1" }]));
    mockCustomerCreate.mockRejectedValue(new Error("Stripe network error"));

    const res = await POST(makeRequest({ priceId: "price_pro" }));
    expect(res.status).toBe(503);
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("restituisce 503 se Stripe fallisce la creazione della sessione", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "a@b.it",
    });
    mockSelect.mockReturnValue(
      makeSelectBuilder([
        { stripeCustomerId: "cus_existing", status: "pending" },
      ]),
    );
    mockSessionCreate.mockRejectedValue(new Error("Stripe timeout"));

    const res = await POST(makeRequest({ priceId: "price_pro" }));
    expect(res.status).toBe(503);
  });
});
