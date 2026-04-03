// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks ---

const { mockGetOnboardingStatus, mockGetCatalogItems, mockRedirect } =
  vi.hoisted(() => ({
    mockGetOnboardingStatus: vi.fn(),
    mockGetCatalogItems: vi.fn(),
    mockRedirect: vi.fn(),
  }));

vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

vi.mock("@/server/onboarding-actions", () => ({
  getOnboardingStatus: mockGetOnboardingStatus,
}));

vi.mock("@/server/catalog-actions", () => ({
  getCatalogItems: mockGetCatalogItems,
}));

// CatalogoClient is a React component — mock it as a plain function returning null
// so the server component can return JSX without errors in the node environment.
vi.mock("@/components/catalogo/catalogo-client", () => ({
  CatalogoClient: () => null,
}));

import DashboardPage from "@/app/dashboard/page";

// ---------------------------------------------------------------------------

const BUSINESS_ID = "biz-test-uuid-1";

describe("DashboardPage — smart redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOnboardingStatus.mockResolvedValue({ businessId: BUSINESS_ID });
    // Default: catalog has items (happy path). Individual tests override as needed.
    mockGetCatalogItems.mockResolvedValue([{ id: "item-default" }]);
  });

  it("redirects to /onboarding when businessId is missing", async () => {
    mockGetOnboardingStatus.mockResolvedValue({ businessId: null });
    await DashboardPage();
    expect(mockRedirect).toHaveBeenCalledWith("/onboarding");
  });

  it("renders CatalogoClient when catalog has items (no redirect)", async () => {
    mockGetCatalogItems.mockResolvedValue([
      {
        id: "item-uuid-1",
        businessId: BUSINESS_ID,
        description: "Caffè",
        defaultPrice: "1.00",
        defaultVatCode: "N4",
        createdAt: new Date(),
      },
    ]);
    await DashboardPage();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("renders CatalogoClient even when catalog is empty (no redirect)", async () => {
    mockGetCatalogItems.mockResolvedValue([]);
    await DashboardPage();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("passes businessId to getCatalogItems", async () => {
    mockGetCatalogItems.mockResolvedValue([{ id: "item-1" }]);
    await DashboardPage();
    expect(mockGetCatalogItems).toHaveBeenCalledWith(BUSINESS_ID);
  });
});
