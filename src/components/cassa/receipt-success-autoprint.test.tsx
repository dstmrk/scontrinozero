import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ReceiptSuccess } from "./receipt-success";
import type { UsePrinterResult } from "@/hooks/use-printer";
import type { CartLine } from "@/types/cassa";
import type { ReceiptPrintHeader } from "@/lib/printing/types";
import { writePrinterPreferences } from "@/lib/printing/printer-preferences";

/**
 * Test dedicato all'auto-stampa: sta in un file a parte perché
 * `receipt-success.test.tsx` gira con i fake timer, che mal si sposano con i
 * `waitFor` asincroni di questi casi.
 */
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

const HEADER: ReceiptPrintHeader = {
  businessName: "Bar da Mario",
  vatNumber: "12345678901",
  address: null,
  city: null,
  province: null,
  zipCode: null,
};

const LINES: CartLine[] = [
  {
    id: "l1",
    description: "Caffè",
    quantity: 2,
    grossUnitPrice: 1.2,
    vatCode: "22",
  },
];

function renderSuccess(props: Record<string, unknown> = {}) {
  return render(
    <ReceiptSuccess
      documentId="doc-1"
      adeProgressive="0001-0042"
      adeTransactionId="tx-1"
      createdAt="2026-07-28T12:32:00.000Z"
      lines={LINES}
      paymentMethod="PC"
      lotteryCode={null}
      printHeader={HEADER}
      onNewReceipt={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
  mockPrinter.current = printerState();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("auto-stampa", () => {
  it("stampa da sola quando la stampante è collegata", async () => {
    const print = vi.fn().mockResolvedValue(null);
    mockPrinter.current = printerState({ print });
    renderSuccess();
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it("usa la data del documento, non quella del client", async () => {
    // A cavallo della mezzanotte un `new Date()` lato client stamperebbe il
    // giorno sbagliato su un documento fiscale.
    const print = vi.fn().mockResolvedValue(null);
    mockPrinter.current = printerState({ print });
    renderSuccess();
    await waitFor(() => expect(print).toHaveBeenCalled());
    expect(print.mock.calls[0][0].createdAt).toEqual(
      new Date("2026-07-28T12:32:00.000Z"),
    );
  });

  it("stampa una sola volta anche se il componente ri-renderizza", async () => {
    const print = vi.fn().mockResolvedValue(null);
    mockPrinter.current = printerState({ print });
    const { rerender } = renderSuccess();
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));

    rerender(
      <ReceiptSuccess
        documentId="doc-1"
        adeProgressive="0001-0042"
        createdAt="2026-07-28T12:32:00.000Z"
        lines={LINES}
        paymentMethod="PC"
        lotteryCode={null}
        printHeader={HEADER}
        onNewReceipt={vi.fn()}
      />,
    );
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("non stampa quando l'auto-stampa è disattivata", async () => {
    writePrinterPreferences({ autoPrint: false });
    const print = vi.fn().mockResolvedValue(null);
    mockPrinter.current = printerState({ print });
    renderSuccess();
    expect(await screen.findByText("Scontrino emesso")).toBeDefined();
    expect(print).not.toHaveBeenCalled();
  });

  it("non stampa senza una stampante collegata", async () => {
    const print = vi.fn().mockResolvedValue(null);
    mockPrinter.current = printerState({ status: "idle", print });
    renderSuccess();
    expect(await screen.findByText("Scontrino emesso")).toBeDefined();
    expect(print).not.toHaveBeenCalled();
  });

  it("non stampa quando la stampante si collega dopo il mount", async () => {
    // Regressione: con la stampante non collegata all'emissione, l'utente tocca
    // "Stampa" → "Ricollega e stampa". La connessione ri-renderizza questa
    // schermata; se l'effect fosse ancora armato stamperebbe qui, e subito dopo
    // il bottone stamperebbe di nuovo → due copie cartacee dello stesso
    // documento.
    const print = vi.fn().mockResolvedValue(null);
    mockPrinter.current = printerState({ status: "idle", print });
    const { rerender } = renderSuccess();
    expect(await screen.findByText("Scontrino emesso")).toBeDefined();

    mockPrinter.current = printerState({ status: "connected", print });
    rerender(
      <ReceiptSuccess
        documentId="doc-1"
        adeProgressive="0001-0042"
        createdAt="2026-07-28T12:32:00.000Z"
        lines={LINES}
        paymentMethod="PC"
        lotteryCode={null}
        printHeader={HEADER}
        onNewReceipt={vi.fn()}
      />,
    );

    expect(print).not.toHaveBeenCalled();
  });

  it("non stampa senza intestazione esercente", async () => {
    const print = vi.fn().mockResolvedValue(null);
    mockPrinter.current = printerState({ print });
    renderSuccess({ printHeader: null });
    expect(await screen.findByText("Scontrino emesso")).toBeDefined();
    expect(print).not.toHaveBeenCalled();
  });

  it("stampa quando i dati dello scontrino arrivano dopo il mount", async () => {
    // L'effect si "arma" sulla prima valutazione con uno scontrino
    // stampabile, non sul mount: se l'intestazione arriva un render dopo, con
    // la stampante già collegata l'auto-stampa deve comunque partire (una
    // volta sola).
    const print = vi.fn().mockResolvedValue(null);
    mockPrinter.current = printerState({ print });
    const { rerender } = renderSuccess({ printHeader: null });
    expect(await screen.findByText("Scontrino emesso")).toBeDefined();
    expect(print).not.toHaveBeenCalled();

    rerender(
      <ReceiptSuccess
        documentId="doc-1"
        adeProgressive="0001-0042"
        createdAt="2026-07-28T12:32:00.000Z"
        lines={LINES}
        paymentMethod="PC"
        lotteryCode={null}
        printHeader={HEADER}
        onNewReceipt={vi.fn()}
      />,
    );

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it("mostra comunque lo scontrino emesso se la stampa fallisce", async () => {
    // Il punto centrale: un fallimento di stampa non è un fallimento di
    // emissione. Lo scontrino è già stato trasmesso all'AdE.
    const print = vi.fn().mockResolvedValue("unreachable");
    mockPrinter.current = printerState({ print });
    renderSuccess();
    await waitFor(() => expect(print).toHaveBeenCalled());
    expect(screen.getByText("Scontrino emesso")).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Nuovo scontrino/ }),
    ).toBeDefined();
  });

  it("lascia il bottone Stampa per ristampare", async () => {
    renderSuccess();
    // L'`expect` attorno alla findBy non è ornamentale: è l'unica asserzione
    // del test, e senza scatterebbe S6661 (Blocker).
    expect(await screen.findByRole("button", { name: /Stampa/ })).toBeDefined();
  });
});
