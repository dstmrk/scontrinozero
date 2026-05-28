import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RevenueSparkline } from "./revenue-sparkline";

// Recharts non si comporta bene in jsdom: testiamo solo empty state e
// accessibilità del container.

describe("RevenueSparkline", () => {
  it("renders the empty state when data is empty", () => {
    render(<RevenueSparkline data={[]} />);
    expect(
      screen.getByText(/nessuno scontrino nel periodo selezionato/i),
    ).toBeInTheDocument();
  });

  it("L4: exposes an accessible name for screen readers", () => {
    render(
      <RevenueSparkline data={[{ date: "2026-05-19", revenueCents: 500 }]} />,
    );
    expect(
      screen.getByRole("img", { name: /grafico ricavi giornalieri/i }),
    ).toBeInTheDocument();
  });
});
