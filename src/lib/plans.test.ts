// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

// Use vi.hoisted() to guarantee variables are available when the vi.mock
// factory executes (vi.mock is hoisted before const declarations).
const { mockGetDb, mockLimit, mockSelectWhere, mockFrom, mockSelect } =
  vi.hoisted(() => ({
    mockGetDb: vi.fn(),
    mockLimit: vi.fn(),
    mockSelectWhere: vi.fn(),
    mockFrom: vi.fn(),
    mockSelect: vi.fn(),
  }));

vi.mock("@/db", () => ({
  getDb: mockGetDb,
}));

vi.mock("@/db/schema", () => ({
  profiles: "profiles-table",
}));

import {
  API_KEY_LIMITS,
  DEVELOPER_MONTHLY_LIMITS,
  PLAN_VALUES,
  STARTER_CATALOG_LIMIT,
  TRIAL_DAYS,
  assertProPlan,
  canAddCatalogItem,
  canEmit,
  canUseApi,
  canUsePro,
  getApiKeyLimit,
  getPlan,
  isDeveloperPlan,
  isPlan,
  isTrialExpired,
} from "./plans";

// --- Helpers ---

/** Returns a Date that is `days` days ago from now */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// --- Tests ---

describe("constants", () => {
  it("TRIAL_DAYS is 30", () => {
    expect(TRIAL_DAYS).toBe(30);
  });

  it("STARTER_CATALOG_LIMIT is 5", () => {
    expect(STARTER_CATALOG_LIMIT).toBe(5);
  });
});

describe("isTrialExpired", () => {
  it("returns false when trial started today", () => {
    expect(isTrialExpired(new Date())).toBe(false);
  });

  it("returns false when trial started 29 days ago", () => {
    expect(isTrialExpired(daysAgo(29))).toBe(false);
  });

  it("returns true when trial started 31 days ago", () => {
    expect(isTrialExpired(daysAgo(31))).toBe(true);
  });

  it("returns true when trial started exactly 30 days ago (boundary — day has passed)", () => {
    expect(isTrialExpired(daysAgo(30))).toBe(true);
  });

  it("returns true when trialStartedAt is null (no trial started → treat as expired)", () => {
    expect(isTrialExpired(null)).toBe(true);
  });
});

describe("canEmit", () => {
  it("allows trial plan that is not expired", () => {
    expect(canEmit("trial", daysAgo(10))).toBe(true);
  });

  it("blocks trial plan that is expired", () => {
    expect(canEmit("trial", daysAgo(31))).toBe(false);
  });

  it("allows starter plan", () => {
    expect(canEmit("starter", daysAgo(100))).toBe(true);
  });

  it("allows pro plan", () => {
    expect(canEmit("pro", null)).toBe(true);
  });

  it("allows unlimited plan", () => {
    expect(canEmit("unlimited", null)).toBe(true);
  });
});

describe("canUsePro", () => {
  it("returns true for pro plan", () => {
    expect(canUsePro("pro")).toBe(true);
  });

  it("returns true for unlimited plan", () => {
    expect(canUsePro("unlimited")).toBe(true);
  });

  it("returns false for starter plan", () => {
    expect(canUsePro("starter")).toBe(false);
  });

  it("returns false for trial plan", () => {
    expect(canUsePro("trial")).toBe(false);
  });
});

describe("isPlan", () => {
  it.each(PLAN_VALUES)("accetta il valore valido %s", (plan) => {
    expect(isPlan(plan)).toBe(true);
  });

  it("rifiuta null", () => {
    expect(isPlan(null)).toBe(false);
  });

  it("rifiuta undefined", () => {
    expect(isPlan(undefined)).toBe(false);
  });

  it("rifiuta numeri", () => {
    expect(isPlan(42)).toBe(false);
  });

  it("rifiuta oggetti", () => {
    expect(isPlan({ plan: "pro" })).toBe(false);
  });

  it("rifiuta stringhe non-enum (es. 'premium')", () => {
    expect(isPlan("premium")).toBe(false);
  });

  it("è case-sensitive (rifiuta 'PRO')", () => {
    expect(isPlan("PRO")).toBe(false);
  });

  it("rifiuta i nomi del prototype chain", () => {
    expect(isPlan("__proto__")).toBe(false);
    expect(isPlan("constructor")).toBe(false);
    expect(isPlan("toString")).toBe(false);
    expect(isPlan("hasOwnProperty")).toBe(false);
  });
});

