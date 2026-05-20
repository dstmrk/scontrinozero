import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock recharts: jsdom non implementa ResizeObserver/getBoundingClientRect
// con valori utili, e i grafici reali non sono il focus del test (la branch
// che ci interessa e' l'empty state pre-chart).
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

import { RevenueSparkline } from "@/components/analytics/revenue-sparkline";

describe("RevenueSparkline", () => {
  it("shows empty-state placeholder when data is empty", () => {
    render(<RevenueSparkline data={[]} />);

    expect(
      screen.getByText("Nessuno scontrino nel periodo selezionato."),
    ).toBeDefined();
    // Il chart non deve essere renderizzato sull'empty state.
    expect(screen.queryByTestId("line-chart")).toBeNull();
  });

  it("renders the chart when data has at least one point", () => {
    render(
      <RevenueSparkline
        data={[{ date: "2026-05-19", revenueCents: 12_345 }]}
      />,
    );

    expect(screen.getByTestId("line-chart")).toBeDefined();
    expect(
      screen.queryByText("Nessuno scontrino nel periodo selezionato."),
    ).toBeNull();
  });
});
