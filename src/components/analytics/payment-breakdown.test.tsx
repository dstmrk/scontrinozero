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

  it("L4: wires the sr-only summary via aria-describedby (Contanti/Elettronico labels)", () => {
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
    const describedBy = region.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const summary = document.getElementById(describedBy!);
    expect(summary).not.toBeNull();
    // METHOD_LABELS mappa PC → Contanti, PE → Elettronico.
    expect(summary?.textContent).toContain("Contanti");
    expect(summary?.textContent).toContain("Elettronico");
  });

  it("etichetta come Altro un metodo fuori da PAYMENT_METHOD_LABELS", () => {
    // `other` è l'unico bucket che non arriva dal selettore di cassa: lo
    // produce normalizePaymentMethod su un valore non riconosciuto.
    render(
      <PaymentBreakdown
        data={[{ method: "other", revenueCents: 100, count: 1 }]}
      />,
    );
    const region = screen.getByRole("img", {
      name: /grafico metodi di pagamento/i,
    });
    const summary = document.getElementById(
      region.getAttribute("aria-describedby")!,
    );
    expect(summary?.textContent).toContain("Altro");
  });
});
