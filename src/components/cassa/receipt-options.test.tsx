import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ReceiptOptions } from "./receipt-options";

const HINT_OK = "Per la Lotteria degli Scontrini — solo pagamenti elettronici";

const base = {
  discountsUnlocked: true,
  totalCents: 1820,
  collectedCents: 1820,
  globalDiscountCents: 0,
  onGlobalDiscountChange: vi.fn(),
  isSplit: false,
  cashCents: 0,
  onSplitCashChange: vi.fn(),
  lotteryCode: "",
  onLotteryCodeChange: vi.fn(),
  lotteryDisabled: false,
  lotteryHint: HINT_OK,
};

/** Il toggle del pannello. */
function toggle() {
  return screen.getByRole("button", { name: /altre opzioni/i });
}

const LOTTERY = "Codice lotteria (8 caratteri)";

describe("ReceiptOptions — disclosure", () => {
  it("parte chiuso quando nessuna opzione è impostata", () => {
    // È il caso della quasi totalità degli scontrini: zero altezza spesa per
    // tre feature marginali.
    render(<ReceiptOptions {...base} />);

    expect(screen.queryByPlaceholderText(LOTTERY)).not.toBeInTheDocument();
    expect(screen.queryByText("+ Sconto a pagare")).not.toBeInTheDocument();
    expect(screen.queryByText("+ Pagamento misto")).not.toBeInTheDocument();
  });

  it("apre il pannello al tap sul toggle", () => {
    render(<ReceiptOptions {...base} />);

    fireEvent.click(toggle());

    expect(screen.getByPlaceholderText(LOTTERY)).toBeInTheDocument();
  });

  it("richiude il pannello a un secondo tap", () => {
    render(<ReceiptOptions {...base} />);

    fireEvent.click(toggle());
    fireEvent.click(toggle());

    expect(screen.queryByPlaceholderText(LOTTERY)).not.toBeInTheDocument();
  });

  it("espone lo stato di apertura con aria-expanded", () => {
    render(<ReceiptOptions {...base} />);

    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
  });

  it("parte aperto se arriva con uno sconto a pagare impostato", () => {
    // Rientrando dal carrello il riepilogo si rimonta: una scelta già fatta
    // non deve finire dietro un tap.
    render(<ReceiptOptions {...base} globalDiscountCents={200} />);

    expect(
      screen.getByLabelText("Rimuovi sconto a pagare"),
    ).toBeInTheDocument();
  });

  it("parte aperto se arriva con un pagamento misto attivo", () => {
    render(<ReceiptOptions {...base} isSplit cashCents={500} />);

    expect(screen.getByText("Pagamento misto")).toBeInTheDocument();
  });

  it("parte aperto se arriva con un codice lotteria già digitato", () => {
    render(<ReceiptOptions {...base} lotteryCode="YYWLR30G" />);

    expect(screen.getByPlaceholderText(LOTTERY)).toBeInTheDocument();
  });
});

describe("ReceiptOptions — riassunto a pannello chiuso", () => {
  it("non mostra etichette quando non c'è nulla di impostato", () => {
    render(<ReceiptOptions {...base} />);

    expect(toggle()).toHaveTextContent(/^Altre opzioni$/);
  });

  it("nomina lo sconto a pagare quando il pannello viene richiuso", () => {
    // Un `Altre opzioni` muto nasconderebbe un dato fiscale.
    render(<ReceiptOptions {...base} globalDiscountCents={200} />);

    fireEvent.click(toggle());

    expect(screen.getByText(/Sconto: 2,00/)).toBeInTheDocument();
  });

  it("nomina la quota in contanti del pagamento misto", () => {
    // Col misto attivo il selettore del metodo sparisce dal riepilogo: senza
    // questa etichetta non resterebbe scritto da nessuna parte come si incassa.
    render(<ReceiptOptions {...base} isSplit cashCents={500} />);

    fireEvent.click(toggle());

    expect(screen.getByText(/Misto: 5,00 € in contanti/)).toBeInTheDocument();
  });

  it("nomina il codice lotteria senza trascriverlo", () => {
    render(<ReceiptOptions {...base} lotteryCode="YYWLR30G" />);

    fireEvent.click(toggle());

    expect(screen.getByText("Lotteria")).toBeInTheDocument();
  });

  it("non annuncia un codice lotteria che non finirà sul documento", () => {
    // Su un incasso non ammesso il codice è inerte: lo scarta
    // `resolveLotteryCode` lato server. Un chip "Lotteria" direbbe il
    // contrario. Il codice resta nel campo, con la ragione scritta.
    render(<ReceiptOptions {...base} lotteryCode="YYWLR30G" lotteryDisabled />);

    fireEvent.click(toggle());

    expect(screen.queryByText("Lotteria")).not.toBeInTheDocument();
  });

  it("elenca insieme le opzioni attive", () => {
    render(
      <ReceiptOptions
        {...base}
        isSplit
        cashCents={500}
        globalDiscountCents={200}
        lotteryCode="YYWLR30G"
      />,
    );

    fireEvent.click(toggle());

    expect(
      screen.getByText("Misto: 5,00 € in contanti · Sconto: 2,00 € · Lotteria"),
    ).toBeInTheDocument();
  });

  it("nasconde le etichette quando il pannello è aperto", () => {
    // Aperto, le opzioni si vedono già: ripeterle è rumore.
    render(<ReceiptOptions {...base} globalDiscountCents={200} />);

    expect(screen.queryByText(/Sconto: 2,00/)).not.toBeInTheDocument();
  });
});

