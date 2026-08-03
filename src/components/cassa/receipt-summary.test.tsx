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

// 2×8.50 + 1×1.20 = 18.20 → 1820 cents (canone per-riga, regola 17)
const TOTAL_CENTS = 1820;

describe("ReceiptSummary", () => {
  it("mostra tutte le righe del carrello", () => {
    render(
      <ReceiptSummary
        lines={lines}
        totalCents={TOTAL_CENTS}
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
        totalCents={TOTAL_CENTS}
        paymentMethod="PC"
        onPaymentMethodChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText(/18,20/)).toBeInTheDocument();
  });

  it("deriva l'importo mostrato dai centesimi, non da una somma float", () => {
    // 3 righe da 1.15 × 0.35 → 40 cents ciascuna = 120 cents. La somma float
    // valeva 1.2074999999999998 e sarebbe stata mostrata come €1,21, cioè un
    // centesimo in più di quanto viene trasmesso all'AdE (REVIEW.md #76).
    const fractional: CartLine[] = [
      {
        id: "1",
        description: "Sfuso A",
        quantity: 0.35,
        grossUnitPrice: 1.15,
        vatCode: "22",
      },
    ];

    render(
      <ReceiptSummary
        lines={fractional}
        totalCents={120}
        paymentMethod="PC"
        onPaymentMethodChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText(/1,20/)).toBeInTheDocument();
    expect(screen.queryByText(/1,21/)).not.toBeInTheDocument();
  });

  it("mostra il metodo di pagamento selezionato", () => {
    render(
      <ReceiptSummary
        lines={lines}
        totalCents={TOTAL_CENTS}
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
        totalCents={TOTAL_CENTS}
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
        totalCents={TOTAL_CENTS}
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
        totalCents={TOTAL_CENTS}
        paymentMethod="PC"
        onPaymentMethodChange={vi.fn()}
        onRemoveLine={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        isSubmitting={true}
      />,
    );

    expect(
      screen.getByRole("button", { name: /invio in corso/i }),
    ).toBeDisabled();
  });

  it("ha un bottone per tornare indietro", () => {
    render(
      <ReceiptSummary
        lines={lines}
        totalCents={TOTAL_CENTS}
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
        totalCents={TOTAL_CENTS}
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
        totalCents={TOTAL_CENTS}
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
        totalCents={TOTAL_CENTS}
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
        totalCents={750}
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
        totalCents={TOTAL_CENTS}
        paymentMethod="PC"
        onPaymentMethodChange={vi.fn()}
        onRemoveLine={onRemoveLine}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        lotteryCode=""
        onLotteryCodeChange={vi.fn()}
      />,
    );

    const removeButtons = screen.getAllByRole("button", {
      name: /rimuovi articolo/i,
    });
    fireEvent.click(removeButtons[0]);

    expect(onRemoveLine).toHaveBeenCalledWith("1");
  });

  describe("campo codice lotteria", () => {
    it("non mostra il campo lotteria con pagamento PC (contanti)", () => {
      render(
        <ReceiptSummary
          lines={lines}
          totalCents={TOTAL_CENTS}
          paymentMethod="PC"
          onPaymentMethodChange={vi.fn()}
          onRemoveLine={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
          lotteryCode=""
          onLotteryCodeChange={vi.fn()}
        />,
      );

      expect(
        screen.queryByPlaceholderText(/codice lotteria/i),
      ).not.toBeInTheDocument();
    });

    it("mostra il campo lotteria con pagamento PE (carta)", () => {
      render(
        <ReceiptSummary
          lines={lines}
          totalCents={TOTAL_CENTS}
          paymentMethod="PE"
          onPaymentMethodChange={vi.fn()}
          onRemoveLine={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
          lotteryCode=""
          onLotteryCodeChange={vi.fn()}
        />,
      );

      expect(
        screen.getByPlaceholderText(/codice lotteria/i),
      ).toBeInTheDocument();
    });

    it("converte automaticamente l'input in maiuscolo", async () => {
      const onLotteryCodeChange = vi.fn();
      render(
        <ReceiptSummary
          lines={lines}
          totalCents={TOTAL_CENTS}
          paymentMethod="PE"
          onPaymentMethodChange={vi.fn()}
          onRemoveLine={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
          lotteryCode=""
          onLotteryCodeChange={onLotteryCodeChange}
        />,
      );

      const input = screen.getByPlaceholderText(/codice lotteria/i);
      fireEvent.change(input, { target: { value: "abc12345" } });

      expect(onLotteryCodeChange).toHaveBeenCalledWith("ABC12345");
    });

    it("limita l'input a 8 caratteri (maxLength)", () => {
      render(
        <ReceiptSummary
          lines={lines}
          totalCents={TOTAL_CENTS}
          paymentMethod="PE"
          onPaymentMethodChange={vi.fn()}
          onRemoveLine={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
          lotteryCode="YYWLR30G"
          onLotteryCodeChange={vi.fn()}
        />,
      );

      const input = screen.getByPlaceholderText(
        /codice lotteria/i,
      ) as HTMLInputElement;
      expect(input.maxLength).toBe(8);
    });

    it("mostra il valore corrente del codice lotteria", () => {
      render(
        <ReceiptSummary
          lines={lines}
          totalCents={TOTAL_CENTS}
          paymentMethod="PE"
          onPaymentMethodChange={vi.fn()}
          onRemoveLine={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
          lotteryCode="YYWLR30G"
          onLotteryCodeChange={vi.fn()}
        />,
      );

      const input = screen.getByPlaceholderText(
        /codice lotteria/i,
      ) as HTMLInputElement;
      expect(input.value).toBe("YYWLR30G");
    });

    it("disabilita il campo quando totalCents < 100 con pagamento PE", () => {
      render(
        <ReceiptSummary
          lines={lines}
          totalCents={50}
          paymentMethod="PE"
          onPaymentMethodChange={vi.fn()}
          onRemoveLine={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
          lotteryCode=""
          onLotteryCodeChange={vi.fn()}
        />,
      );

      const input = screen.getByPlaceholderText(
        /codice lotteria/i,
      ) as HTMLInputElement;
      expect(input).toBeDisabled();
    });

    it("abilita il campo quando totalCents >= 100 con pagamento PE", () => {
      render(
        <ReceiptSummary
          lines={lines}
          totalCents={100}
          paymentMethod="PE"
          onPaymentMethodChange={vi.fn()}
          onRemoveLine={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
          lotteryCode=""
          onLotteryCodeChange={vi.fn()}
        />,
      );

      const input = screen.getByPlaceholderText(
        /codice lotteria/i,
      ) as HTMLInputElement;
      expect(input).not.toBeDisabled();
    });

    it("disabilita il campo al confine esatto di 99 cents", () => {
      render(
        <ReceiptSummary
          lines={lines}
          totalCents={99}
          paymentMethod="PE"
          onPaymentMethodChange={vi.fn()}
          onRemoveLine={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
          lotteryCode=""
          onLotteryCodeChange={vi.fn()}
        />,
      );

      // 99/100 è il confine: il gate deve coincidere byte-per-byte con quello
      // di `resolveLotteryCode` lato server (`calcInputLinesTotalCents < 100`).
      const input = screen.getByPlaceholderText(
        /codice lotteria/i,
      ) as HTMLInputElement;
      expect(input).toBeDisabled();
    });

    it("mostra testo helper disabilitato quando totalCents < 100", () => {
      render(
        <ReceiptSummary
          lines={lines}
          totalCents={50}
          paymentMethod="PE"
          onPaymentMethodChange={vi.fn()}
          onRemoveLine={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
          lotteryCode=""
          onLotteryCodeChange={vi.fn()}
        />,
      );

      expect(
        screen.getByText(/non disponibile per importi inferiori a €1,00/i),
      ).toBeInTheDocument();
    });

    it("mostra testo helper normale quando totalCents >= 100", () => {
      render(
        <ReceiptSummary
          lines={lines}
          totalCents={TOTAL_CENTS}
          paymentMethod="PE"
          onPaymentMethodChange={vi.fn()}
          onRemoveLine={vi.fn()}
          onSubmit={vi.fn()}
          onBack={vi.fn()}
          lotteryCode=""
          onLotteryCodeChange={vi.fn()}
        />,
      );

      expect(
        screen.getByText(/per la lotteria degli scontrini/i),
      ).toBeInTheDocument();
    });
  });
});
