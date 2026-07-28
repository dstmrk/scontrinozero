import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrintReceiptButton } from "./print-receipt-button";
import type { UsePrinterResult } from "@/hooks/use-printer";
import type { PrintableReceipt } from "@/lib/printing/types";

const mockPrinter: { current: UsePrinterResult } = {
  current: {} as UsePrinterResult,
};

vi.mock("@/hooks/use-printer", () => ({
  usePrinter: () => mockPrinter.current,
}));

function printerState(overrides: Partial<UsePrinterResult> = {}) {
  return {
    status: "idle",
    deviceName: null,
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

const RECEIPT: PrintableReceipt = {
  header: {
    businessName: "Bar da Mario",
    vatNumber: "12345678901",
    address: null,
    city: null,
    province: null,
    zipCode: null,
  },
  lines: [
    {
      description: "Caffè",
      quantity: "1",
      grossUnitPrice: "1.20",
      vatCode: "22",
    },
  ],
  paymentMethod: "PC",
  createdAt: new Date("2026-07-28T12:32:00Z"),
  adeProgressive: "0001-0042",
};

const PDF_HREF = "/api/documents/doc-1/pdf";
let openSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPrinter.current = printerState();
  openSpy = vi.fn();
  vi.stubGlobal("open", openSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("etichetta", () => {
  it('dice sempre e solo "Stampa", senza nominare il Bluetooth', () => {
    // Su iPhone il Bluetooth non esiste: nominarlo nel bottone principale
    // prometterebbe una feature non disponibile (regola 8).
    render(<PrintReceiptButton receipt={RECEIPT} pdfHref={PDF_HREF} />);
    expect(screen.getByRole("button", { name: /Stampa/ })).toBeDefined();
    expect(screen.queryByText(/Bluetooth/)).toBeNull();
  });
});

describe("stampante collegata", () => {
  it("stampa direttamente senza chiedere nulla", async () => {
    const print = vi.fn().mockResolvedValue(null);
    mockPrinter.current = printerState({ status: "connected", print });
    render(<PrintReceiptButton receipt={RECEIPT} pdfHref={PDF_HREF} />);

    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));
    await waitFor(() => expect(print).toHaveBeenCalledWith(RECEIPT));
  });

  it("conferma visivamente l'avvenuta stampa", async () => {
    mockPrinter.current = printerState({ status: "connected" });
    render(<PrintReceiptButton receipt={RECEIPT} pdfHref={PDF_HREF} />);

    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));
    await waitFor(() => expect(screen.getByText("Stampato")).toBeDefined());
  });

  it("mostra un messaggio azionabile se la stampante non risponde", async () => {
    mockPrinter.current = printerState({
      status: "connected",
      print: vi.fn().mockResolvedValue("unreachable"),
    });
    render(<PrintReceiptButton receipt={RECEIPT} pdfHref={PDF_HREF} />);

    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("accesa");
    });
  });

  it("non apre il PDF quando la stampa diretta riesce", async () => {
    mockPrinter.current = printerState({ status: "connected" });
    render(<PrintReceiptButton receipt={RECEIPT} pdfHref={PDF_HREF} />);

    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));
    await waitFor(() => expect(screen.getByText("Stampato")).toBeDefined());
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe("Bluetooth disponibile ma nessuna stampante", () => {
  it("offre di collegarne una oppure di stampare il PDF", async () => {
    render(<PrintReceiptButton receipt={RECEIPT} pdfHref={PDF_HREF} />);
    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Collega stampante" }),
      ).toBeDefined();
    });
    expect(screen.getByRole("button", { name: "Stampa il PDF" })).toBeDefined();
  });

  it("collega e stampa in un solo passaggio", async () => {
    const connect = vi.fn().mockImplementation(async () => {
      mockPrinter.current = printerState({ status: "connected", connect });
      return null;
    });
    const print = vi.fn().mockResolvedValue(null);
    mockPrinter.current = printerState({ connect, print });

    render(<PrintReceiptButton receipt={RECEIPT} pdfHref={PDF_HREF} />);
    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Collega stampante" }),
    );

    await waitFor(() => expect(print).toHaveBeenCalled());
  });

  it("propone di ricollegare quando la stampante è nota ma scollegata", async () => {
    mockPrinter.current = printerState({
      status: "disconnected",
      deviceName: "Munbyn ITPP047",
    });
    render(<PrintReceiptButton receipt={RECEIPT} pdfHref={PDF_HREF} />);
    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Ricollega e stampa" }),
      ).toBeDefined();
    });
  });

  it("nomina la stampante scollegata, invece di dire genericamente che non c'è", async () => {
    mockPrinter.current = printerState({
      status: "disconnected",
      deviceName: "Munbyn ITPP047",
    });
    render(<PrintReceiptButton receipt={RECEIPT} pdfHref={PDF_HREF} />);
    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));

    await waitFor(() => {
      expect(screen.getByText(/Munbyn ITPP047/)).toBeDefined();
    });
  });

  it("apre il PDF dalla scelta", async () => {
    render(<PrintReceiptButton receipt={RECEIPT} pdfHref={PDF_HREF} />);
    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Stampa il PDF" }),
    );

    expect(openSpy).toHaveBeenCalledWith(
      PDF_HREF,
      "_blank",
      "noopener,noreferrer",
    );
  });
});

describe("browser senza Web Bluetooth", () => {
  it("apre subito il PDF senza passare da nessuna scelta", async () => {
    // iOS/Firefox: proporre un accoppiamento impossibile sarebbe un vicolo cieco.
    mockPrinter.current = printerState({
      support: { status: "unsupported-browser" },
      canUseBluetooth: false,
    });
    render(<PrintReceiptButton receipt={RECEIPT} pdfHref={PDF_HREF} />);
    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));

    await waitFor(() => expect(openSpy).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("dati scontrino incompleti", () => {
  it("ripiega sul PDF quando manca l'intestazione dell'esercente", async () => {
    mockPrinter.current = printerState({ status: "connected" });
    render(<PrintReceiptButton receipt={null} pdfHref={PDF_HREF} />);
    fireEvent.click(screen.getByRole("button", { name: /Stampa/ }));

    await waitFor(() => expect(openSpy).toHaveBeenCalled());
  });
});
