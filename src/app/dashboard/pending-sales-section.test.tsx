// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetOnboardingStatus, mockListStalePendingSales } = vi.hoisted(
  () => ({
    mockGetOnboardingStatus: vi.fn(),
    mockListStalePendingSales: vi.fn(),
  }),
);

vi.mock("@/server/onboarding-actions", () => ({
  getOnboardingStatus: mockGetOnboardingStatus,
}));

vi.mock("@/lib/services/pending-verification", () => ({
  listStalePendingSales: mockListStalePendingSales,
}));

vi.mock("@/components/dashboard/pending-sales-banner", () => ({
  PendingSalesBanner: ({ businessId }: { businessId: string }) => (
    <div data-testid="banner">{businessId}</div>
  ),
}));

import { PendingSalesSection } from "./pending-sales-section";

const BIZ = "biz-uuid";

describe("PendingSalesSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOnboardingStatus.mockResolvedValue({ businessId: BIZ });
  });

  it("rende il banner quando ci sono scontrini in sospeso", async () => {
    mockListStalePendingSales.mockResolvedValue([
      { id: "doc-1", createdAt: "2026-09-10T09:00:00.000Z", totalCents: 1250 },
    ]);

    render(await PendingSalesSection());

    expect(screen.getByTestId("banner")).toHaveTextContent(BIZ);
  });

  it("non rende nulla quando non c'è niente in sospeso", async () => {
    mockListStalePendingSales.mockResolvedValue([]);

    const { container } = render(await PendingSalesSection());

    expect(container).toBeEmptyDOMElement();
  });

  it("non interroga il DB senza un business", async () => {
    mockGetOnboardingStatus.mockResolvedValue({ businessId: null });

    const { container } = render(await PendingSalesSection());

    expect(container).toBeEmptyDOMElement();
    expect(mockListStalePendingSales).not.toHaveBeenCalled();
  });
});
