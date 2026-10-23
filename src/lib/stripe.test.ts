// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockStripeConstructor = vi.fn();
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function (...args: unknown[]) {
    return mockStripeConstructor(...args);
  }),
}));

const PRICE_ENV = {
  STRIPE_PRICE_STARTER_MONTHLY: "price_starter_monthly",
  STRIPE_PRICE_STARTER_YEARLY: "price_starter_yearly",
  STRIPE_PRICE_PRO_MONTHLY: "price_pro_monthly",
  STRIPE_PRICE_PRO_YEARLY: "price_pro_yearly",
  STRIPE_PRICE_TEAM_MONTHLY: "price_team_monthly",
  STRIPE_PRICE_TEAM_YEARLY: "price_team_yearly",
} as const;

function setPriceEnv(): void {
  Object.assign(process.env, PRICE_ENV);
}

function clearPriceEnv(): void {
  for (const name of Object.keys(PRICE_ENV)) delete process.env[name];
}

describe("getStripe", () => {
  let getStripe: () => import("stripe").default;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockStripeConstructor.mockReturnValue({ _isMockStripeInstance: true });
    ({ getStripe } = await import("./stripe"));
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("throws when STRIPE_SECRET_KEY is not set", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(() => getStripe()).toThrow("STRIPE_SECRET_KEY");
  });

  it("returns a Stripe instance when key is set", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_abc";
    const instance = getStripe();
    expect(instance).toBeDefined();
    expect(mockStripeConstructor).toHaveBeenCalledWith("sk_test_abc", {
      apiVersion: "2026-09-30.endive",
    });
  });

  it("calls Stripe constructor with the provided key", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_xyz";
    getStripe();
    expect(mockStripeConstructor).toHaveBeenCalledWith(
      "sk_test_xyz",
      expect.any(Object),
    );
  });

  it("non applica timeout/maxNetworkRetries globalmente (write checkout/portal restano col default SDK)", () => {
    // Stripe write senza Idempotency-Key applicativo: un timeout client-side
    // troppo aggressivo sul singleton condiviso causerebbe duplicati su retry
    // utente. Timeout va applicato per-request nel solo webhook handler.
    process.env.STRIPE_SECRET_KEY = "sk_test_no_global_timeout";
    getStripe();
    const [, opts] = mockStripeConstructor.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(opts).not.toHaveProperty("timeout");
    expect(opts).not.toHaveProperty("maxNetworkRetries");
  });
});

describe("STRIPE_WEBHOOK_REQUEST_OPTIONS", () => {
  it("definisce timeout e maxNetworkRetries per il webhook path", async () => {
    const { STRIPE_WEBHOOK_REQUEST_OPTIONS } = await import("./stripe");
    // Webhook deadline lato Stripe è 30s: timeout < deadline per lasciare
    // spazio ai retry SDK interni.
    expect(STRIPE_WEBHOOK_REQUEST_OPTIONS.timeout).toBeGreaterThan(0);
    expect(STRIPE_WEBHOOK_REQUEST_OPTIONS.timeout).toBeLessThan(30_000);
    // Almeno 1 retry per assorbire blip transienti.
    expect(
      STRIPE_WEBHOOK_REQUEST_OPTIONS.maxNetworkRetries,
    ).toBeGreaterThanOrEqual(1);
  });
});

describe("isValidPriceId", () => {
  let isValidPriceId: (priceId: string) => boolean;

  beforeEach(async () => {
    vi.resetModules();
    setPriceEnv();
    ({ isValidPriceId } = await import("./stripe"));
  });

  afterEach(() => {
    clearPriceEnv();
  });

  it("returns true for starter monthly price ID", () => {
    expect(isValidPriceId("price_starter_monthly")).toBe(true);
  });

  it("returns true for starter yearly price ID", () => {
    expect(isValidPriceId("price_starter_yearly")).toBe(true);
  });

  it("returns true for pro monthly price ID", () => {
    expect(isValidPriceId("price_pro_monthly")).toBe(true);
  });

  it("returns true for pro yearly price ID", () => {
    expect(isValidPriceId("price_pro_yearly")).toBe(true);
  });

  it("returns true for both team price IDs", () => {
    expect(isValidPriceId("price_team_monthly")).toBe(true);
    expect(isValidPriceId("price_team_yearly")).toBe(true);
  });

  it("returns false for unknown price ID", () => {
    expect(isValidPriceId("price_unknown_123")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidPriceId("")).toBe(false);
  });
});

describe("planFromPriceId", () => {
  let planFromPriceId: (priceId: string) => string | null;

  beforeEach(async () => {
    vi.resetModules();
    setPriceEnv();
    ({ planFromPriceId } = await import("./stripe"));
  });

  afterEach(() => {
    clearPriceEnv();
  });

  it("returns 'starter' for starter monthly", () => {
    expect(planFromPriceId("price_starter_monthly")).toBe("starter");
  });

  it("returns 'starter' for starter yearly", () => {
    expect(planFromPriceId("price_starter_yearly")).toBe("starter");
  });

  it("returns 'pro' for pro monthly", () => {
    expect(planFromPriceId("price_pro_monthly")).toBe("pro");
  });

  it("returns 'pro' for pro yearly", () => {
    expect(planFromPriceId("price_pro_yearly")).toBe("pro");
  });

  it("returns 'team' for both team prices", () => {
    expect(planFromPriceId("price_team_monthly")).toBe("team");
    expect(planFromPriceId("price_team_yearly")).toBe("team");
  });

  it("returns null for unknown price ID", () => {
    expect(planFromPriceId("price_unknown")).toBeNull();
  });
});

