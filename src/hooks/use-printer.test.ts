// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockState = {
  snapshot: {
    status: "idle" as string,
    deviceName: null as string | null,
    language: "esc-pos" as const,
    codepageMapping: undefined as string | undefined,
  },
  support: { status: "supported" } as { status: string },
  connectError: null as Error | null,
  printError: null as Error | null,
  reconnectCalls: 0,
  printedReceipts: [] as unknown[],
  testPrints: 0,
  tracked: [] as string[],
};

// La classe va dichiarata DENTRO il factory: `vi.mock` è hoistato sopra le
// const del modulo, e un riferimento valutato subito nell'oggetto di ritorno
// cadrebbe nella TDZ ("Cannot access before initialization"). I test la
// ottengono importandola dal modulo mockato.
vi.mock("@/lib/printing/bluetooth-printer", () => ({
  PrinterError: class MockPrinterError extends Error {
    readonly code: string;
    constructor(code: string) {
      super(code);
      this.name = "PrinterError";
      this.code = code;
    }
  },
  subscribePrinter: () => () => {},
  getPrinterSnapshot: () => mockState.snapshot,
  getPrinterServerSnapshot: () => mockState.snapshot,
  connectPrinter: async () => {
    if (mockState.connectError) throw mockState.connectError;
  },
  disconnectPrinter: async () => {},
  tryReconnectPrinter: async () => {
    mockState.reconnectCalls += 1;
  },
}));

vi.mock("@/lib/printing/support", () => ({
  getBluetoothPrintSupport: async () => mockState.support,
}));

vi.mock("@/lib/printing/print-receipt", () => ({
  printReceipt: async (receipt: unknown) => {
    if (mockState.printError) throw mockState.printError;
    mockState.printedReceipts.push(receipt);
  },
  printTestPage: async () => {
    if (mockState.printError) throw mockState.printError;
    mockState.testPrints += 1;
  },
}));

vi.mock("@/lib/umami", () => ({
  UMAMI_EVENTS: {
    printerPaired: "printer_paired",
    receiptPrinted: "receipt_printed",
  },
  track: (event: string) => mockState.tracked.push(event),
}));

import { usePrinter } from "./use-printer";
import { PrinterError } from "@/lib/printing/bluetooth-printer";

beforeEach(() => {
  mockState.snapshot = {
    status: "idle",
    deviceName: null,
    language: "esc-pos",
    codepageMapping: undefined,
  };
  mockState.support = { status: "supported" };
  mockState.connectError = null;
  mockState.printError = null;
  mockState.reconnectCalls = 0;
  mockState.printedReceipts = [];
  mockState.testPrints = 0;
  mockState.tracked = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("usePrinter — stato", () => {
  it("espone lo stato del singleton", () => {
    mockState.snapshot = { ...mockState.snapshot, status: "connected" };
    const { result } = renderHook(() => usePrinter());
    expect(result.current.status).toBe("connected");
  });

  it("rileva il supporto in modo asincrono", async () => {
    const { result } = renderHook(() => usePrinter());
    expect(result.current.support).toBeNull();
    await waitFor(() => expect(result.current.canUseBluetooth).toBe(true));
  });

  it("segnala canUseBluetooth falso dove il browser non supporta", async () => {
    mockState.support = { status: "unsupported-browser" };
    const { result } = renderHook(() => usePrinter());
    await waitFor(() => expect(result.current.support).not.toBeNull());
    expect(result.current.canUseBluetooth).toBe(false);
  });

  it("tenta la riconnessione silenziosa al mount", async () => {
    renderHook(() => usePrinter());
    await waitFor(() => expect(mockState.reconnectCalls).toBe(1));
  });
});

describe("usePrinter — azioni", () => {
  it("ritorna null quando la connessione riesce", async () => {
    const { result } = renderHook(() => usePrinter());
    let outcome: string | null = "x";
    await act(async () => {
      outcome = await result.current.connect();
    });
    expect(outcome).toBeNull();
  });

  it("traccia l'accoppiamento riuscito", async () => {
    const { result } = renderHook(() => usePrinter());
    await act(async () => {
      await result.current.connect();
    });
    expect(mockState.tracked).toContain("printer_paired");
  });

  it("propaga il codice d'errore invece di lanciare", async () => {
    // I call site sono handler di click: una promise rifiutata diventerebbe un
    // unhandled rejection per una condizione ordinaria (regola 20).
    mockState.connectError = new PrinterError("adapter-off");
    const { result } = renderHook(() => usePrinter());
    let outcome: string | null = null;
    await act(async () => {
      outcome = await result.current.connect();
    });
    expect(outcome).toBe("adapter-off");
  });

  it("non traccia l'accoppiamento quando fallisce", async () => {
    mockState.connectError = new PrinterError("not-selected");
    const { result } = renderHook(() => usePrinter());
    await act(async () => {
      await result.current.connect();
    });
    expect(mockState.tracked).not.toContain("printer_paired");
  });

  it("degrada un errore non tipizzato a unreachable", async () => {
    mockState.connectError = new Error("qualcosa di imprevisto");
    const { result } = renderHook(() => usePrinter());
    let outcome: string | null = null;
    await act(async () => {
      outcome = await result.current.connect();
    });
    expect(outcome).toBe("unreachable");
  });

  it("stampa lo scontrino e traccia l'evento", async () => {
    const { result } = renderHook(() => usePrinter());
    const receipt = { adeProgressive: "0001" } as never;
    await act(async () => {
      await result.current.print(receipt);
    });
    expect(mockState.printedReceipts).toHaveLength(1);
    expect(mockState.tracked).toContain("receipt_printed");
  });

  it("ritorna il codice d'errore quando la stampa fallisce", async () => {
    mockState.printError = new PrinterError("unreachable");
    const { result } = renderHook(() => usePrinter());
    let outcome: string | null = null;
    await act(async () => {
      outcome = await result.current.print({} as never);
    });
    expect(outcome).toBe("unreachable");
  });

  it("non traccia la stampa quando fallisce", async () => {
    mockState.printError = new PrinterError("not-connected");
    const { result } = renderHook(() => usePrinter());
    await act(async () => {
      await result.current.print({} as never);
    });
    expect(mockState.tracked).not.toContain("receipt_printed");
  });

  it("esegue la stampa di prova", async () => {
    const { result } = renderHook(() => usePrinter());
    await act(async () => {
      await result.current.testPrint();
    });
    expect(mockState.testPrints).toBe(1);
  });

  it("scollega senza propagare errori", async () => {
    const { result } = renderHook(() => usePrinter());
    await act(async () => {
      await expect(result.current.disconnect()).resolves.toBeUndefined();
    });
  });

  it("torna a non-busy dopo un'operazione fallita", async () => {
    // Se isBusy restasse true i bottoni resterebbero disabilitati per sempre.
    mockState.connectError = new PrinterError("adapter-off");
    const { result } = renderHook(() => usePrinter());
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.isBusy).toBe(false);
  });
});
