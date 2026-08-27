import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VoidReceiptDialog } from "./void-receipt-dialog";
import { voidReceipt } from "@/server/void-actions";
import type { UsePrinterResult } from "@/hooks/use-printer";
import type { ReceiptPrintProfile } from "@/lib/receipts/print-profile";
import type { ReceiptListItem } from "@/types/storico";

vi.mock("@/server/void-actions", () => ({
  voidReceipt: vi.fn(),
}));

const mockPrinter: { current: UsePrinterResult } = {
  current: {} as UsePrinterResult,
};

vi.mock("@/hooks/use-printer", () => ({
  usePrinter: () => mockPrinter.current,
}));

function printerState(overrides: Partial<UsePrinterResult> = {}) {
  return {
    status: "connected",
    deviceName: "Munbyn ITPP047",
    support: { status: "supported" },
    canUseBluetooth: true,
    isBusy: false,
    connect: vi.fn().mockResolvedValue(null),
    disconnect: vi.fn().mockResolvedValue(undefined),
    print: vi.fn().mockResolvedValue(null),
    testPrint: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as UsePrinterResult;
}

// Il banner CIE inline chiama verifyAdeCredentials solo al click su "Ricollega";
// qui basta impedire l'esecuzione della server action reale al mount.
vi.mock("@/server/onboarding-actions", () => ({
  verifyAdeCredentials: vi.fn().mockResolvedValue({ businessId: "biz-1" }),
}));

let openSpy: ReturnType<typeof vi.fn>;

// scrollIntoView richiesto da Radix UI Dialog
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
  mockPrinter.current = printerState();
  openSpy = vi.fn();
  vi.stubGlobal("open", openSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

const ACCEPTED_RECEIPT: ReceiptListItem = {
  id: "doc-uuid-123",
  kind: "SALE",
  status: "ACCEPTED",
  adeProgressive: "DCW2026/5111-2188",
  adeTransactionId: "trx-001",
  createdAt: new Date("2026-01-01T09:59:57Z"),
  adeRegisteredAt: new Date("2026-01-01T10:00:00Z"),
  voidDocument: null,
  paymentMethod: "PC",
  payments: null,
  lotteryCode: null,
  globalDiscountCents: 0,
  total: "12.00",
  lines: [
    {
      description: "Caffè espresso",
      quantity: "2",
      grossUnitPrice: "1.20",
      lineDiscount: "0",
      vatCode: "22",
    },
  ],
};

const VOIDED_RECEIPT: ReceiptListItem = {
  ...ACCEPTED_RECEIPT,
  status: "VOID_ACCEPTED",
  voidDocument: {
    id: "void-doc-uuid",
    adeProgressive: "DCW2026/5111-2189",
    adeRegisteredAt: new Date("2026-01-02T10:00:00Z"),
  },
};

const defaultProps = {
  businessId: "biz-1",
  onClose: vi.fn(),
  onSuccess: vi.fn(),
};

describe("VoidReceiptDialog — QR code", () => {
  it("shows 'Mostra QR code' for an ACCEPTED receipt", () => {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={ACCEPTED_RECEIPT} />,
    );

    expect(screen.getByText("Mostra QR code")).toBeInTheDocument();
  });

  it("does not show 'Mostra QR code' for a voided receipt", () => {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={VOIDED_RECEIPT} />,
    );

    expect(screen.queryByText("Mostra QR code")).not.toBeInTheDocument();
  });

  it("switches to the QR view showing the receipt URL on click", () => {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={ACCEPTED_RECEIPT} />,
    );

    fireEvent.click(screen.getByText("Mostra QR code"));

    expect(
      screen.getByText((content) => content.includes("/r/doc-uuid-123")),
    ).toBeInTheDocument();
    expect(screen.getByText(/inquadra il qr code/i)).toBeInTheDocument();
    expect(screen.getByText("Indietro")).toBeInTheDocument();
  });

  it("goes back to the detail view from the QR view", () => {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={ACCEPTED_RECEIPT} />,
    );

    fireEvent.click(screen.getByText("Mostra QR code"));
    fireEvent.click(screen.getByText("Indietro"));

    // Back in detail view: the void button is visible again
    expect(screen.getByText("Annulla scontrino")).toBeInTheDocument();
    expect(screen.queryByText("Indietro")).not.toBeInTheDocument();
  });
});