describe("intervalFromPriceId", () => {
  let intervalFromPriceId: (priceId: string) => "month" | "year" | null;

  beforeEach(async () => {
    vi.resetModules();
    setPriceEnv();
    ({ intervalFromPriceId } = await import("./stripe"));
  });

  afterEach(() => {
    clearPriceEnv();
  });

  it("returns 'month' for starter monthly", () => {
    expect(intervalFromPriceId("price_starter_monthly")).toBe("month");
  });

  it("returns 'month' for pro monthly", () => {
    expect(intervalFromPriceId("price_pro_monthly")).toBe("month");
  });

  it("returns 'year' for starter yearly", () => {
    expect(intervalFromPriceId("price_starter_yearly")).toBe("year");
  });

  it("returns 'year' for pro yearly", () => {
    expect(intervalFromPriceId("price_pro_yearly")).toBe("year");
  });

  it("returns the interval of the team prices", () => {
    expect(intervalFromPriceId("price_team_monthly")).toBe("month");
    expect(intervalFromPriceId("price_team_yearly")).toBe("year");
  });

  it("returns null for unknown price ID", () => {
    expect(intervalFromPriceId("price_unknown")).toBeNull();
  });
});

describe("PRICE_IDS fail-fast", () => {
  let PRICE_IDS: {
    readonly starterMonthly: string;
    readonly teamMonthly: string;
    readonly teamYearly: string;
  };

  afterEach(() => {
    clearPriceEnv();
  });

  it("throws when STRIPE_PRICE_STARTER_MONTHLY is missing", async () => {
    vi.resetModules();
    delete process.env.STRIPE_PRICE_STARTER_MONTHLY;
    ({ PRICE_IDS } = await import("./stripe"));
    expect(() => PRICE_IDS.starterMonthly).toThrow(
      /STRIPE_PRICE_STARTER_MONTHLY/,
    );
  });

  it("throws when STRIPE_PRICE_STARTER_MONTHLY is empty string", async () => {
    vi.resetModules();
    process.env.STRIPE_PRICE_STARTER_MONTHLY = "";
    ({ PRICE_IDS } = await import("./stripe"));
    expect(() => PRICE_IDS.starterMonthly).toThrow(
      /STRIPE_PRICE_STARTER_MONTHLY/,
    );
  });

  it("returns the configured value when env is set", async () => {
    vi.resetModules();
    process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_test_xyz";
    ({ PRICE_IDS } = await import("./stripe"));
    expect(PRICE_IDS.starterMonthly).toBe("price_test_xyz");
  });

  it("throws when a team price env var is missing", async () => {
    vi.resetModules();
    setPriceEnv();
    delete process.env.STRIPE_PRICE_TEAM_MONTHLY;
    delete process.env.STRIPE_PRICE_TEAM_YEARLY;
    ({ PRICE_IDS } = await import("./stripe"));
    expect(() => PRICE_IDS.teamMonthly).toThrow(/STRIPE_PRICE_TEAM_MONTHLY/);
    expect(() => PRICE_IDS.teamYearly).toThrow(/STRIPE_PRICE_TEAM_YEARLY/);
  });
});

// Le variabili Team sono nuove (issue #1099): un ambiente aggiornato senza
// di esse non deve smettere di riconoscere i prezzi Starter e Pro, che il
// webhook risolve a ogni rinnovo.
describe("risoluzione dei prezzi senza le variabili Team", () => {
  let planFromPriceId: (priceId: string) => string | null;
  let intervalFromPriceId: (priceId: string) => string | null;

  beforeEach(async () => {
    vi.resetModules();
    setPriceEnv();
    delete process.env.STRIPE_PRICE_TEAM_MONTHLY;
    delete process.env.STRIPE_PRICE_TEAM_YEARLY;
    ({ planFromPriceId, intervalFromPriceId } = await import("./stripe"));
  });

  afterEach(() => {
    clearPriceEnv();
  });

  it("riconosce ancora i prezzi Starter e Pro", () => {
    expect(planFromPriceId("price_pro_yearly")).toBe("pro");
    expect(intervalFromPriceId("price_pro_yearly")).toBe("year");
    expect(planFromPriceId("price_starter_yearly")).toBe("starter");
    expect(intervalFromPriceId("price_starter_yearly")).toBe("year");
  });

  it("su un prezzo sconosciuto nomina la variabile mancante", () => {
    expect(() => planFromPriceId("price_unknown")).toThrow(
      /STRIPE_PRICE_TEAM_MONTHLY/,
    );
  });
});
