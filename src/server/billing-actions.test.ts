// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockGetAuthenticatedUser = vi.fn();
vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
}));

const {
  mockGetPlan,
  mockGetDb,
  mockSelectLimit,
  mockSelectWhere,
  mockFrom,
  mockSelect,
} = vi.hoisted(() => ({
  mockGetPlan: vi.fn(),
  mockGetDb: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("@/lib/plans", () => ({
  getPlan: (...args: unknown[]) => mockGetPlan(...args),
}));

vi.mock("@/db", () => ({
  getDb: mockGetDb,
}));

vi.mock("@/db/schema", () => ({
  subscriptions: "subscriptions-table",
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const { mockPlanFromPriceId } = vi.hoisted(() => ({
  mockPlanFromPriceId: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  planFromPriceId: mockPlanFromPriceId,
}));

// --- Fixtures ---

const FAKE_USER = { id: "user-123" };

const FAKE_PLAN_INFO = {
  plan: "starter" as const,
  trialStartedAt: new Date("2026-01-01"),
  planExpiresAt: new Date("2027-01-01"),
};

// --- Tests ---

describe("billing-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetAuthenticatedUser.mockResolvedValue(FAKE_USER);
    mockGetPlan.mockResolvedValue(FAKE_PLAN_INFO);
    mockPlanFromPriceId.mockReturnValue(null);

    mockGetDb.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
    mockSelectLimit.mockResolvedValue([]);
  });

  describe("getProfilePlan", () => {
    it("ritorna errore se utente non autenticato", async () => {
      mockGetAuthenticatedUser.mockRejectedValue(
        new Error("Not authenticated"),
      );

      const { getProfilePlan } = await import("./billing-actions");
      const result = await getProfilePlan();

      expect("error" in result).toBe(true);
    });

    it("ritorna il piano corrente dell'utente", async () => {
      const { getProfilePlan } = await import("./billing-actions");
      const result = await getProfilePlan();

      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.plan).toBe("starter");
      expect(result.trialStartedAt).toEqual(new Date("2026-01-01"));
      expect(result.planExpiresAt).toEqual(new Date("2027-01-01"));
    });

    it("hasSubscription è false quando non esiste subscription", async () => {
      mockSelectLimit.mockResolvedValue([]);

      const { getProfilePlan } = await import("./billing-actions");
      const result = await getProfilePlan();

      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.hasSubscription).toBe(false);
    });

    it("hasSubscription è true quando esiste una subscription", async () => {
      mockSelectLimit.mockResolvedValue([
        { id: "sub-123", status: "active", interval: "month" },
      ]);

      const { getProfilePlan } = await import("./billing-actions");
      const result = await getProfilePlan();

      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.hasSubscription).toBe(true);
    });

    it("subscriptionStatus e subscriptionInterval sono null senza subscription", async () => {
      mockSelectLimit.mockResolvedValue([]);

      const { getProfilePlan } = await import("./billing-actions");
      const result = await getProfilePlan();

      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.subscriptionStatus).toBeNull();
      expect(result.subscriptionInterval).toBeNull();
    });

    it("restituisce subscriptionStatus e subscriptionInterval dalla subscription", async () => {
      mockSelectLimit.mockResolvedValue([
        { id: "sub-123", status: "active", interval: "year" },
      ]);

      const { getProfilePlan } = await import("./billing-actions");
      const result = await getProfilePlan();

      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.subscriptionStatus).toBe("active");
      expect(result.subscriptionInterval).toBe("year");
    });

    it("restituisce subscriptionStatus past_due quando il pagamento è fallito", async () => {
      mockSelectLimit.mockResolvedValue([
        { id: "sub-456", status: "past_due", interval: "month" },
      ]);

      const { getProfilePlan } = await import("./billing-actions");
      const result = await getProfilePlan();

      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.subscriptionStatus).toBe("past_due");
      expect(result.subscriptionInterval).toBe("month");
    });

    it("richiama getPlan con lo userId corretto", async () => {
      const { getProfilePlan } = await import("./billing-actions");
      await getProfilePlan();

      expect(mockGetPlan).toHaveBeenCalledWith("user-123");
    });

    it("ritorna piano trial con trialStartedAt null se non impostato", async () => {
      mockGetPlan.mockResolvedValue({
        plan: "trial",
        trialStartedAt: null,
        planExpiresAt: null,
      });

      const { getProfilePlan } = await import("./billing-actions");
      const result = await getProfilePlan();

      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.plan).toBe("trial");
      expect(result.trialStartedAt).toBeNull();
      expect(result.planExpiresAt).toBeNull();
    });
  });

  describe("getEffectivePlan", () => {
    it("ritorna il piano DB quando non è 'trial'", async () => {
      mockGetPlan.mockResolvedValue({
        plan: "pro",
        trialStartedAt: null,
        planExpiresAt: null,
      });
      mockSelectLimit.mockResolvedValue([]);

      const { getEffectivePlan } = await import("./billing-actions");
      const result = await getEffectivePlan("user-123");

      expect(result).toBe("pro");
      expect(mockPlanFromPriceId).not.toHaveBeenCalled();
    });

    it("ritorna il piano DB quando è 'trial' ma non esiste subscription row", async () => {
      mockGetPlan.mockResolvedValue({
        plan: "trial",
        trialStartedAt: new Date(),
        planExpiresAt: null,
      });
      mockSelectLimit.mockResolvedValue([]);

      const { getEffectivePlan } = await import("./billing-actions");
      const result = await getEffectivePlan("user-123");

      expect(result).toBe("trial");
    });

    it("deriva il piano da stripePriceId quando DB è 'trial' ma subscription row esiste (race condition)", async () => {
      mockGetPlan.mockResolvedValue({
        plan: "trial",
        trialStartedAt: new Date(),
        planExpiresAt: null,
      });
      mockPlanFromPriceId.mockReturnValue("pro");
      // status must be 'active': checkout completed + payment confirmed
      mockSelectLimit.mockResolvedValue([
        { stripePriceId: "price_pro_monthly", status: "active" },
      ]);

      const { getEffectivePlan } = await import("./billing-actions");
      const result = await getEffectivePlan("user-123");

      expect(result).toBe("pro");
      expect(mockPlanFromPriceId).toHaveBeenCalledWith("price_pro_monthly");
    });

    it("mantiene 'trial' se planFromPriceId non riconosce il priceId", async () => {
      mockGetPlan.mockResolvedValue({
        plan: "trial",
        trialStartedAt: new Date(),
        planExpiresAt: null,
      });
      mockPlanFromPriceId.mockReturnValue(null);
      mockSelectLimit.mockResolvedValue([{ stripePriceId: "price_unknown" }]);

      const { getEffectivePlan } = await import("./billing-actions");
      const result = await getEffectivePlan("user-123");

      expect(result).toBe("trial");
    });
  });
});