describe("isDeveloperPlan", () => {
  it("returns true for developer_indie", () => {
    expect(isDeveloperPlan("developer_indie")).toBe(true);
  });

  it("returns true for developer_business", () => {
    expect(isDeveloperPlan("developer_business")).toBe(true);
  });

  it("returns true for developer_scale", () => {
    expect(isDeveloperPlan("developer_scale")).toBe(true);
  });

  it("returns false for pro", () => {
    expect(isDeveloperPlan("pro")).toBe(false);
  });

  it("returns false for trial/starter/unlimited", () => {
    expect(isDeveloperPlan("trial")).toBe(false);
    expect(isDeveloperPlan("starter")).toBe(false);
    expect(isDeveloperPlan("unlimited")).toBe(false);
  });
});

describe("canUseApi", () => {
  it("returns true for pro", () => {
    expect(canUseApi("pro")).toBe(true);
  });

  it("returns true for unlimited", () => {
    expect(canUseApi("unlimited")).toBe(true);
  });

  it("returns true for all developer plans", () => {
    expect(canUseApi("developer_indie")).toBe(true);
    expect(canUseApi("developer_business")).toBe(true);
    expect(canUseApi("developer_scale")).toBe(true);
  });

  it("returns false for trial", () => {
    expect(canUseApi("trial")).toBe(false);
  });

  it("returns false for starter", () => {
    expect(canUseApi("starter")).toBe(false);
  });
});

describe("API_KEY_LIMITS / getApiKeyLimit", () => {
  it("Pro plan has a limit of 3 API keys", () => {
    expect(API_KEY_LIMITS.pro).toBe(3);
    expect(getApiKeyLimit("pro")).toBe(3);
  });

  it("Unlimited plan has no limit (null)", () => {
    expect(API_KEY_LIMITS.unlimited).toBeUndefined();
    expect(getApiKeyLimit("unlimited")).toBeNull();
  });

  it("Developer plans have no limit defined here (null) — enforced in Fase B", () => {
    expect(getApiKeyLimit("developer_indie")).toBeNull();
    expect(getApiKeyLimit("developer_business")).toBeNull();
    expect(getApiKeyLimit("developer_scale")).toBeNull();
  });

  it("Starter/trial cannot use API at all — no limit constant needed", () => {
    expect(API_KEY_LIMITS.starter).toBeUndefined();
    expect(API_KEY_LIMITS.trial).toBeUndefined();
  });
});

describe("DEVELOPER_MONTHLY_LIMITS", () => {
  it("has correct limits for each developer plan", () => {
    expect(DEVELOPER_MONTHLY_LIMITS.developer_indie).toBe(300);
    expect(DEVELOPER_MONTHLY_LIMITS.developer_business).toBe(1500);
    expect(DEVELOPER_MONTHLY_LIMITS.developer_scale).toBe(5000);
  });

  it("has no entry for non-developer plans", () => {
    expect(DEVELOPER_MONTHLY_LIMITS.pro).toBeUndefined();
    expect(DEVELOPER_MONTHLY_LIMITS.unlimited).toBeUndefined();
  });
});

describe("canAddCatalogItem", () => {
  it("allows trial plan with 0 items", () => {
    expect(canAddCatalogItem("trial", daysAgo(5), 0)).toBe(true);
  });

  it("allows trial plan with 4 items (below limit)", () => {
    expect(canAddCatalogItem("trial", daysAgo(5), 4)).toBe(true);
  });

  it("blocks trial plan with 5 items (at limit)", () => {
    expect(canAddCatalogItem("trial", daysAgo(5), 5)).toBe(false);
  });

  it("allows starter plan with 4 items", () => {
    expect(canAddCatalogItem("starter", null, 4)).toBe(true);
  });

  it("blocks starter plan with 5 items", () => {
    expect(canAddCatalogItem("starter", null, 5)).toBe(false);
  });

  it("allows pro plan with 100 items", () => {
    expect(canAddCatalogItem("pro", null, 100)).toBe(true);
  });

  it("allows unlimited plan with any number of items", () => {
    expect(canAddCatalogItem("unlimited", null, 999)).toBe(true);
  });

  it("blocks expired trial regardless of item count", () => {
    expect(canAddCatalogItem("trial", daysAgo(60), 0)).toBe(false);
  });

  it("allows developer plans with any number of items", () => {
    expect(canAddCatalogItem("developer_indie", null, 999)).toBe(true);
    expect(canAddCatalogItem("developer_business", null, 999)).toBe(true);
    expect(canAddCatalogItem("developer_scale", null, 999)).toBe(true);
  });
});

