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
  STARTER_CATALOG_LIMIT,
  TRIAL_DAYS,
  canAddCatalogItem,
  canEmit,
  canUseApi,
  canUsePro,
  getApiKeyLimit,
  getPlan,
  isDeveloperPlan,
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

  it("throws when profile is not found", async () => {
    mockLimit.mockResolvedValue([]);

    await expect(getPlan("user-not-found")).rejects.toThrow(
      "Profilo non trovato",
    );
  });
});
