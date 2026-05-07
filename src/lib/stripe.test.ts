// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockStripeConstructor = vi.fn();
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function (...args: unknown[]) {
    return mockStripeConstructor(...args);
  }),
}));

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
      apiVersion: expect.stringContaining("2026"),
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
});

describe("isValidPriceId", () => {
  let isValidPriceId: (priceId: string) => boolean;

  beforeEach(async () => {
    vi.resetModules();
    process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_starter_monthly";
    process.env.STRIPE_PRICE_STARTER_YEARLY = "price_starter_yearly";
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_monthly";
    process.env.STRIPE_PRICE_PRO_YEARLY = "price_pro_yearly";
    ({ isValidPriceId } = await import("./stripe"));
  });

  afterEach(() => {
    delete process.env.STRIPE_PRICE_STARTER_MONTHLY;
    delete process.env.STRIPE_PRICE_STARTER_YEARLY;
    delete process.env.STRIPE_PRICE_PRO_MONTHLY;
    delete process.env.STRIPE_PRICE_PRO_YEARLY;
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

  it("returns false for unknown price ID", () => {
    expect(isValidPriceId("price_unknown_123")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidPriceId("")).toBe(false);
  });
});

describe("planFromPriceId", () => {
  let planFromPriceId: (priceId: string) => "starter" | "pro" | null;

  beforeEach(async () => {
    vi.resetModules();
    process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_starter_monthly";
    process.env.STRIPE_PRICE_STARTER_YEARLY = "price_starter_yearly";
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_monthly";
    process.env.STRIPE_PRICE_PRO_YEARLY = "price_pro_yearly";
    ({ planFromPriceId } = await import("./stripe"));
  });

  afterEach(() => {
    delete process.env.STRIPE_PRICE_STARTER_MONTHLY;
    delete process.env.STRIPE_PRICE_STARTER_YEARLY;
    delete process.env.STRIPE_PRICE_PRO_MONTHLY;
    delete process.env.STRIPE_PRICE_PRO_YEARLY;
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

  it("returns null for unknown price ID", () => {
    expect(planFromPriceId("price_unknown")).toBeNull();
  });
});

describe("intervalFromPriceId", () => {
  let intervalFromPriceId: (priceId: string) => "month" | "year" | null;

  beforeEach(async () => {
    vi.resetModules();
    process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_starter_monthly";
    process.env.STRIPE_PRICE_STARTER_YEARLY = "price_starter_yearly";
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_monthly";
    process.env.STRIPE_PRICE_PRO_YEARLY = "price_pro_yearly";
    ({ intervalFromPriceId } = await import("./stripe"));
  });

  afterEach(() => {
    delete process.env.STRIPE_PRICE_STARTER_MONTHLY;
    delete process.env.STRIPE_PRICE_STARTER_YEARLY;
    delete process.env.STRIPE_PRICE_PRO_MONTHLY;
    delete process.env.STRIPE_PRICE_PRO_YEARLY;
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

  it("returns null for unknown price ID", () => {
    expect(intervalFromPriceId("price_unknown")).toBeNull();
  });
});

describe("PRICE_IDS fail-fast", () => {
  let PRICE_IDS: { readonly starterMonthly: string };

  afterEach(() => {
    delete process.env.STRIPE_PRICE_STARTER_MONTHLY;
    delete process.env.STRIPE_PRICE_STARTER_YEARLY;
    delete process.env.STRIPE_PRICE_PRO_MONTHLY;
    delete process.env.STRIPE_PRICE_PRO_YEARLY;
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
});
