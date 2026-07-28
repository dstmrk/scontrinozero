// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Il mock del trasporto è **obbligatorio**, non una comodità: il
 * `package.json` di `@point-of-sale/webbluetooth-receipt-printer@2` dichiara
 * negli `exports` la sola condition `browser` (niente `default`/`node`), quindi
 * senza mock la risoluzione del modulo fallisce prima ancora del test.
 *
 * La classe è dichiarata con `class` e le variabili del factory hanno prefisso
 * `mock` per l'hoisting di `vi.mock` (skill testing-patterns).
 */
const mockTransport = {
  connectSucceeds: true,
  connectThrows: false,
  printThrows: false,
  reconnectFindsDevice: true,
  printed: [] as Uint8Array[],
  disconnectCalls: 0,
  device: {
    type: "bluetooth" as const,
    name: "Munbyn ITPP047",
    id: "dev-1",
    // Profilo catch-all del trasporto: l'encoder v3 NON lo accetta.
    language: "esc-pos",
    codepageMapping: "default",
  },
};

vi.mock("@point-of-sale/webbluetooth-receipt-printer", () => {
  class MockWebBluetoothReceiptPrinter {
    private readonly listeners: Record<string, ((arg?: unknown) => void)[]> =
      {};

    addEventListener(event: string, cb: (arg?: unknown) => void) {
      (this.listeners[event] ??= []).push(cb);
    }

    /** Come il trasporto reale: gli handler girano su un macrotask. */
    private emit(event: string, arg?: unknown) {
      for (const cb of this.listeners[event] ?? []) {
        setTimeout(() => cb(arg), 0);
      }
    }

    async connect() {
      if (mockTransport.connectThrows) throw new Error("boom");
      // Il trasporto reale inghiotte gli errori: connect() risolve comunque e
      // l'unico segnale di successo è l'evento `connected`.
      if (mockTransport.connectSucceeds) {
        this.emit("connected", mockTransport.device);
      }
    }

    async reconnect() {
      if (mockTransport.reconnectFindsDevice) {
        this.emit("connected", mockTransport.device);
      }
    }

    async disconnect() {
      mockTransport.disconnectCalls += 1;
      this.emit("disconnected");
    }

    async print(data: Uint8Array) {
      if (mockTransport.printThrows) {
        throw new DOMException("GATT operation failed", "NetworkError");
      }
      mockTransport.printed.push(data);
    }

    async listen() {
      return true;
    }
  }
  return { default: MockWebBluetoothReceiptPrinter };
});

import {
  connectPrinter,
  disconnectPrinter,
  getPrinterSnapshot,
  printBytes,
  subscribePrinter,
  tryReconnectPrinter,
  resetPrinterStoreForTests,
  PrinterError,
} from "./bluetooth-printer";
import { readLastPrinter, writeLastPrinter } from "./printer-preferences";

function stubBluetoothAvailable(available = true) {
  vi.stubGlobal("navigator", {
    userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130",
    bluetooth: { getAvailability: async () => available },
  });
}

beforeEach(() => {
  localStorage.clear();
  resetPrinterStoreForTests();
  mockTransport.connectSucceeds = true;
  mockTransport.connectThrows = false;
  mockTransport.printThrows = false;
  mockTransport.reconnectFindsDevice = true;
  mockTransport.printed = [];
  mockTransport.disconnectCalls = 0;
  stubBluetoothAvailable();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  resetPrinterStoreForTests();
});

describe("stato iniziale", () => {
  it("parte da idle senza stampante", () => {
    expect(getPrinterSnapshot().status).toBe("idle");
  });

  it("ritorna uno snapshot stabile per useSyncExternalStore", () => {
    // Un nuovo oggetto a ogni chiamata manderebbe React in loop infinito.
    expect(getPrinterSnapshot()).toBe(getPrinterSnapshot());
  });

  it("mostra il nome dell'ultima stampante nota anche prima di collegarsi", () => {
    writeLastPrinter({ id: "dev-1", name: "Munbyn ITPP047" });
    resetPrinterStoreForTests();
    expect(getPrinterSnapshot().deviceName).toBe("Munbyn ITPP047");
  });
});

