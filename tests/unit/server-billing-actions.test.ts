// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const {
  mockGetAuthenticatedUser,
  mockGetPlan,
  mockPlanFromPriceId,
  mockGetDb,
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockGetPlan: vi.fn(),
  mockPlanFromPriceId: vi.fn(),
  mockGetDb: vi.fn(),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
}));

vi.mock("@/lib/plans", () => ({
  getPlan: mockGetPlan,
}));

vi.mock("@/lib/stripe", () => ({
  planFromPriceId: mockPlanFromPriceId,
}));

vi.mock("@/db", () => ({
  getDb: mockGetDb,
}));

vi.mock("@/db/schema", () => ({
  subscriptions: "subscriptions-table",
}));

import { getProfilePlan, getEffectivePlan } from "@/server/billing-actions";

// --- Helpers ---

function makeSubRow(
  overrides: Partial<{
    status: string;
    interval: string;
    stripePriceId: string | null;
  }> = {},
) {
  return {
    id: "sub-uuid-1",
    status: "active",
    interval: "month",
    stripePriceId: null,
    ...overrides,
  };
}

// --- Tests ---

describe("getProfilePlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetAuthenticatedUser.mockResolvedValue({ id: "user-123" });
    mockGetPlan.mockResolvedValue({
      plan: "trial",
      trialStartedAt: new Date("2026-01-01"),
      planExpiresAt: null,
    });
    mockPlanFromPriceId.mockReturnValue(null);

    mockGetDb.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
  });

  it("returns error when user is not authenticated", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new Error("Not authenticated"));
    const result = await getProfilePlan();
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBeDefined();
    }
  });

  it("returns trial plan when no subscription row exists", async () => {
    mockLimit.mockResolvedValue([]);
    const result = await getProfilePlan();
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.plan).toBe("trial");
      expect(result.hasSubscription).toBe(false);
      expect(result.subscriptionInterval).toBeNull();
      expect(result.subscriptionStatus).toBeNull();
    }
  });

  it("returns plan from profiles when profile plan is not trial", async () => {
    mockGetPlan.mockResolvedValue({
      plan: "starter",
      trialStartedAt: new Date("2026-01-01"),
      planExpiresAt: new Date("2027-01-01"),
    });
    mockLimit.mockResolvedValue([makeSubRow({ stripePriceId: "price_xxx" })]);
    // planFromPriceId should NOT be called if plan is already "starter"
    const result = await getProfilePlan();
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.plan).toBe("starter");
      expect(mockPlanFromPriceId).not.toHaveBeenCalled();
    }
  });

  it("derives plan from stripePriceId when profiles.plan is still trial and status is active", async () => {
    mockPlanFromPriceId.mockReturnValue("starter");
    mockLimit.mockResolvedValue([
      makeSubRow({ stripePriceId: "price_starter_yearly", status: "active" }),
    ]);
    const result = await getProfilePlan();
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.plan).toBe("starter");
      expect(mockPlanFromPriceId).toHaveBeenCalledWith("price_starter_yearly");
    }
  });

  // P2-04: subscription in non-active states must NOT grant premium access
  it("keeps trial plan when subscription status is incomplete (P2-04)", async () => {
    mockPlanFromPriceId.mockReturnValue("starter");
    mockLimit.mockResolvedValue([
      makeSubRow({
        stripePriceId: "price_starter_yearly",
        status: "incomplete",
      }),
    ]);
    const result = await getProfilePlan();
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.plan).toBe("trial");
      expect(mockPlanFromPriceId).not.toHaveBeenCalled();
    }
  });

  it("keeps trial plan when subscription status is past_due (P2-04)", async () => {
    mockPlanFromPriceId.mockReturnValue("starter");
    mockLimit.mockResolvedValue([
      makeSubRow({ stripePriceId: "price_starter_yearly", status: "past_due" }),
    ]);
    const result = await getProfilePlan();
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.plan).toBe("trial");
      expect(mockPlanFromPriceId).not.toHaveBeenCalled();
    }
  });

  it("keeps trial plan when profiles.plan is trial and stripePriceId is null", async () => {
    mockLimit.mockResolvedValue([makeSubRow({ stripePriceId: null })]);
    const result = await getProfilePlan();
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.plan).toBe("trial");
    }
  });

  it("keeps trial plan when planFromPriceId returns null for unknown price", async () => {
    mockPlanFromPriceId.mockReturnValue(null);
    mockLimit.mockResolvedValue([
      makeSubRow({ stripePriceId: "price_unknown" }),
    ]);
    const result = await getProfilePlan();
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.plan).toBe("trial");
    }
  });

  it("returns correct interval and status from subscription row", async () => {
    mockPlanFromPriceId.mockReturnValue("pro");
    mockLimit.mockResolvedValue([
      makeSubRow({
        stripePriceId: "price_pro_yearly",
        interval: "year",
        status: "active",
      }),
    ]);
    const result = await getProfilePlan();
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.subscriptionInterval).toBe("year");
      expect(result.subscriptionStatus).toBe("active");
      expect(result.hasSubscription).toBe(true);
    }
  });

  it("keeps trial plan when subscription status is canceled (P2-04)", async () => {
    mockPlanFromPriceId.mockReturnValue("starter");
    mockLimit.mockResolvedValue([
      makeSubRow({ stripePriceId: "price_starter_yearly", status: "canceled" }),
    ]);
    const result = await getProfilePlan();
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.plan).toBe("trial");
    }
  });

  it("returns planExpiresAt from profiles", async () => {
    const expiry = new Date("2027-02-15");
    mockGetPlan.mockResolvedValue({
      plan: "starter",
      trialStartedAt: new Date("2026-01-01"),
      planExpiresAt: expiry,
    });
    mockLimit.mockResolvedValue([makeSubRow()]);
    const result = await getProfilePlan();
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.planExpiresAt).toEqual(expiry);
    }
  });
});

