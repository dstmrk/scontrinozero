import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VoidReceiptDialog } from "./void-receipt-dialog";
import { voidReceipt } from "@/server/void-actions";
import type { UsePrinterResult } from "@/hooks/use-printer";
import type { ReceiptPrintHeader } from "@/lib/printing/types";
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
  createdAt: new Date("2026-01-01T10:00:00Z"),
  paymentMethod: "PC",
  lotteryCode: null,
  total: "12.00",
  lines: [
    {
      description: "Caffè espresso",
      quantity: "2",
      grossUnitPrice: "1.20",
      vatCode: "22",
    },
  ],
};

const VOIDED_RECEIPT: ReceiptListItem = {
  ...ACCEPTED_RECEIPT,
  status: "VOID_ACCEPTED",
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
  const PRINT_HEADER: ReceiptPrintHeader = {
    businessName: "Bar da Mario",
    vatNumber: "12345678901",
    address: null,
    city: null,
    province: null,
    zipCode: null,
  };

  it("stampa sulla termica uno scontrino con righe", async () => {
    renderWithQuery(
      <VoidReceiptDialog
        {...defaultProps}
        receipt={ACCEPTED_RECEIPT}
        printHeader={PRINT_HEADER}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));

    await waitFor(() =>
      expect(mockPrinter.current.print).toHaveBeenCalledTimes(1),
    );
    expect(openSpy).not.toHaveBeenCalled();
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
        printHeader={PRINT_HEADER}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));

    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        "/api/documents/doc-uuid-123/pdf",
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
