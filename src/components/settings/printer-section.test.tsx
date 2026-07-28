import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrinterSection } from "./printer-section";
import type { UsePrinterResult } from "@/hooks/use-printer";
import { readPrinterPreferences } from "@/lib/printing/printer-preferences";

/**
 * Si mocka l'hook e non il singleton: il componente va verificato per quello
 * che mostra a fronte di uno stato stampante, senza trascinarsi dietro il
 * trasporto Bluetooth (che in Node non è nemmeno risolvibile).
 */
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

beforeEach(() => {
  localStorage.clear();
  mockPrinter.current = printerState();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("stato della stampante", () => {
  it("dice che non c'è nessuna stampante quando non è mai stata collegata", () => {
    render(<PrinterSection />);
    expect(screen.getByText("Nessuna stampante")).toBeDefined();
  });

  it("mostra il nome della stampante nota anche quando è scollegata", () => {
    // Senza riconnessione silenziosa (getDevices è dietro flag) questo è
    // l'unico modo per non far sembrare all'utente di aver perso la stampante.
    mockPrinter.current = printerState({
      status: "disconnected",
      deviceName: "Munbyn ITPP047",
    });
    render(<PrinterSection />);
    expect(screen.getByText("Munbyn ITPP047")).toBeDefined();
    expect(screen.getByText("Non collegata")).toBeDefined();
  });

  it("offre Ricollega, non Collega, quando la stampante è già nota", () => {
    mockPrinter.current = printerState({ deviceName: "Munbyn ITPP047" });
    render(<PrinterSection />);
    expect(screen.getByRole("button", { name: /Ricollega/ })).toBeDefined();
  });

  it("offre Scollega quando è collegata", () => {
    mockPrinter.current = printerState({
      status: "connected",
      deviceName: "Munbyn ITPP047",
    });
    render(<PrinterSection />);
    expect(screen.getByRole("button", { name: "Scollega" })).toBeDefined();
  });
});

describe("azioni", () => {
  it("avvia l'accoppiamento al click", () => {
    const connect = vi.fn().mockResolvedValue(null);
    mockPrinter.current = printerState({ connect });
    render(<PrinterSection />);
    fireEvent.click(screen.getByRole("button", { name: /Collega stampante/ }));
    expect(connect).toHaveBeenCalled();
  });

  it("mostra un messaggio azionabile quando l'accoppiamento fallisce", async () => {
    mockPrinter.current = printerState({
      connect: vi.fn().mockResolvedValue("adapter-off"),
    });
    render(<PrinterSection />);
    fireEvent.click(screen.getByRole("button", { name: /Collega stampante/ }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Bluetooth");
    });
  });

  it("tiene la stampa di prova disabilitata finché non c'è una connessione", () => {
    render(<PrinterSection />);
    const button = screen.getByRole("button", { name: /Stampa di prova/ });
    expect(button).toHaveProperty("disabled", true);
  });

  it("conferma l'invio della stampa di prova", async () => {
    mockPrinter.current = printerState({ status: "connected" });
    render(<PrinterSection />);
    fireEvent.click(screen.getByRole("button", { name: /Stampa di prova/ }));
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("prova inviata");
    });
  });

  it("disabilita i comandi mentre un'operazione è in corso", () => {
    mockPrinter.current = printerState({ isBusy: true });
    render(<PrinterSection />);
    expect(
      screen.getByRole("button", { name: /Collega stampante/ }),
    ).toHaveProperty("disabled", true);
  });
});

describe("browser senza Web Bluetooth", () => {
  it("spiega perché e indica il PDF invece di sparire", () => {
    // Una card vuota sembrerebbe un bug; e su iOS non si può promettere il
    // Bluetooth (regola 8), ma nemmeno lasciare l'utente senza strada.
    mockPrinter.current = printerState({
      support: { status: "unsupported-browser" },
      canUseBluetooth: false,
    });
    render(<PrinterSection />);
    // Query per testo e non per ruolo: il messaggio è copy statico, non una
    // live region (vedi printer-section.tsx).
    expect(screen.getByText(/PDF/)).toBeDefined();
  });

  it("non offre l'accoppiamento dove non è possibile", () => {
    mockPrinter.current = printerState({
      support: { status: "unsupported-browser" },
      canUseBluetooth: false,
    });
    render(<PrinterSection />);
    expect(screen.queryByRole("button", { name: /Collega/ })).toBeNull();
  });

  it("suggerisce di aprire in Chrome quando siamo in una webview in-app", () => {
    mockPrinter.current = printerState({
      support: { status: "in-app-webview" },
      canUseBluetooth: false,
    });
    render(<PrinterSection />);
    expect(screen.getByText(/Chrome/)).toBeDefined();
  });
});

describe("preferenze", () => {
  it("parte con l'auto-stampa attiva", async () => {
    render(<PrinterSection />);
    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", { name: /Stampa automatica/ }),
      ).toHaveProperty("ariaChecked", "true");
    });
  });

  it("persiste la disattivazione dell'auto-stampa", async () => {
    render(<PrinterSection />);
    const checkbox = await screen.findByRole("checkbox", {
      name: /Stampa automatica/,
    });
    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(readPrinterPreferences().autoPrint).toBe(false);
    });
  });

  it("persiste la larghezza carta scelta", async () => {
    render(<PrinterSection />);
    fireEvent.click(screen.getByRole("button", { name: "80 mm" }));
    await waitFor(() => {
      expect(readPrinterPreferences().paperWidth).toBe("80");
    });
  });

  it("segnala quale larghezza è attiva", async () => {
    render(<PrinterSection />);
    await waitFor(() => {
      // Si legge l'attributo e non la property IDL: jsdom non riflette
      // aria-pressed su HTMLElement.ariaPressed.
      expect(
        screen
          .getByRole("button", { name: "58 mm" })
          .getAttribute("aria-pressed"),
      ).toBe("true");
    });
  });

  it("avverte che il QR non è supportato da tutte le stampanti economiche", () => {
    render(<PrinterSection />);
    expect(screen.getByText(/Non tutte le stampanti/)).toBeDefined();
  });
});
