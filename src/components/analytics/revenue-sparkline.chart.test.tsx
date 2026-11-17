// Dati e colori passati a recharts (mockato). Empty state e accessibilità,
// con recharts reale, stanno in revenue-sparkline.test.tsx.
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
  Line: ({ stroke }: { stroke?: string }) => (
    <div data-testid="line" data-stroke={stroke} />
  ),
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

import { RevenueSparkline } from "@/components/analytics/revenue-sparkline";

describe("RevenueSparkline", () => {
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

  it("passes a valid CSS color to the Line stroke (no hsl()-wrapped oklch token)", () => {
    // Regressione: `hsl(var(--primary))` produceva `hsl(oklch(...))` invalido
    // con Tailwind v4 (--primary è un oklch), rendendo la linea trasparente.
    render(
      <RevenueSparkline
        data={[{ date: "2026-05-19", revenueCents: 12_345 }]}
      />,
    );

    const stroke = screen.getByTestId("line").getAttribute("data-stroke") ?? "";
    expect(stroke).not.toMatch(/^hsl\(\s*var\(/);
    expect(stroke).toBe("var(--primary)");
  });
});
