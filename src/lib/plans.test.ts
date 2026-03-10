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
  STARTER_CATALOG_LIMIT,
  TRIAL_DAYS,
  canAddCatalogItem,
  canEmit,
  canUsePro,
  getPlan,
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
