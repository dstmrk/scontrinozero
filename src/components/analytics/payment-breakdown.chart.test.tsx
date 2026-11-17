// Dati e colori passati a recharts (mockato). Empty state e accessibilità,
// con recharts reale, stanno in payment-breakdown.test.tsx.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock recharts: jsdom non implementa ResizeObserver/getBoundingClientRect
// con valori utili, e il chart SVG non e' il focus del test. Esponiamo i
// dati passati a BarChart via data-prop per asserire il mapping label.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({
    children,
    data,
  }: {
    children: React.ReactNode;
    data: unknown;
  }) => (
    <div data-testid="bar-chart" data-chart={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Bar: ({ fill }: { fill?: string }) => (
    <div data-testid="bar" data-fill={fill} />
  ),
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

import { PaymentBreakdown } from "@/components/analytics/payment-breakdown";

function readChartData(): Array<{
  method: string;
  revenue: number;
  count: number;
}> {
  const chart = screen.getByTestId("bar-chart");
  const raw = chart.getAttribute("data-chart");
  if (!raw) throw new Error("data-chart attribute missing");
  return JSON.parse(raw) as Array<{
    method: string;
    revenue: number;
    count: number;
  }>;
}

describe("PaymentBreakdown", () => {
  it("maps PC to 'Contanti' and PE to 'Elettronico'", () => {
    render(
      <PaymentBreakdown
        data={[
          { method: "PC", count: 3, revenueCents: 1500 },
          { method: "PE", count: 2, revenueCents: 800 },
        ]}
      />,
    );

    const chartData = readChartData();
    const byMethod = Object.fromEntries(chartData.map((e) => [e.method, e]));
    expect(byMethod["Contanti"]).toEqual({
      method: "Contanti",
      revenue: 15,
      count: 3,
    });
    expect(byMethod["Elettronico"]).toEqual({
      method: "Elettronico",
      revenue: 8,
      count: 2,
    });
  });

  it("maps the 'other' bucket label to 'Altro'", () => {
    render(
      <PaymentBreakdown
        data={[{ method: "other", count: 1, revenueCents: 999 }]}
      />,
    );

    const chartData = readChartData();
    expect(chartData).toHaveLength(1);
    expect(chartData[0].method).toBe("Altro");
    expect(chartData[0].revenue).toBeCloseTo(9.99, 2);
  });

  it("passes a valid CSS color to the Bar fill (no hsl()-wrapped oklch token)", () => {
    // Regressione: `hsl(var(--primary))` produceva `hsl(oklch(...))` invalido
    // con Tailwind v4 (--primary è un oklch), rendendo le barre trasparenti.
    render(
      <PaymentBreakdown
        data={[{ method: "PC", count: 1, revenueCents: 100 }]}
      />,
    );

    const fill = screen.getByTestId("bar").getAttribute("data-fill") ?? "";
    expect(fill).not.toMatch(/^hsl\(\s*var\(/);
    expect(fill).toBe("var(--primary)");
  });
});
