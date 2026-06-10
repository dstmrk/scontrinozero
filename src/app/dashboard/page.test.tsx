// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────

const {
  mockGetOnboardingStatus,
  mockGetAuthenticatedUser,
  mockGetPlan,
  mockGetCatalogItems,
  mockCanUseDashboardCashier,
  mockRedirect,
} = vi.hoisted(() => ({
  mockGetOnboardingStatus: vi.fn(),
  mockGetAuthenticatedUser: vi.fn(),
  mockGetPlan: vi.fn(),
  mockGetCatalogItems: vi.fn(),
  mockCanUseDashboardCashier: vi.fn(),
  mockRedirect: vi.fn((..._args: unknown[]) => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

vi.mock("@/server/onboarding-actions", () => ({
  getOnboardingStatus: (...args: unknown[]) => mockGetOnboardingStatus(...args),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: (...args: unknown[]) =>
    mockGetAuthenticatedUser(...args),
}));

vi.mock("@/lib/plans", () => ({
  getPlan: (...args: unknown[]) => mockGetPlan(...args),
  canUseDashboardCashier: (...args: unknown[]) =>
    mockCanUseDashboardCashier(...args),
}));

vi.mock("@/server/catalog-actions", () => ({
  getCatalogItems: (...args: unknown[]) => mockGetCatalogItems(...args),
}));

vi.mock("@/components/catalogo/catalogo-client", () => ({
  CatalogoClient: ({
    businessId,
  }: {
    readonly businessId: string;
    readonly initialData: unknown;
  }) => <div data-testid="catalogo-client" data-business-id={businessId} />,
}));

import DashboardPage from "./page";

const ITEMS = [{ id: "item-1", description: "Caffè" }];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOnboardingStatus.mockResolvedValue({ businessId: "biz-1" });
  mockGetAuthenticatedUser.mockResolvedValue({ id: "user-1" });
  mockGetPlan.mockResolvedValue({ plan: "starter" });
  mockGetCatalogItems.mockResolvedValue(ITEMS);
  mockCanUseDashboardCashier.mockReturnValue(true);
});

describe("DashboardPage", () => {
  it("redirects to /onboarding when there is no business", async () => {
    mockGetOnboardingStatus.mockResolvedValue({ businessId: null });

    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/onboarding");
    // Guard precede l'auth: non si tocca Supabase Auth se manca il business.
    expect(mockGetAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("redirects developer plans to settings#api-keys", async () => {
    mockCanUseDashboardCashier.mockReturnValue(false);

    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/dashboard/settings#api-keys");
  });

  it("renders the catalog and fetches plan + items in parallel", async () => {
    render(await DashboardPage());

    const client = screen.getByTestId("catalogo-client");
    expect(client).toHaveAttribute("data-business-id", "biz-1");

    // I due fetch indipendenti partono entrambi (Promise.all): plan via user.id,
    // catalogo via businessId.
    expect(mockGetPlan).toHaveBeenCalledWith("user-1");
    expect(mockGetCatalogItems).toHaveBeenCalledWith("biz-1");
  });

  it("keeps the guard order: onboarding status before authenticated user", async () => {
    const order: string[] = [];
    mockGetOnboardingStatus.mockImplementation(async () => {
      order.push("onboarding");
      return { businessId: "biz-1" };
    });
    mockGetAuthenticatedUser.mockImplementation(async () => {
      order.push("auth");
      return { id: "user-1" };
    });

    await DashboardPage();

    expect(order).toEqual(["onboarding", "auth"]);
  });
});