describe("getEffectivePlan (P2-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetPlan.mockResolvedValue({
      plan: "trial",
      trialStartedAt: new Date("2026-01-01"),
      planExpiresAt: null,
    });
    mockPlanFromPriceId.mockReturnValue(null);

    mockGetDb.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
  });

  it("returns trial when no subscription exists", async () => {
    mockLimit.mockResolvedValue([]);
    const plan = await getEffectivePlan("user-123");
    expect(plan).toBe("trial");
  });

  it("derives plan from priceId when subscription is active", async () => {
    mockPlanFromPriceId.mockReturnValue("pro");
    mockLimit.mockResolvedValue([
      { stripePriceId: "price_pro_monthly", status: "active" },
    ]);
    const plan = await getEffectivePlan("user-123");
    expect(plan).toBe("pro");
  });

  it("keeps trial when subscription is incomplete (P2-04)", async () => {
    mockPlanFromPriceId.mockReturnValue("pro");
    mockLimit.mockResolvedValue([
      { stripePriceId: "price_pro_monthly", status: "incomplete" },
    ]);
    const plan = await getEffectivePlan("user-123");
    expect(plan).toBe("trial");
    expect(mockPlanFromPriceId).not.toHaveBeenCalled();
  });

  it("keeps trial when subscription is past_due (P2-04)", async () => {
    mockPlanFromPriceId.mockReturnValue("pro");
    mockLimit.mockResolvedValue([
      { stripePriceId: "price_pro_monthly", status: "past_due" },
    ]);
    const plan = await getEffectivePlan("user-123");
    expect(plan).toBe("trial");
  });

  it("keeps profile plan when profiles.plan is not trial", async () => {
    mockGetPlan.mockResolvedValue({
      plan: "starter",
      trialStartedAt: new Date("2026-01-01"),
      planExpiresAt: null,
    });
    mockLimit.mockResolvedValue([
      { stripePriceId: "price_pro_monthly", status: "active" },
    ]);
    const plan = await getEffectivePlan("user-123");
    expect(plan).toBe("starter");
    expect(mockPlanFromPriceId).not.toHaveBeenCalled();
  });
});