describe("VoidReceiptDialog — ristampa (REVIEW #78)", () => {
  const PRINT_PROFILE: ReceiptPrintProfile = {
    header: {
      businessName: "Bar da Mario",
      vatNumber: "12345678901",
      address: null,
      city: null,
      province: null,
      zipCode: null,
    },
    footerNote: "Arrivederci e grazie!",
  };

  it("stampa sulla termica uno scontrino con righe", async () => {
    renderWithQuery(
      <VoidReceiptDialog
        {...defaultProps}
        receipt={ACCEPTED_RECEIPT}
        printProfile={PRINT_PROFILE}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));

    await waitFor(() =>
      expect(mockPrinter.current.print).toHaveBeenCalledTimes(1),
    );
    expect(openSpy).not.toHaveBeenCalled();
  });

  // Il PDF dello stesso documento porta la nota (gate risolto server-side):
  // se la ristampa termica non la portasse, due copie dello stesso scontrino
  // uscirebbero diverse.
  it("porta il messaggio di cortesia nella ristampa di una vendita", async () => {
    renderWithQuery(
      <VoidReceiptDialog
        {...defaultProps}
        receipt={ACCEPTED_RECEIPT}
        printProfile={PRINT_PROFILE}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));

    await waitFor(() => expect(mockPrinter.current.print).toHaveBeenCalled());
    const printed = vi.mocked(mockPrinter.current.print).mock.calls[0][0];
    expect(printed.kind).toBe("SALE");
    if (printed.kind !== "SALE") throw new Error("attesa una vendita");
    expect(printed.footerNote).toBe("Arrivederci e grazie!");
  });

  it("ripiega sul PDF quando il documento non ha righe", async () => {
    // Un documento senza righe (dato degenere/legacy: `linesByDocId.get(id) ??
    // []` in searchReceipts) stamperebbe uno scontrino termico con zero
    // articoli e "TOTALE COMPLESSIVO 0,00" — su carta, in mano al cliente.
    // ReceiptSuccess questo gate ce l'ha già.
    renderWithQuery(
      <VoidReceiptDialog
        {...defaultProps}
        receipt={{ ...ACCEPTED_RECEIPT, lines: [] }}
        printProfile={PRINT_PROFILE}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));

    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        "/api/documents/doc-uuid-123/pdf?qr=0",
        "_blank",
        "noopener,noreferrer",
      ),
    );
    expect(mockPrinter.current.print).not.toHaveBeenCalled();
  });
});

describe("VoidReceiptDialog — banner reauth CIE (REVIEW #54)", () => {
  function openReauthBanner() {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={ACCEPTED_RECEIPT} />,
    );
    // detail → confirmingVoid
    fireEvent.click(screen.getByText("Annulla scontrino"));
    // confirmingVoid → conferma → mutation risolve reauthRequired
    fireEvent.click(screen.getByText("Annulla scontrino"));
    return screen.findByText(/Sessione CIE scaduta/);
  }

  it("mostra il banner reauth quando la server action ritorna reauthRequired", async () => {
    vi.mocked(voidReceipt).mockResolvedValue({ reauthRequired: true });

    const banner = await openReauthBanner();

    expect(banner).toBeInTheDocument();
  });

  it("il banner reauth resta leggibile in dark mode (varianti dark:)", async () => {
    vi.mocked(voidReceipt).mockResolvedValue({ reauthRequired: true });

    const banner = await openReauthBanner();

    // Senza le varianti dark: il testo eredita il foreground chiaro del tema
    // su fondo amber-50 chiaro → contrasto quasi nullo (REVIEW #54). Le classi
    // dark: vivono sul contenitore del banner, non sul <p> del messaggio.
    expect(banner.closest("div")).toHaveClass(
      "dark:bg-amber-950",
      "dark:text-amber-200",
    );
  });

  it("il bottone 'Ricollega' avvia il ricollegamento inline dalla stessa view", async () => {
    vi.mocked(voidReceipt).mockResolvedValue({ reauthRequired: true });

    await openReauthBanner();

    // Il ricollegamento è inline: niente più rimando alle impostazioni come
    // unico percorso — c'è un bottone azionabile nella stessa schermata.
    expect(
      screen.getByRole("button", { name: "Ricollega" }),
    ).toBeInTheDocument();
  });
});

