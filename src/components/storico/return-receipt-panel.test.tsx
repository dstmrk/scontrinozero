import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ReturnReceiptPanel } from "./return-receipt-panel";
import { returnReceipt } from "@/server/return-actions";
import { getReceiptDetail } from "@/server/storico-actions";
import type { UsePrinterResult } from "@/hooks/use-printer";
import type { ReceiptPrintProfile } from "@/lib/receipts/print-profile";
import type { ReceiptListItem } from "@/types/storico";

vi.mock("@/server/return-actions", () => ({ returnReceipt: vi.fn() }));
vi.mock("@/server/storico-actions", () => ({ getReceiptDetail: vi.fn() }));
vi.mock("@/server/onboarding-actions", () => ({
  verifyAdeCredentials: vi.fn().mockResolvedValue({ businessId: "biz-1" }),
}));

const mockPrinter: { current: UsePrinterResult } = {
  current: {} as UsePrinterResult,
};
vi.mock("@/hooks/use-printer", () => ({
  usePrinter: () => mockPrinter.current,
}));

const PRINT_PROFILE: ReceiptPrintProfile = {
  header: {
    businessName: "Bar Mario",
    vatNumber: "12345678901",
    address: null,
    city: null,
    province: null,
    zipCode: null,
  },
  footerNote: null,
};

const SALE: ReceiptListItem = {
  origin: "local",
  id: "sale-uuid",
  kind: "SALE",
  status: "ACCEPTED",
  adeProgressive: "DCW2026/5111-2188",
  adeTransactionId: "trx-1",
  createdAt: new Date("2026-01-01T09:59:57Z"),
  adeRegisteredAt: new Date("2026-01-01T10:00:00Z"),
  voidDocument: null,
  returnOf: null,
  paymentMethod: "PC",
  payments: null,
  lotteryCode: null,
  globalDiscountCents: 0,
  total: "40.00",
  lines: [
    {
      description: "Maglia",
      quantity: "2",
      grossUnitPrice: "15.00",
      lineDiscount: "0",
      vatCode: "22",
      returnedQuantity: "1",
    },
    {
      description: "Calze",
      quantity: "1",
      grossUnitPrice: "10.00",
      lineDiscount: "0",
      vatCode: "22",
      returnedQuantity: "0",
    },
    {
      description: "Cintura",
      quantity: "1",
      grossUnitPrice: "20.00",
      lineDiscount: "0",
      vatCode: "22",
      returnedQuantity: "1",
    },
  ],
};

const RETURN_ITEM: ReceiptListItem = {
  ...SALE,
  id: "return-uuid",
  kind: "RETURN",
  adeProgressive: "DCW2026/5111-2190",
  total: "10.00",
  returnOf: {
    id: SALE.id,
    adeProgressive: "DCW2026/5111-2188",
    adeRegisteredAt: SALE.adeRegisteredAt,
  },
  lines: [{ ...SALE.lines[1], returnedQuantity: "0" }],
};

let openSpy: ReturnType<typeof vi.fn>;
const onBack = vi.fn();
const onClose = vi.fn();
const onReturned = vi.fn();

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
  mockPrinter.current = {
    status: "connected",
    deviceName: "Munbyn",
    support: { status: "supported" },
    canUseBluetooth: true,
    isBusy: false,
    connect: vi.fn().mockResolvedValue(null),
    disconnect: vi.fn().mockResolvedValue(undefined),
    print: vi.fn().mockResolvedValue(null),
    testPrint: vi.fn().mockResolvedValue(null),
  } as UsePrinterResult;
  openSpy = vi.fn();
  vi.stubGlobal("open", openSpy);
  vi.mocked(returnReceipt).mockResolvedValue({
    returnDocumentId: "return-uuid",
    adeProgressive: "DCW2026/5111-2190",
  });
  vi.mocked(getReceiptDetail).mockResolvedValue({ item: RETURN_ITEM });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPanel(receipt: ReceiptListItem = SALE) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Dialog open>
        <DialogContent>
          <ReturnReceiptPanel
            receipt={receipt}
            businessId="11111111-1111-4111-8111-111111111111"
            printProfile={PRINT_PROFILE}
            onBack={onBack}
            onClose={onClose}
            onReturned={onReturned}
          />
        </DialogContent>
      </Dialog>
    </QueryClientProvider>,
  );
}