describe("ReceiptOptions — gate di piano", () => {
  it("non mostra sconto e misto senza il piano Pro", () => {
    render(<ReceiptOptions {...base} discountsUnlocked={false} />);
    fireEvent.click(toggle());

    expect(screen.queryByText("+ Sconto a pagare")).not.toBeInTheDocument();
    expect(screen.queryByText("+ Pagamento misto")).not.toBeInTheDocument();
  });

  it("non lascia il pannello vuoto ai piani senza Pro", () => {
    // Un layout solo per tutti i piani: per Starter dentro resta la lotteria,
    // che non ha gate di piano.
    render(<ReceiptOptions {...base} discountsUnlocked={false} />);
    fireEvent.click(toggle());

    expect(screen.getByPlaceholderText(LOTTERY)).toBeInTheDocument();
  });
});

describe("ReceiptOptions — sconto a pagare", () => {
  it("apre il tastierino solo dopo il tap sul link", () => {
    render(<ReceiptOptions {...base} />);
    fireEvent.click(toggle());

    expect(
      screen.queryByLabelText("Rimuovi sconto a pagare"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("+ Sconto a pagare"));

    expect(
      screen.getByLabelText("Rimuovi sconto a pagare"),
    ).toBeInTheDocument();
  });

  it("azzera lo sconto quando l'esercente chiude il campo", () => {
    const onGlobalDiscountChange = vi.fn();
    render(
      <ReceiptOptions
        {...base}
        globalDiscountCents={320}
        onGlobalDiscountChange={onGlobalDiscountChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Rimuovi sconto a pagare"));

    expect(onGlobalDiscountChange).toHaveBeenCalledWith(0);
  });

  it("propaga le cifre del tastierino al padre", () => {
    const onGlobalDiscountChange = vi.fn();
    render(
      <ReceiptOptions
        {...base}
        globalDiscountCents={0}
        onGlobalDiscountChange={onGlobalDiscountChange}
      />,
    );
    fireEvent.click(toggle());
    fireEvent.click(screen.getByText("+ Sconto a pagare"));
    fireEvent.click(screen.getByRole("button", { name: "5" }));

    expect(onGlobalDiscountChange).toHaveBeenCalledWith(5);
  });
});

describe("ReceiptOptions — pagamento misto", () => {
  it("apre la ripartizione dal link", () => {
    const onSplitCashChange = vi.fn();
    render(<ReceiptOptions {...base} onSplitCashChange={onSplitCashChange} />);
    fireEvent.click(toggle());

    fireEvent.click(screen.getByText("+ Pagamento misto"));

    expect(onSplitCashChange).toHaveBeenCalledWith(0);
  });

  it("chiude la ripartizione riportando lo stato a modalità singola", () => {
    const onSplitCashChange = vi.fn();
    render(
      <ReceiptOptions
        {...base}
        isSplit
        cashCents={500}
        onSplitCashChange={onSplitCashChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Rimuovi pagamento misto"));

    expect(onSplitCashChange).toHaveBeenCalledWith(null);
  });

  it("propaga al padre la quota in contanti digitata sul tastierino", () => {
    const onSplitCashChange = vi.fn();
    render(
      <ReceiptOptions
        {...base}
        isSplit
        cashCents={0}
        onSplitCashChange={onSplitCashChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "5" }));

    expect(onSplitCashChange).toHaveBeenCalledWith(5);
  });

  it("ripartisce l'incassato, non il corrispettivo", () => {
    // HAR.md voce #5: Σ pagamenti + abbuono = totale.
    render(
      <ReceiptOptions
        {...base}
        globalDiscountCents={200}
        collectedCents={1620}
        isSplit
        cashCents={500}
      />,
    );

    expect(screen.getByText("11,20 €")).toBeInTheDocument();
  });
});

describe("ReceiptOptions — codice lotteria", () => {
  it("converte l'input in maiuscolo", () => {
    const onLotteryCodeChange = vi.fn();
    render(
      <ReceiptOptions {...base} onLotteryCodeChange={onLotteryCodeChange} />,
    );
    fireEvent.click(toggle());

    fireEvent.change(screen.getByPlaceholderText(LOTTERY), {
      target: { value: "abc12345" },
    });

    expect(onLotteryCodeChange).toHaveBeenCalledWith("ABC12345");
  });

  it("limita l'input a 8 caratteri", () => {
    render(<ReceiptOptions {...base} />);
    fireEvent.click(toggle());

    expect(
      (screen.getByPlaceholderText(LOTTERY) as HTMLInputElement).maxLength,
    ).toBe(8);
  });

  it("disabilita il campo mostrando la ragione, invece di farlo sparire", () => {
    render(
      <ReceiptOptions
        {...base}
        lotteryDisabled
        lotteryHint="Non disponibile: la lotteria richiede un pagamento elettronico"
      />,
    );
    fireEvent.click(toggle());

    expect(screen.getByPlaceholderText(LOTTERY)).toBeDisabled();
    expect(
      screen.getByText(/richiede un pagamento elettronico/i),
    ).toBeInTheDocument();
  });
});
