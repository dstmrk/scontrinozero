// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockSubscriptionsRetrieve,
  mockSubscriptionsUpdate,
  mockLoggerError,
  mockLoggerWarn,
  mockLoggerInfo,
} = vi.hoisted(() => ({
  mockSubscriptionsRetrieve: vi.fn(),
  mockSubscriptionsUpdate: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerInfo: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn().mockReturnValue({
    subscriptions: {
      retrieve: mockSubscriptionsRetrieve,
      update: mockSubscriptionsUpdate,
    },
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
  },
}));

import { extendSubscriptionForReferral } from "./referral-reward";

// 30 days in seconds — must match REFERRAL_BONUS_DAYS.
const BONUS_SECONDS = 30 * 24 * 60 * 60;

function subWithPeriodEnd(currentPeriodEnd: number) {
  return { items: { data: [{ current_period_end: currentPeriodEnd }] } };
}

const ARGS = {
  stripeSubscriptionId: "sub_123",
  referrerId: "referrer-profile-id",
  refereeId: "referee-profile-id",
};

describe("extendSubscriptionForReferral", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscriptionsUpdate.mockResolvedValue({});
  });

  it("estende trial_end di 30 giorni oltre current_period_end", async () => {
    const periodEnd = 1_800_000_000;
    mockSubscriptionsRetrieve.mockResolvedValue(subWithPeriodEnd(periodEnd));

    const result = await extendSubscriptionForReferral(ARGS);

    expect(result).toEqual({ extended: true });
    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith("sub_123");
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(
      "sub_123",
      { trial_end: periodEnd + BONUS_SECONDS, proration_behavior: "none" },
      { idempotencyKey: "referral-extend:referee-profile-id" },
    );
  });

  it("usa una idempotency key stabile derivata dal refereeId", async () => {
    mockSubscriptionsRetrieve.mockResolvedValue(subWithPeriodEnd(1_000_000));

    await extendSubscriptionForReferral(ARGS);

    const options = mockSubscriptionsUpdate.mock.calls[0][2];
    expect(options.idempotencyKey).toBe("referral-extend:referee-profile-id");
  });

  it("salta l'estensione e logga warn critical se manca current_period_end", async () => {
    mockSubscriptionsRetrieve.mockResolvedValue({ items: { data: [] } });

    const result = await extendSubscriptionForReferral(ARGS);

    expect(result).toEqual({ extended: false });
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        critical: true,
        refereeId: "referee-profile-id",
      }),
      expect.stringContaining("missing current_period_end"),
    );
  });

  it("non rilancia su errore Stripe: logga error critical e ritorna extended:false", async () => {
    mockSubscriptionsRetrieve.mockRejectedValue(new Error("stripe down"));

    const result = await extendSubscriptionForReferral(ARGS);

    expect(result).toEqual({ extended: false });
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        critical: true,
        referrerId: "referrer-profile-id",
        refereeId: "referee-profile-id",
      }),
      expect.stringContaining("manual reconciliation"),
    );
  });

  it("non rilancia se update fallisce dopo un retrieve riuscito", async () => {
    mockSubscriptionsRetrieve.mockResolvedValue(subWithPeriodEnd(1_000_000));
    mockSubscriptionsUpdate.mockRejectedValue(new Error("update failed"));

    const result = await extendSubscriptionForReferral(ARGS);

    expect(result).toEqual({ extended: false });
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
  });
});
