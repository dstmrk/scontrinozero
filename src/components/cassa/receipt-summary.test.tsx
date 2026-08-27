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
    expect(screen.getByText("Elettronico")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: /elettronico/i }));

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

    it("mostra il campo lotteria con pagamento PE (elettronico)", () => {
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

describe("ReceiptSummary — sconto a pagare (Pro)", () => {
  const base = {
    lines,
    totalCents: TOTAL_CENTS,
    paymentMethod: "PC" as const,
    onPaymentMethodChange: vi.fn(),
    onRemoveLine: vi.fn(),
    onSubmit: vi.fn(),
    onBack: vi.fn(),
  };

  it("non mostra l'affordance senza il piano Pro", () => {
    render(<ReceiptSummary {...base} discountsUnlocked={false} />);

    expect(screen.queryByText("+ Sconto a pagare")).not.toBeInTheDocument();
  });

  it("mostra un solo link finché l'esercente non lo apre", () => {
    // Progressive disclosure: chi non sconta non paga nessun ingombro. Il
    // tastierino compare solo dopo il tap.
    render(<ReceiptSummary {...base} discountsUnlocked />);

    expect(screen.getByText("+ Sconto a pagare")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Rimuovi sconto a pagare"),
    ).not.toBeInTheDocument();
  });

  it("apre il campo al tap sul link", () => {
    render(<ReceiptSummary {...base} discountsUnlocked />);

    fireEvent.click(screen.getByText("+ Sconto a pagare"));

    expect(
      screen.getByLabelText("Rimuovi sconto a pagare"),
    ).toBeInTheDocument();
    expect(screen.queryByText("+ Sconto a pagare")).not.toBeInTheDocument();
  });

  it("resta aperto se arriva già con uno sconto impostato", () => {
    render(
      <ReceiptSummary {...base} discountsUnlocked globalDiscountCents={100} />,
    );

    expect(
      screen.getByLabelText("Rimuovi sconto a pagare"),
    ).toBeInTheDocument();
  });

  it("lascia il totale pieno e mostra a parte quanto si incassa", () => {
    // HAR.md voce #3b: l'abbuono NON riduce il corrispettivo. È la differenza
    // fiscale con lo sconto di riga, e va vista PRIMA dell'invio.
    render(
      <ReceiptSummary {...base} discountsUnlocked globalDiscountCents={320} />,
    );

    // 18,20 compare due volte: nel totale e nella nota "il totale resta …".
    expect(screen.getAllByText(/18,20/).length).toBeGreaterThan(0);
    expect(screen.getByText("Da incassare")).toBeInTheDocument();
    expect(screen.getByText(/15,00/)).toBeInTheDocument();
  });

  it("non mostra `Da incassare` quando non c'è abbuono", () => {
    render(
      <ReceiptSummary {...base} discountsUnlocked globalDiscountCents={0} />,
    );

    expect(screen.queryByText("Da incassare")).not.toBeInTheDocument();
  });

  it("azzera lo sconto quando l'esercente chiude il campo", () => {
    const onGlobalDiscountChange = vi.fn();
    render(
      <ReceiptSummary
        {...base}
        discountsUnlocked
        globalDiscountCents={320}
        onGlobalDiscountChange={onGlobalDiscountChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Rimuovi sconto a pagare"));

    expect(onGlobalDiscountChange).toHaveBeenCalledWith(0);
  });

  it("clampa lo sconto a un centesimo sotto il totale", () => {
    // Stesso vincolo di `refineGlobalDiscount` lato server: l'abbuono deve
    // lasciare almeno un centesimo da incassare. Clampare qui evita di far
    // digitare un importo che verrebbe rifiutato dopo l'invio.
    const onGlobalDiscountChange = vi.fn();
    render(
      <ReceiptSummary
        {...base}
        discountsUnlocked
        globalDiscountCents={0}
        onGlobalDiscountChange={onGlobalDiscountChange}
      />,
    );

    fireEvent.click(screen.getByText("+ Sconto a pagare"));
    // Il tastierino accumula cifra per cifra: 9-9-9-9-9-9 supera 18,20.
    for (const digit of ["9", "9", "9", "9", "9", "9"]) {
      fireEvent.click(screen.getByRole("button", { name: digit }));
    }

    for (const call of onGlobalDiscountChange.mock.calls) {
      expect(call[0]).toBeLessThanOrEqual(TOTAL_CENTS - 1);
    }
  });

  it("blocca l'invio se non resta nulla da incassare", () => {
    render(
      <ReceiptSummary
        {...base}
        discountsUnlocked
        globalDiscountCents={TOTAL_CENTS}
      />,
    );

    expect(
      screen.getByText("Emetti scontrino").closest("button"),
    ).toBeDisabled();
  });

  it("NON disabilita il codice lotteria per via dello sconto a pagare", () => {
    // HAR.md voce #13, verificato sul portale il 19/08/2026: l'abbuono non è
    // un mezzo di pagamento e non entra nel test "pagato esclusivamente con
    // mezzi elettronici". La soglia di €1,00 si misura sul corrispettivo, che
    // l'abbuono non riduce: uno scontrino da 18,20 con 17,00 di sconto resta
    // sopra soglia anche se il cliente paga 1,20.
    render(
      <ReceiptSummary
        {...base}
        paymentMethod="PE"
        discountsUnlocked
        globalDiscountCents={1700}
        onLotteryCodeChange={vi.fn()}
      />,
    );

    expect(
      screen.getByPlaceholderText("Codice lotteria (8 caratteri)"),
    ).not.toBeDisabled();
  });
});

describe("ReceiptSummary — pagamento misto", () => {
  const base = {
    lines,
    totalCents: TOTAL_CENTS,
    paymentMethod: "PC" as const,
    onPaymentMethodChange: vi.fn(),
    onRemoveLine: vi.fn(),
    onSubmit: vi.fn(),
    onBack: vi.fn(),
  };

  it("non mostra l'affordance ai piani senza Pro", () => {
    // La cassa è il core flow fiscale: un upsell in mezzo al checkout è
    // attrito. La scoperta della feature vive su /prezzi e nella guida.
    render(<ReceiptSummary {...base} discountsUnlocked={false} />);
    expect(screen.queryByText("+ Pagamento misto")).not.toBeInTheDocument();
  });

  it("apre la ripartizione dal link, sostituendo il selettore", () => {
    const onSplitCashChange = vi.fn();
    render(
      <ReceiptSummary
        {...base}
        discountsUnlocked
        onSplitCashChange={onSplitCashChange}
      />,
    );
    fireEvent.click(screen.getByText("+ Pagamento misto"));
    expect(onSplitCashChange).toHaveBeenCalledWith(0);
  });

  it("nasconde il selettore di metodo quando il pagamento è ripartito", () => {
    // La modalità non è più una scelta: sono due importi.
    render(
      <ReceiptSummary
        {...base}
        discountsUnlocked
        splitCashCents={500}
        onSplitCashChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("Metodo di pagamento")).not.toBeInTheDocument();
    expect(screen.getByText("Pagamento misto")).toBeInTheDocument();
  });

  it("ripartisce l'incassato, non il corrispettivo, con uno sconto a pagare", () => {
    // HAR.md voce #5: Σ pagamenti + abbuono = totale. 18,20 − 2,00 = 16,20
    // da ripartire, di cui 5,00 in contanti → 11,20 elettronici.
    render(
      <ReceiptSummary
        {...base}
        discountsUnlocked
        globalDiscountCents={200}
        splitCashCents={500}
        onSplitCashChange={vi.fn()}
      />,
    );
    expect(screen.getByText("11,20 €")).toBeInTheDocument();
  });

  it("disabilita il codice lotteria quando una quota è in contanti", () => {
    // HAR.md voce #13: serve un incasso solo elettronico. Disabilitato con la
    // ragione scritta, non fatto sparire: l'esercente deve sapere perché.
    render(
      <ReceiptSummary
        {...base}
        discountsUnlocked
        splitCashCents={500}
        onSplitCashChange={vi.fn()}
        lotteryCode=""
        onLotteryCodeChange={vi.fn()}
      />,
    );
    expect(
      screen.getByPlaceholderText("Codice lotteria (8 caratteri)"),
    ).toBeDisabled();
    expect(
      screen.getByText(/richiede un incasso solo elettronico/i),
    ).toBeInTheDocument();
  });

  it("riabilita il codice lotteria se l'incasso torna tutto elettronico", () => {
    // Quota contanti a zero: il documento è un pagamento elettronico singolo,
    // e il codice torna ammesso.
    render(
      <ReceiptSummary
        {...base}
        discountsUnlocked
        splitCashCents={0}
        onSplitCashChange={vi.fn()}
        lotteryCode=""
        onLotteryCodeChange={vi.fn()}
      />,
    );
    expect(
      screen.getByPlaceholderText("Codice lotteria (8 caratteri)"),
    ).toBeEnabled();
  });
});
