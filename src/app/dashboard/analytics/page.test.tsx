// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────

const {
  mockGetOnboardingStatus,
  mockGetAuthenticatedUser,
  mockGetPlan,
  mockGetStarterKpis,
  mockGetAnalyticsBundle,
  mockRedirect,
} = vi.hoisted(() => ({
  mockGetOnboardingStatus: vi.fn(),
  mockGetAuthenticatedUser: vi.fn(),
  mockGetPlan: vi.fn(),
  mockGetStarterKpis: vi.fn(),
  mockGetAnalyticsBundle: vi.fn(),
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
}));

vi.mock("@/server/analytics-actions", () => ({
  getStarterKpis: (...args: unknown[]) => mockGetStarterKpis(...args),
  getAnalyticsBundle: (...args: unknown[]) => mockGetAnalyticsBundle(...args),
}));

// AnalyticsClient importa recharts dinamicamente: mockarlo evita di caricarlo
// nei test del ramo Pro e fornisce un marker semplice da asserire.
vi.mock("@/components/analytics/analytics-client", () => ({
  AnalyticsClient: () => <div data-testid="analytics-client" />,
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import AnalyticsPage from "./page";

const KPIS = { revenueCents: 12345, count: 7, aovCents: 1763, voidCount: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOnboardingStatus.mockResolvedValue({ businessId: "biz-1" });
  mockGetAuthenticatedUser.mockResolvedValue({ id: "user-1" });
});

describe("AnalyticsPage — base view (Starter/Trial)", () => {
  it("renders KPI cards and the combined Pro upsell card, without AnalyticsClient", async () => {
    mockGetPlan.mockResolvedValue({ plan: "starter" });
    mockGetStarterKpis.mockResolvedValue({ kpis: KPIS });

    render(await AnalyticsPage());

    // KPI labels (4 card) presenti
    expect(screen.getByText("Ricavi")).toBeInTheDocument();
    expect(screen.getByText("Scontrini emessi")).toBeInTheDocument();
    // Card upsell combinata unica
    expect(screen.getByText("Grafici avanzati · Pro")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Passa a Pro/i }),
    ).toBeInTheDocument();
    // Nessun grafico/AnalyticsClient nel ramo base
    expect(screen.queryByTestId("analytics-client")).not.toBeInTheDocument();
    // Solo i KPI base: niente bundle Pro
    expect(mockGetAnalyticsBundle).not.toHaveBeenCalled();
    expect(mockGetStarterKpis).toHaveBeenCalledWith("biz-1");
  });

  it("applies to Trial users (same base view)", async () => {
    mockGetPlan.mockResolvedValue({ plan: "trial" });
    mockGetStarterKpis.mockResolvedValue({ kpis: KPIS });

    render(await AnalyticsPage());

    expect(screen.getByText("Grafici avanzati · Pro")).toBeInTheDocument();
    expect(screen.queryByTestId("analytics-client")).not.toBeInTheDocument();
  });

  it("shows an inline error and zero KPIs when getStarterKpis fails", async () => {
    mockGetPlan.mockResolvedValue({ plan: "starter" });
    mockGetStarterKpis.mockResolvedValue({ error: "boom" });

    render(await AnalyticsPage());

    expect(screen.getByRole("alert")).toBeInTheDocument();
    // KPI azzerati → placeholder "—" per ricavi/conteggio
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("AnalyticsPage — Pro view", () => {
  it("renders the full AnalyticsClient for Pro and fetches the bundle", async () => {
    mockGetPlan.mockResolvedValue({ plan: "pro" });
    mockGetAnalyticsBundle.mockResolvedValue({
      kpis: KPIS,
      timeseries: [],
      breakdown: [],
      productBreakdown: [],
    });

    render(await AnalyticsPage());

    expect(screen.getByTestId("analytics-client")).toBeInTheDocument();
    expect(mockGetStarterKpis).not.toHaveBeenCalled();
    expect(mockGetAnalyticsBundle).toHaveBeenCalledWith("biz-1", "30d");
  });
});
