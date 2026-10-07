// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CapacitorBridge } from "@/lib/native/native-shell";
import {
  NATIVE_CHUNK_SIZE,
  NativeBleReceiptPrinter,
  getNativeBleSupport,
  resetNativeBleForTests,
  toHex,
} from "./native-ble-transport";

const SERVICE_18F0 = "000018f0-0000-1000-8000-00805f9b34fb";
const CHAR_2AF1 = "00002af1-0000-1000-8000-00805f9b34fb";
const SERVICE_ISSC = "49535343-fe7d-4ae5-8fa9-9fafd205e455";
const CHAR_ISSC = "49535343-8841-43f4-a8d4-ecbe34729bb3";

type Call = { method: string; options: Record<string, unknown> };

interface FakeOptions {
  device?: { deviceId: string; name?: string };
  services?: unknown[];
  known?: { deviceId: string; name?: string }[];
  enabled?: boolean;
  fail?: Record<string, Error>;
}

/** Bridge finto del plugin BluetoothLe: registra le chiamate e gli ascoltatori. */
function fakeBridge(opts: FakeOptions = {}) {
  const calls: Call[] = [];
  const listeners = new Map<string, (data: { url?: string }) => void>();
  const removed: string[] = [];
  const device = opts.device ?? { deviceId: "dev-1", name: "Printer001" };
  const services = opts.services ?? [
    {
      uuid: SERVICE_18F0,
      characteristics: [{ uuid: CHAR_2AF1, properties: { write: true } }],
    },
  ];
  const bridge: CapacitorBridge = {
    isNativePlatform: () => true,
    nativePromise: vi.fn(
      async (plugin: string, method: string, options?: unknown) => {
        expect(plugin).toBe("BluetoothLe");
        calls.push({
          method,
          options: (options ?? {}) as Record<string, unknown>,
        });
        const failure = opts.fail?.[method];
        if (failure) throw failure;
        switch (method) {
          case "requestDevice":
            return device;
          case "getDevices":
            return { devices: opts.known ?? [device] };
          case "getServices":
            return { services };
          case "isEnabled":
            return { value: opts.enabled ?? true };
          default:
            return {};
        }
      },
    ),
    addListener: vi.fn(
      (
        _plugin: string,
        event: string,
        cb: (data: { url?: string }) => void,
      ) => {
        listeners.set(event, cb);
        return {
          remove: () => {
            removed.push(event);
          },
        };
      },
    ),
  };
  const emit = (event: string) => listeners.get(event)?.({});
  const methods = () => calls.map((c) => c.method);
  return { bridge, calls, methods, emit, removed };
}

beforeEach(() => {
  resetNativeBleForTests();
});

describe("toHex", () => {
  it("due cifre minuscole per byte, senza separatori", () => {
    expect(toHex(new Uint8Array([0, 10, 255, 27]))).toBe("000aff1b");
  });
});

