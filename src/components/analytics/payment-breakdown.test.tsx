import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PaymentBreakdown } from "./payment-breakdown";

// Recharts non si comporta bene in jsdom (no ResizeObserver, niente layout):
// qui testiamo solo gli aspetti che non dipendono dal rendering del grafico —
// l'empty state e l'accessible name del container.

describe("PaymentBreakdown", () => {
  it("renders the empty state when data is empty", () => {
    render(<PaymentBreakdown data={[]} />);
    expect(
      screen.getByText(/nessuno scontrino nel periodo selezionato/i),
    ).toBeInTheDocument();
  });

  it("L4: exposes an accessible name for screen readers", () => {
    render(
      <PaymentBreakdown
        data={[{ method: "PC", revenueCents: 500, count: 5 }]}
      />,
    );
    expect(
      screen.getByRole("img", { name: /grafico metodi di pagamento/i }),
    ).toBeInTheDocument();
  });

  it("L4: includes a sr-only summary of the data points", () => {
    render(
      <PaymentBreakdown
        data={[
          { method: "PC", revenueCents: 500, count: 5 },
          { method: "PE", revenueCents: 300, count: 2 },
        ]}
      />,
    );
    const region = screen.getByRole("img", {
      name: /grafico metodi di pagamento/i,
    });
    // METHOD_LABELS mappa PC → Contanti, PE → Elettronico.
    expect(region.textContent).toContain("Contanti");
    expect(region.textContent).toContain("Elettronico");
  });
});