describe("VoidReceiptDialog — descrizioni lunghe senza scroll orizzontale", () => {
  // jsdom non fa layout (scrollWidth è sempre 0): la regressione si presidia
  // sulle classi che governano la larghezza intrinseca, verificate a mano in
  // Chromium headless. `DialogContent` è un `grid` con `overflow-y-auto` →
  // `overflow-x` calcola `auto`, quindi ogni figlio che sfora apre una barra
  // di scorrimento orizzontale dentro la modale.
  const LONG_DESCRIPTION =
    "Pernottamento Room 2 - Mario Rossi - Booking 45873 - soggiorno 3 notti";

  const LONG_LINE_RECEIPT: ReceiptListItem = {
    ...ACCEPTED_RECEIPT,
    lines: [{ ...ACCEPTED_RECEIPT.lines[0], description: LONG_DESCRIPTION }],
  };

  function renderLongReceipt() {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={LONG_LINE_RECEIPT} />,
    );
    return screen.getByText(LONG_DESCRIPTION);
  }

  it("manda a capo la descrizione invece di tenerla su una riga sola", () => {
    const description = renderLongReceipt();

    // `truncate` porta con sé `white-space: nowrap`: la larghezza min-content
    // del blocco righe diventa l'intera stringa e il track del grid si allarga
    // oltre la modale. Con il testo che va a capo la descrizione resta anche
    // leggibile per intero — è la vista di dettaglio.
    expect(description).not.toHaveClass("truncate");
    expect(description).toHaveClass("break-words");
  });

  it("azzera la larghezza minima del blocco righe (grid item)", () => {
    const description = renderLongReceipt();

    // Il contenitore delle righe è un grid item di DialogContent: senza
    // `min-w-0` la sua automatic minimum size resta il min-content (la parola
    // più lunga della descrizione) e allarga la modale.
    const linesContainer = description.closest("div.divide-y");
    expect(linesContainer).toHaveClass("min-w-0");
  });

  it("manda a capo i bottoni del footer invece di farli sforare", () => {
    renderLongReceipt();

    // Cinque bottoni `shrink-0 whitespace-nowrap` misurano ~554px contro i
    // 512px di `sm:max-w-lg`: senza `flex-wrap` il footer sfora da solo, a
    // prescindere dalla lunghezza della descrizione.
    const footer = screen
      .getByRole("button", { name: "Chiudi" })
      .closest('[data-slot="dialog-footer"]');
    expect(footer).toHaveClass("flex-wrap");
  });
});

// ---------------------------------------------------------------------------
// Ricevuta di annullamento: l'entry point dal dettaglio di una vendita
// annullata. Senza, la riga e' un vicolo cieco (REVIEW.md #85).
// ---------------------------------------------------------------------------

describe("VoidReceiptDialog — ricevuta di annullamento", () => {
  const PRINT_PROFILE: ReceiptPrintProfile = {
    header: {
      businessName: "Bar Mario",
      vatNumber: "12345678901",
      address: "Via Roma 1",
      city: "Milano",
      province: "MI",
      zipCode: "20100",
    },
    footerNote: "Arrivederci e grazie!",
  };

  it("offre il link alla ricevuta di annullamento su una vendita annullata", () => {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={VOIDED_RECEIPT} />,
    );

    expect(
      screen.getByRole("link", { name: /ricevuta di annullamento/i }),
    ).toHaveAttribute("href", "/r/void-doc-uuid");
  });

  it("non offre nulla di tutto cio' su una vendita ancora valida", () => {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={ACCEPTED_RECEIPT} />,
    );

    expect(
      screen.queryByRole("link", { name: /ricevuta di annullamento/i }),
    ).not.toBeInTheDocument();
  });

  it("stampa l'annullo, non la vendita annullata", async () => {
    renderWithQuery(
      <VoidReceiptDialog
        {...defaultProps}
        receipt={VOIDED_RECEIPT}
        printProfile={PRINT_PROFILE}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));

    await waitFor(() => expect(mockPrinter.current.print).toHaveBeenCalled());
    const printed = vi.mocked(mockPrinter.current.print).mock.calls[0][0];
    // Narrowing sull'unione discriminata: `voidedDocument` esiste solo sul
    // ramo VOID, ed e' esattamente cio' che il test deve dimostrare.
    expect(printed.kind).toBe("VOID");
    if (printed.kind !== "VOID") throw new Error("atteso un documento VOID");
    expect(printed.adeProgressive).toBe("DCW2026/5111-2189");
    expect(printed.voidedDocument).toEqual({
      adeProgressive: "DCW2026/5111-2188",
      adeRegisteredAt: new Date("2026-01-01T10:00:00Z"),
    });
  });

  it("ristampa le righe della vendita annullata", async () => {
    renderWithQuery(
      <VoidReceiptDialog
        {...defaultProps}
        receipt={VOIDED_RECEIPT}
        printProfile={PRINT_PROFILE}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));

    await waitFor(() => expect(mockPrinter.current.print).toHaveBeenCalled());
    expect(vi.mocked(mockPrinter.current.print).mock.calls[0][0].lines).toEqual(
      VOIDED_RECEIPT.lines,
    );
  });
});

// ---------------------------------------------------------------------------
// Allineamento del footer: la "Stampa" nasceva `size="lg"` (h-9) accanto a
// bottoni `default` (h-8) e su desktop risultava visibilmente piu' alta.
// ---------------------------------------------------------------------------

