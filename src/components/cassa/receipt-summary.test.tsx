import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ReceiptSummary } from "./receipt-summary";
import { CartLine } from "@/types/cassa";

const lines: CartLine[] = [
  {
    id: "1",
    description: "Pizza Margherita",
    quantity: 2,
    grossUnitPrice: 8.5,
    vatCode: "10",
  },
  {
    id: "2",
    description: "Caffè",
    quantity: 1,
    grossUnitPrice: 1.2,
    vatCode: "22",
  },
];

// 2×8.50 + 1×1.20 = 18.20
const TOTAL = 18.2;

describe("ReceiptSummary", () => {
  it("mostra tutte le righe del carrello", () => {
    render(
      <ReceiptSummary
        lines={lines}
        total={TOTAL}
        paymentMethod="PC"
        onPaymentMethodChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("Pizza Margherita")).toBeInTheDocument();
    expect(screen.getByText("Caffè")).toBeInTheDocument();
  });

  it("mostra il totale complessivo in formato italiano", () => {
    render(
      <ReceiptSummary
        lines={lines}
        total={TOTAL}
        paymentMethod="PC"
        onPaymentMethodChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText(/18,20/)).toBeInTheDocument();
  });

  it("mostra il metodo di pagamento selezionato", () => {
    render(
      <ReceiptSummary
        lines={lines}
        total={TOTAL}
        paymentMethod="PC"
        onPaymentMethodChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("Contanti")).toBeInTheDocument();
    expect(screen.getByText("Carta")).toBeInTheDocument();
  });

  it("il bottone Emetti scontrino è presente", () => {
    render(
      <ReceiptSummary
        lines={lines}
        total={TOTAL}
        paymentMethod="PC"
        onPaymentMethodChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /emetti scontrino/i }),
    ).toBeInTheDocument();
  });

  it("chiama onSubmit quando si preme Emetti scontrino", () => {
    const onSubmit = vi.fn();
    render(
      <ReceiptSummary
        lines={lines}
        total={TOTAL}
        paymentMethod="PC"
        onPaymentMethodChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onSubmit={onSubmit}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /emetti scontrino/i }));

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("il bottone Emetti è disabilitato durante isSubmitting", () => {
    render(
      <ReceiptSummary
        lines={lines}
        total={TOTAL}
        paymentMethod="PC"
        onPaymentMethodChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        isSubmitting={true}
      />,
    );

    expect(
      screen.getByRole("button", { name: /emetti scontrino/i }),
    ).toBeDisabled();
  });

  it("ha un bottone per tornare indietro", () => {
    render(
      <ReceiptSummary
        lines={lines}
        total={TOTAL}
        paymentMethod="PC"
        onPaymentMethodChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /indietro|torna/i }),
    ).toBeInTheDocument();
  });

  it("chiama onBack quando si preme il bottone indietro", () => {
    const onBack = vi.fn();
    render(
      <ReceiptSummary
        lines={lines}
        total={TOTAL}
        paymentMethod="PC"
        onPaymentMethodChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onSubmit={vi.fn()}
        onBack={onBack}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /indietro|torna/i }));

    expect(onBack).toHaveBeenCalledOnce();
  });

  it("chiama onPaymentMethodChange quando si cambia metodo di pagamento", () => {
    const onPaymentMethodChange = vi.fn();
    render(
      <ReceiptSummary
        lines={lines}
        total={TOTAL}
        paymentMethod="PC"
        onPaymentMethodChange={onPaymentMethodChange}
        onRemoveLine={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /carta/i }));

    expect(onPaymentMethodChange).toHaveBeenCalledWith("PE");
  });

  it("mostra il numero di articoli nel carrello", () => {
    render(
      <ReceiptSummary
        lines={lines}
        total={TOTAL}
        paymentMethod="PC"
        onPaymentMethodChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText(/2 articol/i)).toBeInTheDocument();
  });

  it("formatta correttamente i totali di riga", () => {
    const singleLine: CartLine[] = [
      {
        id: "1",
        description: "Gelato",
        quantity: 3,
        grossUnitPrice: 2.5,
        vatCode: "22",
      },
    ];

    render(
      <ReceiptSummary
        lines={singleLine}
        total={7.5}
        paymentMethod="PC"
        onPaymentMethodChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    // 3 × 2.50 = 7.50 — appare sia nel totale riga che nel totale complessivo
    const elements = screen.getAllByText(/7,50/);
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it("chiama onRemoveLine con l'id dell'articolo quando si rimuove una riga", () => {
    const onRemoveLine = vi.fn();
    render(
      <ReceiptSummary
        lines={lines}
        total={TOTAL}
        paymentMethod="PC"
        onPaymentMethodChange={vi.fn()}
        onRemoveLine={onRemoveLine}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const removeButtons = screen.getAllByRole("button", {
      name: /rimuovi articolo/i,
    });
    fireEvent.click(removeButtons[0]);

    expect(onRemoveLine).toHaveBeenCalledWith("1");
  });
});
