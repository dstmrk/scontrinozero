import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductBreakdown } from "./product-breakdown";

// Recharts non si comporta bene in jsdom (no ResizeObserver, niente layout).
// I componenti grafico esistenti (PaymentBreakdown, RevenueSparkline) non
// hanno test diretti per la stessa ragione: vengono stubbati nei test del
// container. Qui copriamo solo l'early-return dell'empty state, che non
// passa da recharts e quindi e' deterministico.

describe("ProductBreakdown", () => {
  it("renders the empty state when data is empty", () => {
    render(<ProductBreakdown data={[]} />);
    expect(
      screen.getByText(/nessun prodotto venduto nel periodo selezionato/i),
    ).toBeInTheDocument();
  });

  it("does not render the empty state when at least one entry is present", () => {
    render(
      <ProductBreakdown
        data={[{ description: "Caffè", revenueCents: 500, count: 5 }]}
      />,
    );
    expect(
      screen.queryByText(/nessun prodotto venduto nel periodo selezionato/i),
    ).not.toBeInTheDocument();
  });

  it("L4: exposes an accessible name for screen readers", () => {
    render(
      <ProductBreakdown
        data={[{ description: "Caffè", revenueCents: 500, count: 5 }]}
      />,
    );
    expect(
      screen.getByRole("img", { name: /grafico ricavi per prodotto/i }),
    ).toBeInTheDocument();
  });

  it("L4: wires the sr-only summary via aria-describedby so screen readers actually announce it", () => {
    // role="img" rende i discendenti non navigabili: per essere annunciato
    // il summary deve essere referenziato esplicitamente via aria-describedby.
    render(
      <ProductBreakdown
        data={[
          { description: "Caffè", revenueCents: 500, count: 5 },
          { description: "Cornetto", revenueCents: 300, count: 2 },
        ]}
      />,
    );
    const region = screen.getByRole("img", {
      name: /grafico ricavi per prodotto/i,
    });
    const describedBy = region.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const summary = document.getElementById(describedBy!);
    expect(summary).not.toBeNull();
    expect(summary?.textContent).toContain("Caffè");
    expect(summary?.textContent).toContain("Cornetto");
  });
});