const input = (description: string) =>
  screen.getByLabelText(`Pezzi da rendere: ${description}`);
const confirm = () => screen.getByRole("button", { name: "Conferma reso" });

describe("ReturnReceiptPanel — scelta delle quantità", () => {
  it("mostra venduto e già reso per ogni riga", () => {
    renderPanel();

    expect(screen.getByText("Venduti 2 · già resi 1")).toBeInTheDocument();
    expect(screen.getByText("Venduti 1 · già resi 0")).toBeInTheDocument();
  });

  it("una riga resa del tutto non si può più scegliere", () => {
    renderPanel();

    expect(screen.getByText("Già reso tutto")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Pezzi da rendere: Cintura"),
    ).not.toBeInTheDocument();
  });

  it("senza pezzi scelti la conferma è disabilitata", () => {
    renderPanel();

    expect(confirm()).toBeDisabled();
  });

  it("mostra il totale del reso mentre si scelgono i pezzi", () => {
    renderPanel();

    fireEvent.change(input("Calze"), { target: { value: "1" } });

    expect(screen.getByTestId("return-total")).toHaveTextContent("10,00");
    expect(confirm()).toBeEnabled();
  });

  it("'Rendi tutto' propone il rendibile di ogni riga", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Rendi tutto" }));

    expect(input("Maglia")).toHaveValue("1");
    expect(input("Calze")).toHaveValue("1");
    expect(screen.getByTestId("return-total")).toHaveTextContent("25,00");
  });

  it("oltre il rendibile: errore sulla riga e conferma disabilitata", () => {
    renderPanel();

    fireEvent.change(input("Maglia"), { target: { value: "2" } });

    expect(screen.getByText("Al massimo 1")).toBeInTheDocument();
    expect(confirm()).toBeDisabled();
  });

  it("'Indietro' torna al dettaglio", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Indietro" }));

    expect(onBack).toHaveBeenCalled();
  });
});