describe("NativeBleReceiptPrinter.connect", () => {
  it("inizializza, apre il selettore filtrato sui servizi delle stampanti e si collega", async () => {
    const { bridge, calls, methods } = fakeBridge();
    const printer = new NativeBleReceiptPrinter(bridge);
    const connected = vi.fn();
    printer.addEventListener("connected", connected);

    await printer.connect();

    expect(methods()).toEqual([
      "initialize",
      "requestDevice",
      "connect",
      "getServices",
    ]);
    expect(calls[0].options).toEqual({ androidNeverForLocation: true });
    expect(calls[1].options).toEqual({
      services: [SERVICE_18F0, SERVICE_ISSC],
    });
    expect(connected).toHaveBeenCalledWith({
      type: "bluetooth",
      name: "Printer001",
      id: "dev-1",
      language: "esc-pos",
      codepageMapping: "xprinter",
    });
  });

  it.each([
    ["BlueTooth Printer", SERVICE_18F0, CHAR_2AF1, "esc-pos", "zjiang"],
    ["MPT-II", SERVICE_18F0, CHAR_2AF1, "esc-pos", "mpt"],
    ["MUNBYN ITPP047", SERVICE_18F0, CHAR_2AF1, "esc-pos", "default"],
    ["TM-P20II", SERVICE_ISSC, CHAR_ISSC, "esc-pos", "epson"],
    ["STAR L200", SERVICE_ISSC, CHAR_ISSC, "star-line", "star"],
  ])(
    "%s → profilo dello stesso trasporto web",
    async (name, service, characteristic, language, codepageMapping) => {
      const { bridge } = fakeBridge({
        device: { deviceId: "d", name },
        services: [
          {
            uuid: service,
            characteristics: [
              { uuid: characteristic, properties: { write: true } },
            ],
          },
        ],
      });
      const printer = new NativeBleReceiptPrinter(bridge);
      const connected = vi.fn();
      printer.addEventListener("connected", connected);

      await printer.connect();

      expect(connected).toHaveBeenCalledWith(
        expect.objectContaining({ language, codepageMapping }),
      );
    },
  );

  it("una stampante senza nome usa un'etichetta leggibile", async () => {
    const { bridge } = fakeBridge({ device: { deviceId: "d" } });
    const printer = new NativeBleReceiptPrinter(bridge);
    const connected = vi.fn();
    printer.addEventListener("connected", connected);

    await printer.connect();

    expect(connected).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Stampante Bluetooth" }),
    );
  });

  it("selettore annullato: rigetta e non emette connected", async () => {
    const { bridge, methods } = fakeBridge({
      fail: { requestDevice: new Error("requestDevice cancelled") },
    });
    const printer = new NativeBleReceiptPrinter(bridge);
    const connected = vi.fn();
    printer.addEventListener("connected", connected);

    await expect(printer.connect()).rejects.toThrow("cancelled");
    expect(connected).not.toHaveBeenCalled();
    expect(methods()).not.toContain("connect");
  });

  it("senza caratteristica di stampa si scollega e rigetta", async () => {
    const { bridge, methods, removed } = fakeBridge({
      services: [{ uuid: SERVICE_18F0, characteristics: [] }],
    });
    const printer = new NativeBleReceiptPrinter(bridge);
    const connected = vi.fn();
    printer.addEventListener("connected", connected);

    await expect(printer.connect()).rejects.toThrow(/servizio di stampa/i);
    expect(connected).not.toHaveBeenCalled();
    expect(methods()).toContain("disconnect");
    expect(removed).toEqual(["disconnected|dev-1"]);
  });

  it("connessione GATT fallita: stacca l'ascoltatore e rigetta", async () => {
    const { bridge, removed } = fakeBridge({
      fail: { connect: new Error("Connection timeout") },
    });
    const printer = new NativeBleReceiptPrinter(bridge);

    await expect(printer.connect()).rejects.toThrow("timeout");
    expect(removed).toEqual(["disconnected|dev-1"]);
  });

  it("lettura dei servizi fallita: chiude il link appena aperto", async () => {
    const { bridge, methods, removed } = fakeBridge({
      fail: { getServices: new Error("Service discovery timeout") },
    });
    const printer = new NativeBleReceiptPrinter(bridge);

    await expect(printer.connect()).rejects.toThrow("discovery");
    expect(methods().at(-1)).toBe("disconnect");
    expect(removed).toEqual(["disconnected|dev-1"]);
  });

  it("un secondo collegamento chiude prima quello in corso", async () => {
    const { bridge, calls } = fakeBridge();
    const printer = new NativeBleReceiptPrinter(bridge);
    await printer.connect();
    calls.length = 0;

    await printer.connect();

    expect(calls.map((c) => c.method)).toEqual([
      "requestDevice",
      "disconnect",
      "connect",
      "getServices",
    ]);
  });

  it("senza bridge nativo rigetta subito", async () => {
    const printer = new NativeBleReceiptPrinter(null);
    await expect(printer.connect()).rejects.toThrow(/bridge/i);
  });
});

describe("NativeBleReceiptPrinter.reconnect", () => {
  it("ritrova la stampante per id e si ricollega senza selettore", async () => {
    const { bridge, calls, methods } = fakeBridge();
    const printer = new NativeBleReceiptPrinter(bridge);
    const connected = vi.fn();
    printer.addEventListener("connected", connected);

    await printer.reconnect({ id: "dev-1" });

    expect(methods()).toEqual([
      "initialize",
      "getDevices",
      "connect",
      "getServices",
    ]);
    expect(calls[1].options).toEqual({ deviceIds: ["dev-1"] });
    expect(connected).toHaveBeenCalledOnce();
  });

  it("stampante non più nota al sistema: nessun tentativo, nessun errore", async () => {
    const { bridge, methods } = fakeBridge({ known: [] });
    const printer = new NativeBleReceiptPrinter(bridge);

    await printer.reconnect({ id: "dev-1" });

    expect(methods()).not.toContain("connect");
  });
});