describe("VoidReceiptDialog — footer allineato", () => {
  function footerSizes() {
    const footer = screen
      .getByRole("button", { name: "Chiudi" })
      .closest('[data-slot="dialog-footer"]');
    return [...(footer?.querySelectorAll("[data-slot='button']") ?? [])].map(
      (el) => el.getAttribute("data-size"),
    );
  }

  it("tiene tutti i bottoni della vendita valida alla stessa taglia", () => {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={ACCEPTED_RECEIPT} />,
    );

    expect(new Set(footerSizes())).toEqual(new Set(["default"]));
  });

  it("tiene tutti i bottoni della vendita annullata alla stessa taglia", () => {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={VOIDED_RECEIPT} />,
    );

    expect(new Set(footerSizes())).toEqual(new Set(["default"]));
  });
});

// ---------------------------------------------------------------------------
// Conferma dell'annullo: la modale non si chiude, e appena il parent le passa
// la riga riletta offre lì la ricevuta di annullamento — è il momento in cui
// il cliente è ancora al banco.
// ---------------------------------------------------------------------------

describe("VoidReceiptDialog — conferma dell'annullo", () => {
  async function confirmVoid() {
    vi.mocked(voidReceipt).mockResolvedValue({
      voidDocumentId: "void-doc-uuid",
      adeProgressive: "DCW2026/5111-2189",
    });
    const view = renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={ACCEPTED_RECEIPT} />,
    );
    // detail → confirmingVoid → conferma
    fireEvent.click(screen.getByText("Annulla scontrino"));
    fireEvent.click(screen.getByText("Annulla scontrino"));
    await screen.findByText("Annullo confermato");
    return view;
  }

  it("resta aperta sulla conferma invece di sparire", async () => {
    await confirmVoid();

    expect(screen.getByText("Annullo confermato")).toBeInTheDocument();
  });

  it("mostra il progressivo dell'annullo appena trasmesso", async () => {
    await confirmVoid();

    expect(screen.getByText("DCW2026/5111-2189")).toBeInTheDocument();
  });

  it("offre la ricevuta di annullamento appena il parent rilegge la riga", async () => {
    const { rerender } = await confirmVoid();

    // È ciò che fa `refreshVoidedRow` nello storico: la stessa modale, con la
    // riga che ora porta l'annullo.
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <VoidReceiptDialog {...defaultProps} receipt={VOIDED_RECEIPT} />
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("link", { name: /ricevuta di annullamento/i }),
    ).toHaveAttribute("href", "/r/void-doc-uuid");
  });

  it("non offre la ricevuta finché la rilettura non è arrivata", async () => {
    await confirmVoid();

    expect(
      screen.queryByRole("link", { name: /ricevuta di annullamento/i }),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// La data del dettaglio è quella registrata dall'AdE, la stessa che l'elenco
// mostra e che finisce sul documento consegnato al cliente.
// ---------------------------------------------------------------------------

describe("VoidReceiptDialog — data del dettaglio", () => {
  // Scarto volutamente esagerato a un giorno pieno: un divario di 2-5s reale
  // cadrebbe nello stesso giorno e non direbbe quale colonna è stata letta.
  const RECEIPT_ACROSS_MIDNIGHT: ReceiptListItem = {
    ...ACCEPTED_RECEIPT,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    adeRegisteredAt: new Date("2026-01-02T10:00:00Z"),
  };

  it("mostra ade_registered_at, non il createdAt della riga", () => {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={RECEIPT_ACROSS_MIDNIGHT} />,
    );

    expect(
      screen.getByText((c) => c.startsWith("02/01/2026")),
    ).toBeInTheDocument();
    expect(
      screen.queryByText((c) => c.startsWith("01/01/2026")),
    ).not.toBeInTheDocument();
  });
});

describe("VoidReceiptDialog — sconto di riga", () => {
  it("mostra il totale al netto dello sconto, non il prezzo di listino", () => {
    // L'esercente conferma l'annullo guardando questo importo: deve essere
    // quello trasmesso all'AdE (HAR.md voce #3a), altrimenti crede di
    // annullare uno scontrino diverso da quello che ha emesso.
    renderWithQuery(
      <VoidReceiptDialog
        {...defaultProps}
        receipt={{
          ...ACCEPTED_RECEIPT,
          lines: [
            {
              description: "Maglione",
              quantity: "1",
              grossUnitPrice: "160.65",
              lineDiscount: "10.65",
              vatCode: "22",
            },
          ],
        }}
        printProfile={null}
      />,
    );

    expect(screen.getAllByText(/150,00/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/160,65\s*$/)).not.toBeInTheDocument();
  });
});