describe("connectPrinter", () => {
  it("passa a connected quando l'accoppiamento riesce", async () => {
    await connectPrinter();
    expect(getPrinterSnapshot().status).toBe("connected");
  });

  it("espone il nome della stampante collegata", async () => {
    await connectPrinter();
    expect(getPrinterSnapshot().deviceName).toBe("Munbyn ITPP047");
  });

  it("ricorda la stampante per i riavvii successivi", async () => {
    await connectPrinter();
    expect(readLastPrinter()).toEqual({ id: "dev-1", name: "Munbyn ITPP047" });
  });

  it("normalizza il profilo del trasporto per l'encoder", async () => {
    // `default` farebbe lanciare l'encoder v3: va scartato qui, non al momento
    // della stampa.
    await connectPrinter();
    expect(getPrinterSnapshot().codepageMapping).toBeUndefined();
  });

  it("notifica i subscriber al cambio di stato", async () => {
    const seen: string[] = [];
    subscribePrinter(() => seen.push(getPrinterSnapshot().status));
    await connectPrinter();
    expect(seen).toContain("connected");
  });

  it("smette di notificare dopo l'unsubscribe", async () => {
    const cb = vi.fn();
    const unsubscribe = subscribePrinter(cb);
    unsubscribe();
    await connectPrinter();
    expect(cb).not.toHaveBeenCalled();
  });

  it("segnala not-selected quando l'utente annulla il chooser", async () => {
    // Il trasporto inghiotte il rifiuto di requestDevice e risolve lo stesso:
    // l'assenza dell'evento `connected` è l'unico segnale disponibile.
    mockTransport.connectSucceeds = false;
    await expect(connectPrinter()).rejects.toMatchObject({
      code: "not-selected",
    });
  });

  it("torna a idle dopo un accoppiamento non riuscito, non resta su connecting", async () => {
    mockTransport.connectSucceeds = false;
    await expect(connectPrinter()).rejects.toThrow(PrinterError);
    expect(getPrinterSnapshot().status).not.toBe("connecting");
  });

  it("segnala adapter-off senza nemmeno aprire il chooser", async () => {
    // Diagnosi preventiva: aprire un chooser vuoto sembra un bug dell'app.
    stubBluetoothAvailable(false);
    await expect(connectPrinter()).rejects.toMatchObject({
      code: "adapter-off",
    });
  });

  it("segnala unsupported dove Web Bluetooth non esiste", async () => {
    vi.stubGlobal("navigator", { userAgent: "iPhone Safari" });
    await expect(connectPrinter()).rejects.toMatchObject({
      code: "unsupported",
    });
  });

  it("converte un throw inatteso del trasporto in PrinterError", async () => {
    mockTransport.connectThrows = true;
    await expect(connectPrinter()).rejects.toThrow(PrinterError);
  });
});

describe("printBytes", () => {
  it("manda i byte alla stampante collegata", async () => {
    await connectPrinter();
    await printBytes(new Uint8Array([1, 2, 3]));
    expect(mockTransport.printed).toHaveLength(1);
  });

  it("rifiuta con not-connected quando nessuna stampante è collegata", async () => {
    await expect(printBytes(new Uint8Array([1]))).rejects.toMatchObject({
      code: "not-connected",
    });
  });

  it("segnala unreachable quando la scrittura GATT fallisce", async () => {
    await connectPrinter();
    mockTransport.printThrows = true;
    await expect(printBytes(new Uint8Array([1]))).rejects.toMatchObject({
      code: "unreachable",
    });
  });

  it("marca la stampante come disconnessa dopo una scrittura fallita", async () => {
    // Stampante spenta o fuori portata: lo stato deve riflettere la realtà,
    // altrimenti la UI continua a dire "collegata" e l'auto-stampa insiste.
    await connectPrinter();
    mockTransport.printThrows = true;
    await expect(printBytes(new Uint8Array([1]))).rejects.toThrow();
    expect(getPrinterSnapshot().status).toBe("disconnected");
  });
});

describe("disconnectPrinter", () => {
  it("riporta lo stato a idle", async () => {
    await connectPrinter();
    await disconnectPrinter();
    expect(getPrinterSnapshot().status).toBe("idle");
  });

  it("dimentica la stampante: è una scelta esplicita dell'utente", async () => {
    await connectPrinter();
    await disconnectPrinter();
    expect(readLastPrinter()).toBeNull();
  });
});

describe("tryReconnectPrinter", () => {
  it("non fa nulla senza una stampante nota", async () => {
    await tryReconnectPrinter();
    expect(getPrinterSnapshot().status).toBe("idle");
  });

  it("si ricollega quando il browser espone ancora il device", async () => {
    writeLastPrinter({ id: "dev-1", name: "Munbyn ITPP047" });
    resetPrinterStoreForTests();
    await tryReconnectPrinter();
    expect(getPrinterSnapshot().status).toBe("connected");
  });

  it("non lancia quando la riconnessione silenziosa non è disponibile", async () => {
    // getDevices() è dietro flag su Chrome: il caso normale è che reconnect()
    // sia un no-op. Deve restare silenzioso, non diventare un errore in UI.
    mockTransport.reconnectFindsDevice = false;
    writeLastPrinter({ id: "dev-1", name: "Munbyn ITPP047" });
    resetPrinterStoreForTests();
    await expect(tryReconnectPrinter()).resolves.toBeUndefined();
  });

  it("tenta la riconnessione una volta sola per sessione", async () => {
    // Più componenti montano l'hook: senza guard partirebbero gatt.connect()
    // concorrenti sullo stesso device.
    writeLastPrinter({ id: "dev-1", name: "Munbyn ITPP047" });
    resetPrinterStoreForTests();
    mockTransport.reconnectFindsDevice = false;
    const spy = vi.spyOn(globalThis, "setTimeout");

    await tryReconnectPrinter();
    const callsAfterFirst = spy.mock.calls.length;
    await tryReconnectPrinter();

    expect(spy.mock.calls).toHaveLength(callsAfterFirst);
  });

  it("conserva il nome della stampante quando la riconnessione non riesce", async () => {
    mockTransport.reconnectFindsDevice = false;
    writeLastPrinter({ id: "dev-1", name: "Munbyn ITPP047" });
    resetPrinterStoreForTests();
    await tryReconnectPrinter();
    expect(getPrinterSnapshot().deviceName).toBe("Munbyn ITPP047");
  });
});