describe("getPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up the Drizzle select() chain
    mockGetDb.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ limit: mockLimit });
  });

  it("returns plan info when profile is found", async () => {
    const trialStartedAt = new Date("2026-01-01T00:00:00Z");
    mockLimit.mockResolvedValue([
      { plan: "trial", trialStartedAt, planExpiresAt: null },
    ]);

    const result = await getPlan("user-123");

    expect(result).toEqual({
      plan: "trial",
      trialStartedAt,
      planExpiresAt: null,
    });
  });

  it("returns starter plan info", async () => {
    const planExpiresAt = new Date("2026-12-31T00:00:00Z");
    mockLimit.mockResolvedValue([
      { plan: "starter", trialStartedAt: null, planExpiresAt },
    ]);

    const result = await getPlan("user-456");

    expect(result).toEqual({
      plan: "starter",
      trialStartedAt: null,
      planExpiresAt,
    });
  });

  it("throws ProfileNotFoundError when profile is not found", async () => {
    mockLimit.mockResolvedValue([]);

    await expect(getPlan("user-not-found")).rejects.toThrow(
      "Profilo non trovato",
    );
  });

  it("ProfileNotFoundError ha name === 'ProfileNotFoundError' (discriminante)", async () => {
    mockLimit.mockResolvedValue([]);
    try {
      await getPlan("user-not-found");
      // Se non lancia, fallisci il test esplicitamente.
      expect.fail("getPlan avrebbe dovuto lanciare ProfileNotFoundError");
    } catch (err) {
      expect((err as Error).name).toBe("ProfileNotFoundError");
    }
  });

  it("rifiuta valori di plan non riconosciuti (drift schema DB)", async () => {
    // DB row con plan corrotto/sconosciuto → fail-closed via
    // ProfileNotFoundError + log critical, NON cast cieco a Plan.
    mockLimit.mockResolvedValue([
      { plan: "premium", trialStartedAt: null, planExpiresAt: null },
    ]);
    await expect(getPlan("user-drift")).rejects.toThrow("Profilo non trovato");
  });
});

describe("assertProPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ limit: mockLimit });
  });

  it("returns 401 when authUserId is null", async () => {
    const result = await assertProPlan(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error).toContain("Non autenticato");
    }
  });

  it("returns 401 when authUserId is an empty string", async () => {
    const result = await assertProPlan("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
  });

  it("returns 403 when the profile does not exist (orphan auth user)", async () => {
    // Profilo orfano: utente autenticato ma profile row mancante. Va
    // discriminato da "non autenticato" (401) — il caller deve sapere
    // che serve intervento manuale, non un re-login.
    mockLimit.mockResolvedValue([]);
    const result = await assertProPlan("user-no-profile");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toContain("Profilo non disponibile");
    }
  });

  it("returns 503 on DB statement timeout", async () => {
    // Postgres `query_canceled` (57014) — DB sovraccarico. Restituire 401
    // sarebbe misleading per il client (il problema non è autenticativo).
    const timeoutErr = Object.assign(new Error("statement timeout"), {
      code: "57014",
    });
    mockLimit.mockRejectedValue(timeoutErr);
    const result = await assertProPlan("user-x");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.error).toContain("sovraccarico");
    }
  });

  it("rilancia errori imprevisti invece di trasformarli in 401", async () => {
    const unknownErr = new Error("network glitch");
    mockLimit.mockRejectedValue(unknownErr);
    await expect(assertProPlan("user-x")).rejects.toThrow("network glitch");
  });

  it("returns 403 for the starter plan", async () => {
    mockLimit.mockResolvedValue([
      { plan: "starter", trialStartedAt: null, planExpiresAt: null },
    ]);
    const result = await assertProPlan("user-starter");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toContain("Pro");
    }
  });

  it("returns 403 for the trial plan", async () => {
    mockLimit.mockResolvedValue([
      { plan: "trial", trialStartedAt: new Date(), planExpiresAt: null },
    ]);
    const result = await assertProPlan("user-trial");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it("returns 403 for developer plans (Pro feature gate is plan-Pro only)", async () => {
    mockLimit.mockResolvedValue([
      {
        plan: "developer_indie",
        trialStartedAt: null,
        planExpiresAt: null,
      },
    ]);
    const result = await assertProPlan("user-dev");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it("returns ok=true for pro plan", async () => {
    mockLimit.mockResolvedValue([
      { plan: "pro", trialStartedAt: null, planExpiresAt: null },
    ]);
    const result = await assertProPlan("user-pro");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan).toBe("pro");
    }
  });

  it("returns ok=true for unlimited plan", async () => {
    mockLimit.mockResolvedValue([
      { plan: "unlimited", trialStartedAt: null, planExpiresAt: null },
    ]);
    const result = await assertProPlan("user-unlimited");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan).toBe("unlimited");
    }
  });
});
