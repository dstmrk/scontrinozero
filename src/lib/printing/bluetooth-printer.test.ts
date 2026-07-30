// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Istanza del trasporto mockato: serve a distinguere quella invalidata da
 * quella ricreata dopo un timeout di stampa.
 */
interface MockPrinterInstance {
  readonly printCalls: number;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

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
  /**
   * Comportamento REALE della libreria su scrittura GATT fallita: `print()`
   * accoda i chunk in una coda interna il cui runner fa `await job()` senza
   * catch, e accoda la `resolve` come ultimo task. Se una
   * `writeValueWithResponse` rigetta, la promise di `print()` non si risolve
   * **né rigetta mai**. È il caso da modellare per default.
   */
  printHangs: false,
  /** Caso difensivo: un `print()` che rigetta (non è ciò che fa la v2). */
  printThrows: false,
  reconnectFindsDevice: true,
  /** GATT già caduto quando proviamo a chiudere la connessione. */
  disconnectThrows: false,
  /**
   * Caricamento del trasporto fallito: modella l'`import()` dinamico che
   * rigetta (rete assente al primo uso, chunk invalidato da un deploy). Il
   * costruttore che lancia produce la stessa promise rigettata cache-ata in
   * `transportReady` — il modulo mockato è risolto una volta sola da Vitest,
   * quindi il fallimento va iniettato nella factory dell'istanza.
   */
  transportLoadFails: false,
  printed: [] as Uint8Array[],
  disconnectCalls: 0,
  instances: [] as MockPrinterInstance[],
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

    printCalls = 0;

    constructor() {
      if (mockTransport.transportLoadFails) {
        throw new TypeError("Failed to fetch dynamically imported module");
      }
      mockTransport.instances.push(this);
    }

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
      if (mockTransport.disconnectThrows) {
        throw new DOMException("GATT Server is disconnected", "NetworkError");
      }
      this.emit("disconnected");
    }

    async print(data: Uint8Array) {
      this.printCalls += 1;
      if (mockTransport.printThrows) {
        throw new DOMException("GATT operation failed", "NetworkError");
      }
      if (mockTransport.printHangs) {
        // Mai settled, come la coda reale con una scrittura GATT rigettata.
        return new Promise<void>(() => {});
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
  PRINT_TIMEOUT_MS,
  type PrintErrorCode,
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
  mockTransport.printHangs = false;
  mockTransport.printThrows = false;
  mockTransport.reconnectFindsDevice = true;
  mockTransport.disconnectThrows = false;
  mockTransport.transportLoadFails = false;
  mockTransport.printed = [];
  mockTransport.disconnectCalls = 0;
  mockTransport.instances = [];
  // `device` è condiviso fra i test: il profilo va riportato a una stampante
  // ESC/POS ordinaria, altrimenti un test sul profilo `meow` sporca i seguenti.
  mockTransport.device.language = "esc-pos";
  stubBluetoothAvailable();
});

