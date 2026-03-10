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
      mockSelectLimit.mockResolvedValue([{ id: "sub-123" }]);

      const { getProfilePlan } = await import("./billing-actions");
      const result = await getProfilePlan();

      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.hasSubscription).toBe(true);
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
});
