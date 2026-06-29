import { describe, it, expect } from "vitest";
import {
  computeBillingCardState,
  type BillingPlanData,
} from "./billing-card-state";

/** trialStartedAt abbastanza recente da NON essere scaduto. */
const FRESH_TRIAL = new Date();
/** planExpiresAt nel futuro → piano pagato non scaduto. */
const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
/** planExpiresAt nel passato oltre la grazia → piano pagato scaduto. */
const LONG_PAST = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

function planData(overrides: Partial<BillingPlanData>): BillingPlanData {
  return {
    plan: "pro",
    trialStartedAt: FRESH_TRIAL,
    planExpiresAt: FUTURE,
    hasSubscription: true,
    subscriptionStatus: "active",
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

describe("computeBillingCardState", () => {
  it("ritorna trial-active se planData è null", () => {
    expect(computeBillingCardState(null)).toBe("trial-active");
  });

  it("ritorna unlimited per il piano unlimited", () => {
    expect(
      computeBillingCardState(
        planData({ plan: "unlimited", subscriptionStatus: null }),
      ),
    ).toBe("unlimited");
  });

  it("ritorna subscribed per una subscription active", () => {
    expect(
      computeBillingCardState(planData({ subscriptionStatus: "active" })),
    ).toBe("subscribed");
  });

  it("ritorna canceling per una subscription active con cancel_at_period_end", () => {
    expect(
      computeBillingCardState(
        planData({ subscriptionStatus: "active", cancelAtPeriodEnd: true }),
      ),
    ).toBe("canceling");
  });

  it("il ramo past_due precede canceling (dunning ha priorità)", () => {
    expect(
      computeBillingCardState(
        planData({ subscriptionStatus: "past_due", cancelAtPeriodEnd: true }),
      ),
    ).toBe("past-due");
  });

  it("il safety-net trial-expired precede canceling (piano scaduto oltre grazia)", () => {
    expect(
      computeBillingCardState(
        planData({
          subscriptionStatus: "active",
          cancelAtPeriodEnd: true,
          planExpiresAt: LONG_PAST,
        }),
      ),
    ).toBe("trial-expired");
  });

  it("ritorna subscribed quando cancel_at_period_end è false (non-regressione)", () => {
    expect(
      computeBillingCardState(
        planData({ subscriptionStatus: "active", cancelAtPeriodEnd: false }),
      ),
    ).toBe("subscribed");
  });

  it("ritorna past-due per una subscription past_due", () => {
    expect(
      computeBillingCardState(planData({ subscriptionStatus: "past_due" })),
    ).toBe("past-due");
  });

  it("ritorna past-due per una subscription unpaid (coerenza col gate checkout)", () => {
    expect(
      computeBillingCardState(planData({ subscriptionStatus: "unpaid" })),
    ).toBe("past-due");
  });

  it("ritorna trial-expired se il piano pagato è scaduto oltre la grazia (safety-net)", () => {
    // status active ma planExpiresAt nel passato → i gate sono già read-only.
    expect(
      computeBillingCardState(
        planData({ subscriptionStatus: "active", planExpiresAt: LONG_PAST }),
      ),
    ).toBe("trial-expired");
  });

  it("il ramo past_due precede il safety-net trial-expired (dunning non oscurato)", () => {
    expect(
      computeBillingCardState(
        planData({ subscriptionStatus: "past_due", planExpiresAt: LONG_PAST }),
      ),
    ).toBe("past-due");
  });

  it("ritorna trial-expired se non c'è subscription e il trial è scaduto", () => {
    expect(
      computeBillingCardState(
        planData({
          plan: "trial",
          hasSubscription: false,
          subscriptionStatus: null,
          trialStartedAt: new Date("2000-01-01"),
        }),
      ),
    ).toBe("trial-expired");
  });

  it("ritorna trial-active se non c'è subscription e il trial è in corso", () => {
    expect(
      computeBillingCardState(
        planData({
          plan: "trial",
          hasSubscription: false,
          subscriptionStatus: null,
          trialStartedAt: FRESH_TRIAL,
        }),
      ),
    ).toBe("trial-active");
  });
});
