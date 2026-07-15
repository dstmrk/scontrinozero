// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthenticatedError } from "@/lib/auth-errors";
import { logger } from "@/lib/logger";

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
    it("ritorna 'Non autenticato.' senza loggare se la sessione manca", async () => {
      mockGetAuthenticatedUser.mockRejectedValue(new UnauthenticatedError());

      const { getProfilePlan } = await import("./billing-actions");
      const result = await getProfilePlan();

      expect(result).toEqual({ error: "Non autenticato." });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("degrada con messaggio 503-like se l'auth fallisce in modo inatteso", async () => {
      mockGetAuthenticatedUser.mockRejectedValue(new Error("db timeout"));

      const { getProfilePlan } = await import("./billing-actions");
      const result = await getProfilePlan();

      expect(result).toEqual({
        error: "Servizio temporaneamente non disponibile. Riprova.",
      });
      expect(logger.error).toHaveBeenCalledTimes(1);
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

    it("cancelAtPeriodEnd è false senza subscription", async () => {
      mockSelectLimit.mockResolvedValue([]);

      const { getProfilePlan } = await import("./billing-actions");
      const result = await getProfilePlan();

      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.cancelAtPeriodEnd).toBe(false);
    });

    it("restituisce cancelAtPeriodEnd=true quando l'abbonamento è in cancellazione", async () => {
      mockSelectLimit.mockResolvedValue([
        {
          id: "sub-789",
          status: "active",
          interval: "month",
          cancelAtPeriodEnd: true,
        },
      ]);

      const { getProfilePlan } = await import("./billing-actions");
      const result = await getProfilePlan();

      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.cancelAtPeriodEnd).toBe(true);
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

  // getEffectivePlan NON deve più essere esportata da questo modulo "use
  // server" (REVIEW #66): ogni export async diventa un endpoint POST pubblico,
  // e getEffectivePlan accetta uno userId arbitrario senza autenticazione. È
  // stata spostata in "@/lib/plans" come helper server-only. I test funzionali
  // vivono ora in src/lib/plans.test.ts.
  describe("getEffectivePlan (hardening REVIEW #66)", () => {
    it("non è più esportata dal modulo 'use server' billing-actions", async () => {
      const mod = await import("./billing-actions");
      expect("getEffectivePlan" in mod).toBe(false);
    });
  });
});