describe("NativeBleReceiptPrinter.print", () => {
  async function connectedPrinter(opts: FakeOptions = {}) {
    const fake = fakeBridge(opts);
    const printer = new NativeBleReceiptPrinter(fake.bridge);
    await printer.connect();
    fake.calls.length = 0;
    return { ...fake, printer };
  }

  it("spezza i byte in chunk e li scrive con risposta, in ordine", async () => {
    const { printer, calls } = await connectedPrinter();
    const bytes = new Uint8Array(NATIVE_CHUNK_SIZE * 2 + 5).map((_, i) => i);

    await printer.print(bytes);

    expect(calls.map((c) => c.method)).toEqual(["write", "write", "write"]);
    expect(calls[0].options).toMatchObject({
      deviceId: "dev-1",
      service: SERVICE_18F0,
      characteristic: CHAR_2AF1,
      value: toHex(bytes.subarray(0, NATIVE_CHUNK_SIZE)),
    });
    expect(calls[2].options.value).toBe(
      toHex(bytes.subarray(NATIVE_CHUNK_SIZE * 2)),
    );
  });

  it("usa writeWithoutResponse se la caratteristica accetta solo quello", async () => {
    const { printer, calls } = await connectedPrinter({
      services: [
        {
          uuid: SERVICE_18F0,
          characteristics: [
            {
              uuid: CHAR_2AF1,
              properties: { write: false, writeWithoutResponse: true },
            },
          ],
        },
      ],
    });

    await printer.print(new Uint8Array([1, 2]));

    expect(calls.map((c) => c.method)).toEqual(["writeWithoutResponse"]);
  });

  it("una scrittura fallita rigetta e interrompe i chunk successivi", async () => {
    const { printer, bridge, calls } = await connectedPrinter();
    vi.mocked(bridge.nativePromise!).mockRejectedValueOnce(
      new Error("Write timeout"),
    );

    await expect(
      printer.print(new Uint8Array(NATIVE_CHUNK_SIZE * 3)),
    ).rejects.toThrow("Write timeout");
    expect(calls).toHaveLength(0);
  });

  it("senza connessione rigetta", async () => {
    const { bridge } = fakeBridge();
    const printer = new NativeBleReceiptPrinter(bridge);

    await expect(printer.print(new Uint8Array([1]))).rejects.toThrow(
      /collegata/i,
    );
  });
});

describe("NativeBleReceiptPrinter disconnessione", () => {
  it("una caduta del link emette disconnected", async () => {
    const { bridge, emit } = fakeBridge();
    const printer = new NativeBleReceiptPrinter(bridge);
    const disconnected = vi.fn();
    printer.addEventListener("disconnected", disconnected);
    await printer.connect();

    emit("disconnected|dev-1");

    expect(disconnected).toHaveBeenCalledOnce();
    await expect(printer.print(new Uint8Array([1]))).rejects.toThrow();
  });

  it("disconnect esplicito: chiude il link e stacca l'ascoltatore, senza evento", async () => {
    const { bridge, calls, removed } = fakeBridge();
    const printer = new NativeBleReceiptPrinter(bridge);
    const disconnected = vi.fn();
    printer.addEventListener("disconnected", disconnected);
    await printer.connect();

    await printer.disconnect();

    expect(calls.at(-1)).toEqual({
      method: "disconnect",
      options: { deviceId: "dev-1" },
    });
    expect(removed).toEqual(["disconnected|dev-1"]);
    expect(disconnected).not.toHaveBeenCalled();
  });

  it("disconnect senza stampante collegata non chiama il plugin", async () => {
    const { bridge, methods } = fakeBridge();
    await new NativeBleReceiptPrinter(bridge).disconnect();
    expect(methods()).toEqual([]);
  });
});

describe("getNativeBleSupport", () => {
  it("senza attivazione e mai inizializzato: supportato, senza toccare il plugin", async () => {
    // Su iOS il primo `initialize` fa comparire la richiesta di permesso:
    // non deve partire alla schermata dello scontrino emesso.
    const { bridge, methods } = fakeBridge();

    await expect(getNativeBleSupport(bridge, false)).resolves.toBe("supported");
    expect(methods()).toEqual([]);
  });

  it("con attivazione: inizializza e legge lo stato dell'adattatore", async () => {
    const { bridge, methods } = fakeBridge({ enabled: false });

    await expect(getNativeBleSupport(bridge, true)).resolves.toBe(
      "adapter-off",
    );
    expect(methods()).toEqual(["initialize", "isEnabled"]);
  });

  it("dopo un'inizializzazione riuscita legge lo stato anche senza attivazione", async () => {
    const { bridge, methods } = fakeBridge();
    await getNativeBleSupport(bridge, true);

    await expect(getNativeBleSupport(bridge, false)).resolves.toBe("supported");
    expect(methods()).toEqual(["initialize", "isEnabled", "isEnabled"]);
  });

  it("permesso negato o plugin assente: unavailable, e si ritenta la volta dopo", async () => {
    const { bridge, methods } = fakeBridge({
      fail: { initialize: new Error("BLE permission denied") },
    });

    await expect(getNativeBleSupport(bridge, true)).resolves.toBe(
      "unavailable",
    );
    await getNativeBleSupport(bridge, true);
    expect(methods()).toEqual(["initialize", "initialize"]);
  });

  it("senza bridge: unavailable", async () => {
    await expect(getNativeBleSupport(null, true)).resolves.toBe("unavailable");
  });
});
