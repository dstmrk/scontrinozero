import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnalyticsClient } from "./analytics-client";
import type {
  AnalyticsBundle,
  AnalyticsKpis,
  PaymentBreakdownEntry,
  ProductBreakdownEntry,
  RevenuePoint,
} from "@/server/analytics-actions";

const mockGetAnalyticsBundle = vi.fn();

vi.mock("@/server/analytics-actions", () => ({
  getAnalyticsBundle: (...args: unknown[]) => mockGetAnalyticsBundle(...args),
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
vi.mock("./product-breakdown", () => ({
  ProductBreakdown: ({ data }: { data: ProductBreakdownEntry[] }) => (
    <div data-testid="product-breakdown">{data.length} products</div>
  ),
}));

const INITIAL_KPIS: AnalyticsKpis = {
  revenueCents: 100,
  count: 1,
  aovCents: 100,
  voidCount: 0,
};

function makeBundle(kpis: AnalyticsKpis): AnalyticsBundle {
  return {
    kpis,
    timeseries: [],
    breakdown: [],
    productBreakdown: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AnalyticsClient handleRangeChange", () => {
  it("scarta il risultato del range precedente se l'utente cambia range velocemente (race condition)", async () => {
    // Prima chiamata (7d): risolve LENTAMENTE con bundle.kpis.revenueCents=7777
    // Seconda chiamata (30d): risolve VELOCEMENTE con bundle.kpis.revenueCents=3030
    // Senza guard, il setKpis del 7d sovrascriverebbe quello del 30d.
    let resolveSlow!: (v: AnalyticsBundle) => void;
    const slowBundle = new Promise<AnalyticsBundle>((r) => {
      resolveSlow = r;
    });
    mockGetAnalyticsBundle.mockImplementationOnce(() => slowBundle);

    const fastBundle: AnalyticsBundle = makeBundle({
      revenueCents: 3030,
      count: 5,
      aovCents: 606,
      voidCount: 0,
    });
    mockGetAnalyticsBundle.mockImplementationOnce(() =>
      Promise.resolve(fastBundle),
    );

    render(
      <AnalyticsClient
        businessId="biz-1"
        initialRange="7d"
        initialKpis={INITIAL_KPIS}
        initialTimeseries={[]}
        initialBreakdown={[]}
        initialProductBreakdown={[]}
      />,
    );

    // Cambio a 7d (slow), poi subito a 30d (fast).
    fireEvent.click(screen.getByTestId("range-7d"));
    fireEvent.click(screen.getByTestId("range-30d"));

    await waitFor(() => {
      expect(mockGetAnalyticsBundle).toHaveBeenCalledTimes(2);
    });

    // La fast (30d) risolve → setKpis(3030)
    await waitFor(() => {
      expect(screen.getByTestId("kpis").textContent).toContain(
        "revenueCents=3030",
      );
    });

    // Ora la slow (7d) risolve in ritardo: NON deve sovrascrivere lo state.
    resolveSlow(
      makeBundle({
        revenueCents: 7777,
        count: 10,
        aovCents: 778,
        voidCount: 0,
      }),
    );

    // Lascia che il microtask della slow completi.
    await new Promise((r) => setTimeout(r, 10));

    // Lo state deve essere ancora quello del 30d (fast), non quello del 7d.
    expect(screen.getByTestId("kpis").textContent).toContain(
      "revenueCents=3030",
    );
    expect(screen.getByTestId("kpis").textContent).not.toContain("7777");
  });

  it("invoca la server action con range 'ytd' quando l'utente seleziona Da inizio anno", async () => {
    const ytdBundle: AnalyticsBundle = makeBundle({
      revenueCents: 12345,
      count: 7,
      aovCents: 1763,
      voidCount: 0,
    });
    mockGetAnalyticsBundle.mockResolvedValueOnce(ytdBundle);

    render(
      <AnalyticsClient
        businessId="biz-1"
        initialRange="30d"
        initialKpis={INITIAL_KPIS}
        initialTimeseries={[]}
        initialBreakdown={[]}
        initialProductBreakdown={[]}
      />,
    );

    fireEvent.click(screen.getByTestId("range-ytd"));

    await waitFor(() => {
      expect(mockGetAnalyticsBundle).toHaveBeenCalledWith("biz-1", "ytd");
    });
    // H1: una sola call al server, non quattro.
    expect(mockGetAnalyticsBundle).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.getByTestId("kpis").textContent).toContain(
        "revenueCents=12345",
      );
    });
  });

  it("ignora valori non validi senza invocare la server action", () => {
    render(
      <AnalyticsClient
        businessId="biz-1"
        initialRange="30d"
        initialKpis={INITIAL_KPIS}
        initialTimeseries={[]}
        initialBreakdown={[]}
        initialProductBreakdown={[]}
      />,
    );

    fireEvent.click(screen.getByTestId("range-invalid"));

    expect(mockGetAnalyticsBundle).not.toHaveBeenCalled();
  });

  it("mostra il banner di errore quando il bundle ritorna { error }", async () => {
    mockGetAnalyticsBundle.mockResolvedValueOnce({ error: "Boom" });

    render(
      <AnalyticsClient
        businessId="biz-1"
        initialRange="30d"
        initialKpis={INITIAL_KPIS}
        initialTimeseries={[]}
        initialBreakdown={[]}
        initialProductBreakdown={[]}
      />,
    );

    fireEvent.click(screen.getByTestId("range-7d"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    // KPI azzerati sul fail (no carry-over del range precedente).
    expect(screen.getByTestId("kpis").textContent).toContain("revenueCents=0");
  });
});
