// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks ---

const {
  mockGetOnboardingStatus,
  mockRedirect,
  mockGetAuthenticatedUser,
  mockGetPlan,
  mockGetDb,
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
} = vi.hoisted(() => ({
  mockGetOnboardingStatus: vi.fn(),
  mockRedirect: vi.fn(),
  mockGetAuthenticatedUser: vi.fn(),
  mockGetPlan: vi.fn(),
  mockGetDb: vi.fn(),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error(`__NEXT_REDIRECT__:${url}`);
  },
}));

vi.mock("@/server/onboarding-actions", () => ({
  getOnboardingStatus: mockGetOnboardingStatus,
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
}));

vi.mock("@/lib/plans", () => ({
  getPlan: mockGetPlan,
  canUseDashboardCashier: (plan: string) => !plan.startsWith("developer_"),
}));

vi.mock("@/db", () => ({ getDb: mockGetDb }));

vi.mock("@/db/schema", () => ({
  businesses: { id: "id", preferredVatCode: "preferred_vat_code" },
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

vi.mock("@/components/cassa/cassa-client", () => ({
  CassaClient: () => null,
}));

import CassaPage from "@/app/dashboard/cassa/page";

const BUSINESS_ID = "biz-test-uuid-1";

describe("CassaPage — gate developer plans", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOnboardingStatus.mockResolvedValue({ businessId: BUSINESS_ID });
    mockGetAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockGetPlan.mockResolvedValue({
      plan: "pro",
      trialStartedAt: null,
      planExpiresAt: null,
    });
    // SELECT chain con preferredVatCode opzionale
    mockLimit.mockResolvedValue([{ preferredVatCode: null }]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockGetDb.mockReturnValue({ select: mockSelect });
  });

  it("redirects to /onboarding when businessId is missing", async () => {
    mockGetOnboardingStatus.mockResolvedValue({ businessId: null });
    await CassaPage().catch(() => undefined);
    expect(mockRedirect).toHaveBeenCalledWith("/onboarding");
  });

  it("redirects to /dashboard/settings#api-keys per developer_indie", async () => {
    mockGetPlan.mockResolvedValue({
      plan: "developer_indie",
      trialStartedAt: null,
      planExpiresAt: null,
    });
    await CassaPage().catch(() => undefined);
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard/settings#api-keys");
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("non redirect per piano pro (no gate)", async () => {
    await CassaPage().catch(() => undefined);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
