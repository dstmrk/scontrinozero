import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VoidReceiptDialog } from "./void-receipt-dialog";
import { voidReceipt } from "@/server/void-actions";
import type { ReceiptListItem } from "@/types/storico";

vi.mock("@/server/void-actions", () => ({
  voidReceipt: vi.fn(),
}));

// Il banner CIE inline chiama verifyAdeCredentials solo al click su "Ricollega";
// qui basta impedire l'esecuzione della server action reale al mount.
vi.mock("@/server/onboarding-actions", () => ({
  verifyAdeCredentials: vi.fn().mockResolvedValue({ businessId: "biz-1" }),
}));

// scrollIntoView richiesto da Radix UI Dialog
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
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

  it("switches to the QR view showing the receipt URL on click", async () => {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={ACCEPTED_RECEIPT} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Mostra QR code"));
    });

    expect(
      screen.getByText((content) => content.includes("/r/doc-uuid-123")),
    ).toBeInTheDocument();
    expect(screen.getByText(/inquadra il qr code/i)).toBeInTheDocument();
    expect(screen.getByText("Indietro")).toBeInTheDocument();
  });

  it("goes back to the detail view from the QR view", async () => {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={ACCEPTED_RECEIPT} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Mostra QR code"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Indietro"));
    });

    // Back in detail view: the void button is visible again
    expect(screen.getByText("Annulla scontrino")).toBeInTheDocument();
    expect(screen.queryByText("Indietro")).not.toBeInTheDocument();
  });
});

describe("VoidReceiptDialog — banner reauth CIE (REVIEW #54)", () => {
  async function openReauthBanner() {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={ACCEPTED_RECEIPT} />,
    );
    // detail → confirmingVoid
    await act(async () => {
      fireEvent.click(screen.getByText("Annulla scontrino"));
    });
    // confirmingVoid → conferma → mutation risolve reauthRequired
    await act(async () => {
      fireEvent.click(screen.getByText("Annulla scontrino"));
    });
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
