import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnalyticsClient } from "./analytics-client";
import type {
  AnalyticsKpis,
  PaymentBreakdownEntry,
  RevenuePoint,
} from "@/server/analytics-actions";

const mockGetAnalyticsKpis = vi.fn();
const mockGetRevenueTimeseries = vi.fn();
const mockGetPaymentBreakdown = vi.fn();

vi.mock("@/server/analytics-actions", () => ({
  getAnalyticsKpis: (...args: unknown[]) => mockGetAnalyticsKpis(...args),
  getRevenueTimeseries: (...args: unknown[]) =>
    mockGetRevenueTimeseries(...args),
  getPaymentBreakdown: (...args: unknown[]) => mockGetPaymentBreakdown(...args),
}));

// Stub Radix UI Select per evitare di gestire portals/scrollIntoView nei test.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode;
    onValueChange: (v: string) => void;
  }) => (
    <div>
      {children}
      <button
        data-testid="range-7d"
        onClick={() => onValueChange("7d")}
        type="button"
      />
      <button
        data-testid="range-30d"
        onClick={() => onValueChange("30d")}
        type="button"
      />
      <button
        data-testid="range-ytd"
        onClick={() => onValueChange("ytd")}
        type="button"
      />
      <button
        data-testid="range-invalid"
        onClick={() => onValueChange("bogus")}
        type="button"
      />
    </div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
}));

vi.mock("./kpi-cards", () => ({
  KpiCards: ({ kpis }: { kpis: AnalyticsKpis }) => (
    <div data-testid="kpis">revenueCents={kpis.revenueCents}</div>
  ),
}));

// Recharts non si comporta bene in jsdom; stub per evitare ResizeObserver.
vi.mock("./revenue-sparkline", () => ({
  RevenueSparkline: ({ data }: { data: RevenuePoint[] }) => (
    <div data-testid="sparkline">{data.length} points</div>
  ),
}));
vi.mock("./payment-breakdown", () => ({
  PaymentBreakdown: ({ data }: { data: PaymentBreakdownEntry[] }) => (
    <div data-testid="breakdown">{data.length} methods</div>
  ),
}));

const INITIAL_KPIS: AnalyticsKpis = {
  revenueCents: 100,
  count: 1,
  aovCents: 100,
  voidCount: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AnalyticsClient handleRangeChange", () => {
  it("scarta il risultato del range precedente se l'utente cambia range velocemente (race condition)", async () => {
    // Prima chiamata (7d): risolve LENTAMENTE con 7777 cents
    // Seconda chiamata (30d): risolve VELOCEMENTE con 3030 cents
    // Senza guard, il setKpis del 7d sovrascriverebbe quello del 30d.
    let resolveSlow!: (v: AnalyticsKpis) => void;
    const slowKpis = new Promise<AnalyticsKpis>((r) => {
      resolveSlow = r;
    });
    mockGetAnalyticsKpis.mockImplementationOnce(() => slowKpis);
    mockGetRevenueTimeseries.mockImplementationOnce(() => Promise.resolve([]));
    mockGetPaymentBreakdown.mockImplementationOnce(() => Promise.resolve([]));

    const fastKpis: AnalyticsKpis = {
      revenueCents: 3030,
      count: 5,
      aovCents: 606,
      voidCount: 0,
    };
    mockGetAnalyticsKpis.mockImplementationOnce(() =>
      Promise.resolve(fastKpis),
    );
    mockGetRevenueTimeseries.mockImplementationOnce(() => Promise.resolve([]));
    mockGetPaymentBreakdown.mockImplementationOnce(() => Promise.resolve([]));

    render(
      <AnalyticsClient
        businessId="biz-1"
        initialRange="7d"
        initialKpis={INITIAL_KPIS}
        initialTimeseries={[]}
        initialBreakdown={[]}
      />,
    );

    // Cambio a 7d (slow), poi subito a 30d (fast).
    fireEvent.click(screen.getByTestId("range-7d"));
    fireEvent.click(screen.getByTestId("range-30d"));

    await waitFor(() => {
      expect(mockGetAnalyticsKpis).toHaveBeenCalledTimes(2);
    });

    // La fast (30d) risolve → setKpis(3030)
    await waitFor(() => {
      expect(screen.getByTestId("kpis").textContent).toContain(
        "revenueCents=3030",
      );
    });

    // Ora la slow (7d) risolve in ritardo: NON deve sovrascrivere lo state.
    resolveSlow({
      revenueCents: 7777,
      count: 10,
      aovCents: 778,
      voidCount: 0,
    });

    // Lascia che il microtask della slow completi.
    await new Promise((r) => setTimeout(r, 10));

    // Lo state deve essere ancora quello del 30d (fast), non quello del 7d.
    expect(screen.getByTestId("kpis").textContent).toContain(
      "revenueCents=3030",
    );
    expect(screen.getByTestId("kpis").textContent).not.toContain("7777");
  });

  it("invoca le server actions con range 'ytd' quando l'utente seleziona Da inizio anno", async () => {
    const ytdKpis: AnalyticsKpis = {
      revenueCents: 12345,
      count: 7,
      aovCents: 1763,
      voidCount: 0,
    };
    mockGetAnalyticsKpis.mockResolvedValueOnce(ytdKpis);
    mockGetRevenueTimeseries.mockResolvedValueOnce([]);
    mockGetPaymentBreakdown.mockResolvedValueOnce([]);

    render(
      <AnalyticsClient
        businessId="biz-1"
        initialRange="30d"
        initialKpis={INITIAL_KPIS}
        initialTimeseries={[]}
        initialBreakdown={[]}
      />,
    );

    fireEvent.click(screen.getByTestId("range-ytd"));

    await waitFor(() => {
      expect(mockGetAnalyticsKpis).toHaveBeenCalledWith("biz-1", "ytd");
    });
    expect(mockGetRevenueTimeseries).toHaveBeenCalledWith("biz-1", "ytd");
    expect(mockGetPaymentBreakdown).toHaveBeenCalledWith("biz-1", "ytd");

    await waitFor(() => {
      expect(screen.getByTestId("kpis").textContent).toContain(
        "revenueCents=12345",
      );
    });
  });

  it("ignora valori non validi senza invocare le server actions", () => {
    render(
      <AnalyticsClient
        businessId="biz-1"
        initialRange="30d"
        initialKpis={INITIAL_KPIS}
        initialTimeseries={[]}
        initialBreakdown={[]}
      />,
    );

    fireEvent.click(screen.getByTestId("range-invalid"));

    expect(mockGetAnalyticsKpis).not.toHaveBeenCalled();
    expect(mockGetRevenueTimeseries).not.toHaveBeenCalled();
    expect(mockGetPaymentBreakdown).not.toHaveBeenCalled();
  });
});
