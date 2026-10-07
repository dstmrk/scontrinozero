/**
 * Trasporto BLE nativo per la stampa, usato nell'app (docs/mobile-v2.md,
 * slice 4).
 *
 * Nel guscio Capacitor `navigator.bluetooth` non esiste: la WebView di Android
 * non implementa Web Bluetooth e WKWebView nemmeno. La stampa passa dal plugin
 * `@capacitor-community/bluetooth-le`, installato in `mobile/`, che su iOS usa
 * CoreBluetooth (BLE, nessuna certificazione MFi).
 *
 * Espone la stessa superficie del trasporto web
 * (`@point-of-sale/webbluetooth-receipt-printer`): `connect`, `reconnect`,
 * `disconnect`, `print` e gli eventi `connected`/`disconnected`. Così lo store
 * di `bluetooth-printer.ts` e l'encoder ESC/POS restano quelli di sempre; cambia
 * solo chi porta i byte.
 *
 * Il plugin si chiama dal bridge (`window.Capacitor`), come la cattura SPID:
 * il bundle web non dipende da `@capacitor/core`, e un deploy del web non può
 * portare un wrapper JS più nuovo del plugin compilato nell'app.
 */

import type { ConnectedPrinterDevice } from "@point-of-sale/webbluetooth-receipt-printer";
import {
  getCapacitorBridge,
  type CapacitorBridge,
} from "@/lib/native/native-shell";

const PLUGIN = "BluetoothLe";

/** Service della maggioranza delle stampantine BT economiche (POS-58, Xprinter, Munbyn…). */
const SERVICE_18F0 = "000018f0-0000-1000-8000-00805f9b34fb";
/** Service ISSC usato da Epson TM-P e Star SM-L. */
const SERVICE_ISSC = "49535343-fe7d-4ae5-8fa9-9fafd205e455";

const PRINT_CHARACTERISTICS: Readonly<Record<string, string>> = {
  [SERVICE_18F0]: "00002af1-0000-1000-8000-00805f9b34fb",
  [SERVICE_ISSC]: "49535343-8841-43f4-a8d4-ecbe34729bb3",
};

/**
 * Byte per scrittura: gli stessi 100 del trasporto web. Una scrittura con
 * risposta oltre l'MTU diventa una long write, che le stampanti gestiscono.
 */
export const NATIVE_CHUNK_SIZE = 100;

const CONNECT_TIMEOUT_MS = 10_000;

interface BleDevice {
  deviceId: string;
  name?: string;
}

interface BleService {
  uuid: string;
  characteristics: {
    uuid: string;
    properties?: { write?: boolean; writeWithoutResponse?: boolean };
  }[];
}

interface PrintTarget {
  service: string;
  characteristic: string;
  withResponse: boolean;
}

interface OpenDevice extends PrintTarget {
  id: string;
}

/**
 * Linguaggio e mapping codepage per nome e service, ricopiati dalla tabella
 * profili del trasporto web per le sole stampanti ESC/POS e Star: le "cat
 * printer" non passano nemmeno dal selettore. I nomi restano quelli del
 * trasporto; li normalizza lo store (`printer-profile.ts`).
 */
function profileFor(
  service: string,
  name: string,
): Pick<ConnectedPrinterDevice, "language" | "codepageMapping"> {
  if (service === SERVICE_ISSC) {
    return name.startsWith("STAR L")
      ? { language: "star-line", codepageMapping: "star" }
      : { language: "esc-pos", codepageMapping: "epson" };
  }
  const byName: Record<string, string> = {
    "BlueTooth Printer": "zjiang",
    Printer001: "xprinter",
    "MPT-II": "mpt",
  };
  return { language: "esc-pos", codepageMapping: byName[name] ?? "default" };
}

function findPrintTarget(services: readonly BleService[]): PrintTarget | null {
  for (const service of services) {
    const uuid = PRINT_CHARACTERISTICS[service.uuid];
    if (!uuid) continue;
    const characteristic = service.characteristics.find((c) => c.uuid === uuid);
    if (!characteristic) continue;
    const props = characteristic.properties ?? {};
    return {
      service: service.uuid,
      characteristic: uuid,
      // Come il trasporto web: con risposta, salvo stampanti che accettano
      // solo la scrittura senza.
      withResponse: !(props.write === false && props.writeWithoutResponse),
    };
  }
  return null;
}

/** Il plugin vuole i byte come stringa esadecimale. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function requireCall(bridge: CapacitorBridge | null) {
  const call = bridge?.nativePromise;
  if (!bridge || !call) throw new Error("Bridge nativo non disponibile.");
  return <T>(method: string, options: Record<string, unknown> = {}) =>
    call.call(bridge, PLUGIN, method, options) as Promise<T>;
}

/**
 * `initialize` una volta per sessione: su iOS crea il CBCentralManager e la
 * prima volta mostra la richiesta di permesso. Una promessa rigettata
 * (permesso negato, plugin assente in una build vecchia) non resta in cache:
 * concesso il permesso, il tentativo successivo riparte.
 */
let initialized: Promise<void> | null = null;
let initializedOk = false;

function initializeBle(bridge: CapacitorBridge | null): Promise<void> {
  initialized ??= requireCall(bridge)<void>("initialize", {
    // Su Android 12+ la ricerca BLE non chiede la posizione.
    androidNeverForLocation: true,
  }).then(
    () => {
      initializedOk = true;
    },
    (error: unknown) => {
      initialized = null;
      throw error;
    },
  );
  return initialized;
}