afterEach(() => {
  vi.useRealTimers();
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

describe("connectPrinter — stampante non ESC/POS (profilo `meow`)", () => {
  /**
   * Le "cat printer" economiche: il chooser del trasporto le mostra (service
   * `0000ae30`) ma parlano un raster proprietario. Accettarle significherebbe
   * "Collegata" in UI e caratteri casuali sullo scontrino consegnato al
   * cliente — un fallimento silenzioso su un documento fiscale.
   */
  beforeEach(() => {
    mockTransport.device.language = "meow";
  });

  it("rifiuta l'accoppiamento con incompatible-printer invece di dire Collegata", async () => {
    await expect(connectPrinter()).rejects.toMatchObject({
      code: "incompatible-printer",
    });
  });

  it("non marca la stampante come collegata", async () => {
    await expect(connectPrinter()).rejects.toThrow(PrinterError);
    expect(getPrinterSnapshot().status).toBe("idle");
  });

  it("non salva l'accoppiamento: non va riproposta al prossimo avvio", async () => {
    await expect(connectPrinter()).rejects.toThrow(PrinterError);
    expect(readLastPrinter()).toBeNull();
  });

  it("chiude il GATT invece di lasciare la connessione appesa", async () => {
    await expect(connectPrinter()).rejects.toThrow(PrinterError);
    expect(mockTransport.disconnectCalls).toBe(1);
  });

  it("resta idle anche dopo il `disconnected` in coda dal rifiuto", async () => {
    // `disconnect()` emette l'evento su un macrotask successivo: senza
    // invalidare il trasporto lo stato finirebbe su `disconnected`, cioè la UI
    // offrirebbe "Ricollega" proprio sulla stampante appena rifiutata.
    await expect(connectPrinter()).rejects.toThrow(PrinterError);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getPrinterSnapshot().status).toBe("idle");
  });

  it("rifiuta comunque se il GATT è già caduto mentre lo chiudiamo", async () => {
    // La chiusura è pulizia, non il rifiuto: se fallisce non deve trasformarsi
    // in un unhandled rejection né mascherare il vero motivo (regola 20).
    mockTransport.disconnectThrows = true;

    await expect(connectPrinter()).rejects.toMatchObject({
      code: "incompatible-printer",
    });
    expect(getPrinterSnapshot().status).toBe("idle");
  });

  it("lascia ricollegare una stampante compatibile subito dopo", async () => {
    await expect(connectPrinter()).rejects.toThrow(PrinterError);

    mockTransport.device.language = "esc-pos";
    await connectPrinter();

    expect(getPrinterSnapshot().status).toBe("connected");
  });

  it("resta silenziosa sulla riconnessione automatica", async () => {
    // `tryReconnectPrinter` gira al mount: un accoppiamento salvato prima di
    // questo rifiuto non deve diventare un errore in UI (regola 20).
    writeLastPrinter({ id: "dev-1", name: "Cat Printer" });
    resetPrinterStoreForTests();
    mockTransport.device.language = "meow";

    await expect(tryReconnectPrinter()).resolves.toBeUndefined();
    expect(getPrinterSnapshot().status).not.toBe("connected");
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

  it("segnala unreachable quando la scrittura GATT rigetta", async () => {
    // Caso difensivo: la v2 non rigetta mai (vedi `printHangs`), ma una
    // versione futura potrebbe.
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

describe("printBytes — coda GATT bloccata (print mai settled)", () => {
  /** Porta una stampa appesa fino allo scadere del timeout. */
  async function printUntilTimeout(): Promise<PrintErrorCode | undefined> {
    mockTransport.printHangs = true;
    vi.useFakeTimers();
    let code: PrintErrorCode | undefined;
    const pending = printBytes(new Uint8Array([1])).catch((error: unknown) => {
      code = error instanceof PrinterError ? error.code : undefined;
    });
    await vi.advanceTimersByTimeAsync(PRINT_TIMEOUT_MS);
    await pending;
    vi.useRealTimers();
    return code;
  }

  it("rigetta unreachable allo scadere del timeout invece di restare appesa", async () => {
    // Senza il race l'hook resterebbe `isBusy` per sempre: spinner infinito
    // sul bottone Stampa e nessun messaggio all'utente.
    await connectPrinter();
    expect(await printUntilTimeout()).toBe("unreachable");
  });

  it("porta lo snapshot a disconnected allo scadere del timeout", async () => {
    await connectPrinter();
    await printUntilTimeout();
    expect(getPrinterSnapshot().status).toBe("disconnected");
  });

  it("ricrea il trasporto al Ricollega: il vecchio non riceve più stampe", async () => {
    // La coda interna dell'istanza è irrecuperabile: senza invalidare il
    // singleton la stampa resterebbe rotta fino al reload della pagina.
    await connectPrinter();
    await printUntilTimeout();

    mockTransport.printHangs = false;
    await connectPrinter();
    await printBytes(new Uint8Array([2]));

    expect(mockTransport.instances.map((instance) => instance.printCalls))
      // vecchio: solo la stampa appesa · nuovo: solo quella riuscita
      .toEqual([1, 1]);
  });

  it("ignora gli eventi del trasporto invalidato dopo il timeout", async () => {
    // Il vecchio trasporto può ancora emettere `disconnected` (GATT che cade
    // davvero): non deve sporcare lo stato della connessione nuova.
    await connectPrinter();
    await printUntilTimeout();
    mockTransport.printHangs = false;
    await connectPrinter();

    await mockTransport.instances[0].disconnect();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getPrinterSnapshot().status).toBe("connected");
  });

  it("non torna `connected` se il trasporto invalidato emette `connected`", async () => {
    // Riconnessione tardiva dell'istanza morta: la sua coda resta comunque
    // bloccata, dire "collegata" manderebbe l'utente a stampare nel vuoto.
    await connectPrinter();
    await printUntilTimeout();

    await mockTransport.instances[0].connect();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getPrinterSnapshot().status).toBe("disconnected");
  });

  it("non applica il timeout quando la stampa va a buon fine", async () => {
    await connectPrinter();
    vi.useFakeTimers();
    await printBytes(new Uint8Array([1]));
    await vi.advanceTimersByTimeAsync(PRINT_TIMEOUT_MS * 2);

    expect(getPrinterSnapshot().status).toBe("connected");
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

  it("resta idle anche dopo il `disconnected` in coda dallo scollegamento", async () => {
    // `disconnect()` emette l'evento su un macrotask successivo: senza il
    // guard nel listener lo stato finirebbe su `disconnected`, cioè la UI
    // offrirebbe "Ricollega" sulla stampante appena scollegata a mano.
    // L'asserzione sincrona da sola non vedrebbe la regressione.
    await connectPrinter();
    await disconnectPrinter();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getPrinterSnapshot().status).toBe("idle");
  });

  it("non fa riemergere il nome della stampante col `disconnected` in ritardo", async () => {
    await connectPrinter();
    await disconnectPrinter();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getPrinterSnapshot().deviceName).toBeNull();
  });

  it("mostra disconnected quando il GATT cade mentre la stampante è collegata", async () => {
    // Contro-prova del guard: la perdita reale della stampante va comunque
    // mostrata QUANDO accade, non scoperta al primo scontrino che non esce.
    await connectPrinter();

    await mockTransport.instances[0].disconnect();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getPrinterSnapshot().status).toBe("disconnected");
  });
});

describe("caricamento del trasporto fallito", () => {
  /**
   * L'`import()` dinamico può rigettare: rete assente al primo uso della
   * stampante nella sessione, o chunk invalidato da un deploy. La promise
   * **rigettata** non deve restare cache-ata nel singleton, altrimenti ogni
   * tentativo successivo rifallisce anche a rete tornata, fino al reload
   * della pagina. Stesso pattern di invalidazione di `withPrintTimeout`.
   */
  it("segnala not-selected quando il trasporto non si carica", async () => {
    mockTransport.transportLoadFails = true;
    await expect(connectPrinter()).rejects.toMatchObject({
      code: "not-selected",
    });
  });

  it("riparte da un import pulito al tentativo successivo", async () => {
    mockTransport.transportLoadFails = true;
    await expect(connectPrinter()).rejects.toThrow(PrinterError);

    mockTransport.transportLoadFails = false;
    await connectPrinter();

    expect(getPrinterSnapshot().status).toBe("connected");
  });

  it("non lascia la riconnessione automatica bloccata dal caricamento fallito", async () => {
    // `tryReconnectPrinter` gira al mount, spesso prima di qualsiasi gesto
    // utente: è il candidato naturale a bruciare l'unico import.
    writeLastPrinter({ id: "dev-1", name: "Munbyn ITPP047" });
    resetPrinterStoreForTests();
    mockTransport.transportLoadFails = true;
    await tryReconnectPrinter();

    mockTransport.transportLoadFails = false;
    await connectPrinter();

    expect(getPrinterSnapshot().status).toBe("connected");
  });

  it("resta idle dopo un caricamento fallito, non su connecting", async () => {
    mockTransport.transportLoadFails = true;
    await expect(connectPrinter()).rejects.toThrow(PrinterError);
    expect(getPrinterSnapshot().status).toBe("idle");
  });

  it("continua a rigettare finché il caricamento resta rotto", async () => {
    // Il reset non deve trasformare un fallimento persistente in un successo
    // silenzioso: ogni tentativo riprova davvero e riporta l'errore.
    mockTransport.transportLoadFails = true;
    await expect(connectPrinter()).rejects.toThrow(PrinterError);
    await expect(connectPrinter()).rejects.toThrow(PrinterError);
    expect(getPrinterSnapshot().status).toBe("idle");
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
