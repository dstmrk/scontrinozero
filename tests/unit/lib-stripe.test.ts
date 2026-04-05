// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks ---

const { mockStripeConstructor } = vi.hoisted(() => ({
  mockStripeConstructor: vi.fn().mockImplementation(function (this: unknown) {
    return this;
  }),
}));

vi.mock("stripe", () => ({
  default: mockStripeConstructor,
}));

// Import after mocking
import { getStripe, _resetStripeForTest } from "@/lib/stripe";

describe("getStripe singleton", () => {
  afterEach(() => {
    _resetStripeForTest();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("throws when STRIPE_SECRET_KEY is not set", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(() => getStripe()).toThrow("STRIPE_SECRET_KEY");
  });

  it("creates exactly one Stripe instance across multiple calls", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc123");

    const first = getStripe();
    const second = getStripe();
    const third = getStripe();

    expect(mockStripeConstructor).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("creates a new instance after _resetStripeForTest()", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc123");

    const first = getStripe();
    _resetStripeForTest();
    // re-stub because clearAllMocks resets the mock but the env is still stubbed
    const second = getStripe();

    expect(mockStripeConstructor).toHaveBeenCalledTimes(2);
    expect(first).not.toBe(second);
  });

  it("passes the secret key to the Stripe constructor", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_mykey");

    getStripe();

    expect(mockStripeConstructor).toHaveBeenCalledWith(
      "sk_test_mykey",
      expect.objectContaining({ apiVersion: expect.any(String) }),
    );
  });
});