/**
 * Supporto BLE nell'app. Senza `activate`, e prima di qualunque
 * inizializzazione, risponde "supported" senza toccare il plugin: la richiesta
 * di permesso deve partire dal gesto «Collega stampante», non dalla schermata
 * dello scontrino emesso di chi una stampante non ce l'ha.
 */
export async function getNativeBleSupport(
  bridge: CapacitorBridge | null,
  activate: boolean,
): Promise<"supported" | "adapter-off" | "unavailable"> {
  if (!activate && !initializedOk && bridge) return "supported";
  try {
    await initializeBle(bridge);
    const { value } = await requireCall(bridge)<{ value: boolean }>(
      "isEnabled",
    );
    return value ? "supported" : "adapter-off";
  } catch {
    return "unavailable";
  }
}

type ConnectedListener = (device: ConnectedPrinterDevice) => void;
type DisconnectedListener = () => void;

export class NativeBleReceiptPrinter {
  readonly #bridge: CapacitorBridge | null;
  #device: OpenDevice | null = null;
  #disconnectHandle: { remove: () => unknown } | null = null;
  readonly #connected = new Set<ConnectedListener>();
  readonly #disconnected = new Set<DisconnectedListener>();

  constructor(bridge: CapacitorBridge | null = getCapacitorBridge()) {
    this.#bridge = bridge;
  }

  addEventListener(event: "connected", listener: ConnectedListener): void;
  addEventListener(event: "disconnected", listener: DisconnectedListener): void;
  addEventListener(
    event: "connected" | "disconnected",
    listener: ConnectedListener | DisconnectedListener,
  ): void {
    if (event === "connected") {
      this.#connected.add(listener as ConnectedListener);
    } else {
      this.#disconnected.add(listener as DisconnectedListener);
    }
  }

  /** Apre il selettore nativo, filtrato sui service delle stampanti. */
  async connect(): Promise<void> {
    const call = requireCall(this.#bridge);
    await initializeBle(this.#bridge);
    const device = await call<BleDevice>("requestDevice", {
      services: [SERVICE_18F0, SERVICE_ISSC],
    });
    await this.#open(device);
  }

  /**
   * Riconnessione silenziosa a una stampante già scelta: a differenza del web
   * (dove `getDevices` è dietro flag) qui funziona, e la stampante si
   * ricollega all'apertura dell'app.
   */
  async reconnect(lastUsedDevice: { id: string }): Promise<void> {
    const call = requireCall(this.#bridge);
    await initializeBle(this.#bridge);
    const { devices } = await call<{ devices: BleDevice[] }>("getDevices", {
      deviceIds: [lastUsedDevice.id],
    });
    const device = devices[0];
    if (device) await this.#open(device);
  }

  async disconnect(): Promise<void> {
    const device = this.#device;
    this.#detach();
    if (device) {
      await requireCall(this.#bridge)("disconnect", { deviceId: device.id });
    }
  }

  async print(data: Uint8Array): Promise<void> {
    const device = this.#device;
    if (!device) throw new Error("Nessuna stampante collegata.");
    const call = requireCall(this.#bridge);
    const method = device.withResponse ? "write" : "writeWithoutResponse";
    for (let offset = 0; offset < data.length; offset += NATIVE_CHUNK_SIZE) {
      // I chunk vanno scritti in ordine, uno alla volta: in parallelo la
      // stampante riceverebbe i byte mescolati.
      const chunk = {
        deviceId: device.id,
        service: device.service,
        characteristic: device.characteristic,
        value: toHex(data.subarray(offset, offset + NATIVE_CHUNK_SIZE)),
      };
      await call(method, chunk); // NOSONAR — scrittura sequenziale per design
    }
  }

  async #open(device: BleDevice): Promise<void> {
    const call = requireCall(this.#bridge);
    const id = device.deviceId;
    // Una sola stampante per volta: il link precedente non resta aperto
    // dietro a quello nuovo.
    const previous = this.#device;
    if (previous) {
      this.#detach();
      await call("disconnect", { deviceId: previous.id }).catch(
        () => undefined,
      );
    }
    // L'ascoltatore va registrato prima di `connect`: il plugin notifica la
    // caduta del link su `disconnected|<id>`.
    this.#disconnectHandle =
      this.#bridge?.addListener?.(PLUGIN, `disconnected|${id}`, () => {
        if (this.#device?.id !== id) return;
        this.#detach();
        for (const listener of this.#disconnected) listener();
      }) ?? null;

    let target: PrintTarget | null;
    try {
      await call("connect", { deviceId: id, timeout: CONNECT_TIMEOUT_MS });
      const { services } = await call<{ services: BleService[] }>(
        "getServices",
        { deviceId: id },
      );
      target = findPrintTarget(services);
      if (!target) {
        throw new Error("Il dispositivo non espone un servizio di stampa.");
      }
    } catch (error) {
      // Qualunque fallimento dopo l'apertura lascia il link chiuso e
      // l'ascoltatore staccato: niente connessioni fantasma.
      this.#detach();
      await call("disconnect", { deviceId: id }).catch(() => undefined);
      throw error;
    }

    this.#device = { id, ...target };
    const name = device.name || "Stampante Bluetooth";
    const event: ConnectedPrinterDevice = {
      type: "bluetooth",
      name,
      id,
      ...profileFor(target.service, name),
    };
    for (const listener of this.#connected) listener(event);
  }

  #detach(): void {
    this.#device = null;
    this.#disconnectHandle?.remove();
    this.#disconnectHandle = null;
  }
}

/** Azzera lo stato di modulo fra un test e l'altro (solo per i test). */
export function resetNativeBleForTests(): void {
  initialized = null;
  initializedOk = false;
}
