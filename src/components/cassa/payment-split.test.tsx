import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { formatCurrency } from "@/lib/utils";
import { PaymentSplit } from "./payment-split";

/**
 * Importo nella resa dell'app, con lo spazio unificatore che `Intl` mette
 * prima del simbolo convertito in spazio normale: Testing Library normalizza
 * il testo del DOM, quindi il matcher deve essere normalizzato allo stesso
 * modo o l'assert fallisce su un carattere invisibile.
 */
const euro = (value: number): string =>
  formatCurrency(value).replaceAll("\u00a0", " ");

function renderSplit(
  overrides: Partial<Parameters<typeof PaymentSplit>[0]> = {},
) {
  const onCashChange = vi.fn();
  const onClose = vi.fn();
  render(
    <PaymentSplit
      collectedCents={1000}
      cashCents={0}
      onCashChange={onCashChange}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onCashChange, onClose };
}

describe("PaymentSplit", () => {
  it("mostra le due quote, con l'elettronico come resto dell'incassato", () => {
    renderSplit({ cashCents: 250 });
    expect(screen.getByText(euro(2.5))).toBeInTheDocument();
    expect(screen.getByText(euro(7.5))).toBeInTheDocument();
  });

  it("dà tutto all'elettronico quando i contanti sono a zero", () => {
    // Non è un caso speciale: il documento è un pagamento singolo, e sia lo
    // schema sia la persistenza lo trattano come tale.
    renderSplit();
    expect(screen.getByText(euro(10))).toBeInTheDocument();
    expect(screen.getByText(euro(0))).toBeInTheDocument();
  });

  it("le due quote sommano sempre all'incassato, anche sui resti scomodi", () => {
    // È l'invariante che rende la quadratura AdE (HAR.md voce #5) vera per
    // costruzione: non esiste uno stato con un residuo da segnalare.
    renderSplit({ cashCents: 333 });
    expect(screen.getByText(euro(3.33))).toBeInTheDocument();
    expect(screen.getByText(euro(6.67))).toBeInTheDocument();
  });

  it("clampa la quota contanti all'incassato", () => {
    // Senza il clamp l'elettronico diventerebbe negativo, e la ripartizione
    // trasmetterebbe più di quanto il documento vale.
    const { onCashChange } = renderSplit({ collectedCents: 5 });
    fireEvent.click(screen.getByRole("button", { name: "9" }));
    expect(onCashChange).toHaveBeenLastCalledWith(5);
  });

  it("chiude la ripartizione dal bottone dedicato", () => {
    const { onClose } = renderSplit({ cashCents: 500 });
    fireEvent.click(
      screen.getByRole("button", { name: "Rimuovi pagamento misto" }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