describe("ReturnReceiptPanel — trasmissione", () => {
  it("manda una quantità per ogni riga della vendita, 0 dove non si rende", async () => {
    renderPanel();

    fireEvent.change(input("Calze"), { target: { value: "1" } });
    fireEvent.click(confirm());

    await waitFor(() => expect(returnReceipt).toHaveBeenCalled());
    expect(vi.mocked(returnReceipt).mock.calls[0][0]).toMatchObject({
      documentId: "sale-uuid",
      businessId: "11111111-1111-4111-8111-111111111111",
      quantities: [0, 1, 0],
    });
  });

  // Stessa richiesta ritentata = stessa chiave (idempotenza). Una richiesta
  // diversa (quantità cambiate) = chiave nuova, o il servizio la
  // rifiuterebbe come riuso della chiave con un corpo diverso.
  it("ritenta con la stessa chiave, cambia chiave se cambiano le quantità", async () => {
    vi.mocked(returnReceipt).mockResolvedValue({ error: "AdE non risponde." });
    renderPanel();

    fireEvent.change(input("Calze"), { target: { value: "1" } });
    fireEvent.click(confirm());
    await screen.findByText("AdE non risponde.");
    fireEvent.click(confirm());
    await waitFor(() => expect(returnReceipt).toHaveBeenCalledTimes(2));
    fireEvent.change(input("Maglia"), { target: { value: "1" } });
    fireEvent.click(confirm());
    await waitFor(() => expect(returnReceipt).toHaveBeenCalledTimes(3));

    const keys = vi
      .mocked(returnReceipt)
      .mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("mostra l'errore del servizio e resta sulla scelta", async () => {
    vi.mocked(returnReceipt).mockResolvedValue({
      error: "Le quantità superano il rendibile.",
    });
    renderPanel();

    fireEvent.change(input("Calze"), { target: { value: "1" } });
    fireEvent.click(confirm());

    expect(
      await screen.findByText("Le quantità superano il rendibile."),
    ).toBeInTheDocument();
    expect(onReturned).not.toHaveBeenCalled();
  });

  it("sessione CIE scaduta: propone di ricollegarsi", async () => {
    vi.mocked(returnReceipt).mockResolvedValue({ reauthRequired: true });
    renderPanel();

    fireEvent.change(input("Calze"), { target: { value: "1" } });
    fireEvent.click(confirm());

    expect(
      await screen.findByRole("button", { name: /Ricollega/ }),
    ).toBeInTheDocument();
  });

  it("eccezione imprevista: messaggio generico", async () => {
    vi.mocked(returnReceipt).mockRejectedValue(new Error("boom"));
    renderPanel();

    fireEvent.change(input("Calze"), { target: { value: "1" } });
    fireEvent.click(confirm());

    expect(
      await screen.findByText("Errore imprevisto. Riprova."),
    ).toBeInTheDocument();
  });
});

describe("ReturnReceiptPanel — conferma", () => {
  async function confirmReturn() {
    renderPanel();
    fireEvent.change(input("Calze"), { target: { value: "1" } });
    fireEvent.click(confirm());
    await screen.findByText("Reso confermato");
  }

  it("mostra il progressivo e avvisa il parent", async () => {
    await confirmReturn();

    expect(screen.getByText("DCW2026/5111-2190")).toBeInTheDocument();
    expect(onReturned).toHaveBeenCalledWith("sale-uuid");
  });

  it("offre la ricevuta di reso da consegnare", async () => {
    await confirmReturn();

    expect(
      screen.getByRole("link", { name: /Ricevuta di reso/ }),
    ).toHaveAttribute("href", "/r/return-uuid");
  });

  it("stampa il reso riletto sulla termica", async () => {
    await confirmReturn();
    await waitFor(() =>
      expect(getReceiptDetail).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "return-uuid",
      ),
    );

    // La rilettura risolve in un microtask dopo la chiamata: lo si svuota
    // prima di cliccare, così il bottone porta già il reso stampabile.
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));

    await waitFor(() => expect(mockPrinter.current.print).toHaveBeenCalled());
    const printed = vi.mocked(mockPrinter.current.print).mock.calls[0][0];
    expect(printed.kind).toBe("RETURN");
  });

  it("rilettura fallita: la stampa ripiega sul PDF del reso", async () => {
    vi.mocked(getReceiptDetail).mockResolvedValue({
      item: null,
      error: "DB giù",
    });
    await confirmReturn();
    await waitFor(() => expect(getReceiptDetail).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));

    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        "/api/documents/return-uuid/pdf?qr=0",
        "_blank",
        "noopener,noreferrer",
      ),
    );
  });

  // Il reso è già trasmesso: una rilettura che lancia non deve mostrarlo
  // come fallito, o l'esercente lo rifarebbe.
  it("rilettura che lancia: resta sulla conferma, stampa dal PDF", async () => {
    vi.mocked(getReceiptDetail).mockRejectedValue(new Error("rete"));
    await confirmReturn();
    await waitFor(() => expect(getReceiptDetail).toHaveBeenCalled());

    expect(screen.getByText("Reso confermato")).toBeInTheDocument();
    expect(
      screen.queryByText("Errore imprevisto. Riprova."),
    ).not.toBeInTheDocument();
  });

  it("'Chiudi' chiude il dialog", async () => {
    await confirmReturn();

    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));

    expect(onClose).toHaveBeenCalled();
  });
});
