/**
 * Singleton client-side della connessione alla stampante Bluetooth.
 *
 * Stessa forma di `src/lib/pwa/install-prompt-store.ts`: stato a livello di
 * modulo, `subscribe`/`getSnapshot` per `useSyncExternalStore`, guard SSR e un
 * reset esportato per i test.
 *
 * **Perché un singleton e non uno stato React.** `navigator.bluetooth.getDevices()`
 * — la riconnessione silenziosa a un device già autorizzato — è dietro flag su
 * Chrome, Android incluso (MDN BCD). Non potendo contarci, la connessione GATT
 * va tenuta viva per tutta la sessione: un modulo sopravvive alle navigazioni
 * client-side, e la cassa in PWA resta aperta tutto il giorno. Così
 * l'accoppiamento è *una volta all'apertura*, non a ogni scontrino.
 *
 * **Perché wrappare il trasporto invece di usarlo nudo.** `connect()` di
 * `@point-of-sale/webbluetooth-receipt-printer@2` cattura ogni errore in un
 * `console.log` e risolve comunque: chiamandolo direttamente non si distingue
 * "l'utente ha annullato il chooser" da "connesso". Qui l'esito si deduce
 * dall'evento `connected`, e i fallimenti diventano `PrinterError` tipizzati
 * che la UI può tradurre in un messaggio azionabile.
 */

import { getBluetoothPrintSupport } from "./support";
import {
  clearLastPrinter,
  readLastPrinter,
  writeLastPrinter,
} from "./printer-preferences";
import {
  isIncompatiblePrinterLanguage,
  resolveCodepageMapping,
  resolvePrinterLanguage,
} from "./printer-profile";
import type { PrinterLanguage } from "./types";

export type PrinterStatus =
  /** Nessuna stampante collegata. */
  | "idle"
  /** Chooser aperto o handshake GATT in corso. */
  | "connecting"
  | "connected"
  /** Era collegata e non lo è più: la UI deve offrire "Ricollega". */
  | "disconnected";

export type PrintErrorCode =
  /** Web Bluetooth assente (iOS, Firefox, webview in-app). */
  | "unsupported"
  /** Adattatore Bluetooth spento. */
  | "adapter-off"
  /** Chooser annullato o nessuna stampante selezionata. */
  | "not-selected"
  /** Stampa richiesta senza una connessione attiva. */
  | "not-connected"
  /** La scrittura GATT è fallita: stampante spenta, fuori portata o occupata. */
  | "unreachable"
  /** Il dispositivo scelto non parla ESC/POS: accoppiamento rifiutato. */
  | "incompatible-printer";

export class PrinterError extends Error {
  readonly code: PrintErrorCode;

  constructor(code: PrintErrorCode, message?: string) {
    super(message ?? code);
    this.name = "PrinterError";
    this.code = code;
  }
}

export interface PrinterSnapshot {
  readonly status: PrinterStatus;
  /** Nome dell'ultima stampante nota, anche quando non è collegata. */
  readonly deviceName: string | null;
  /** Linguaggio già normalizzato per l'encoder. */
  readonly language: PrinterLanguage;
  /** Mapping codepage normalizzato; `undefined` = auto-selezione. */
  readonly codepageMapping?: string;
}

type Transport = import("@point-of-sale/webbluetooth-receipt-printer").default;
type ConnectedDevice =
  import("@point-of-sale/webbluetooth-receipt-printer").ConnectedPrinterDevice;

const IDLE_SNAPSHOT: PrinterSnapshot = {
  status: "idle",
  deviceName: null,
  language: "esc-pos",
};

let snapshot: PrinterSnapshot = IDLE_SNAPSHOT;
let transport: Transport | null = null;
let transportReady: Promise<Transport> | null = null;
let initialized = false;
/** La riconnessione automatica si tenta una volta per sessione: più componenti
 * montano l'hook e senza guard partirebbero `gatt.connect()` concorrenti. */
let reconnectAttempted = false;
/** L'ultimo `connected` osservato era hardware non ESC/POS: lo legge
 * `connectPrinter` dopo il flush per trasformarlo in un errore in UI. */
let incompatiblePrinter = false;
const subscribers = new Set<() => void>();

/** Sostituisce lo snapshot solo quando cambia davvero: `useSyncExternalStore`
 * richiede un riferimento stabile, altrimenti React va in loop. */
function setSnapshot(patch: Partial<PrinterSnapshot>): void {
  const next: PrinterSnapshot = { ...snapshot, ...patch };
  const changed = (Object.keys(next) as (keyof PrinterSnapshot)[]).some(
    (key) => next[key] !== snapshot[key],
  );
  if (!changed) return;
  snapshot = next;
  for (const notify of subscribers) notify();
}

/** Idratazione pigra dal `localStorage`: mostra "Munbyn — non collegata"
 * invece di "nessuna stampante" quando la riconnessione silenziosa non c'è. */
function hydrateLastPrinter(): void {
  if (initialized || globalThis.window === undefined) return;
  initialized = true;
  const last = readLastPrinter();
  if (last) setSnapshot({ deviceName: last.name });
}

/**
 * Chiude un accoppiamento con hardware che non parla ESC/POS.
 *
 * Il singleton viene invalidato **prima** di chiudere il GATT: `disconnect()`
 * emette il suo evento su un macrotask successivo, e senza invalidazione quel
 * `disconnected` in ritardo porterebbe lo snapshot su `disconnected` — che per
 * contratto significa "era collegata, offri Ricollega", esattamente ciò che non
 * vogliamo su una stampante appena rifiutata. Stesso pattern di
 * `withPrintTimeout`.
 */
function rejectIncompatibleDevice(): void {
  incompatiblePrinter = true;
  const rejected = transport;
  transport = null;
  transportReady = null;
  setSnapshot({ status: "idle" });
  // L'accoppiamento non viene memorizzato (`writeLastPrinter` mai chiamata):
  // la riconnessione automatica non riproporrà questo dispositivo.
  void rejected?.disconnect().catch(() => {
    // Il GATT si chiuderà comunque alla chiusura della pagina.
  });
}

function onConnected(device: ConnectedDevice): void {
  if (isIncompatiblePrinterLanguage(device.language)) {
    // Il chooser del trasporto include anche stampanti non ESC/POS (le "cat
    // printer", service 0000ae30). Normalizzare il loro profilo a `esc-pos`
    // farebbe passare l'accoppiamento e uscire caratteri casuali da uno
    // scontrino già emesso: qui l'incompatibilità è certa, va detta subito.
    rejectIncompatibleDevice();
    return;
  }

  writeLastPrinter({ id: device.id, name: device.name });
  setSnapshot({
    status: "connected",
    deviceName: device.name,
    // I nomi di profilo del trasporto non sono sempre validi per l'encoder:
    // si normalizzano QUI, non al momento della stampa, così un profilo
    // sconosciuto non fa fallire uno scontrino già emesso.
    language: resolvePrinterLanguage(device.language),
    codepageMapping: resolveCodepageMapping(device.codepageMapping),
  });
}

/**
 * Istanzia il trasporto una sola volta. L'`import()` è dinamico così i ~2 KB
 * della libreria (e i ~21 KB gz dell'encoder) restano fuori dal bundle
 * iniziale: chi non stampa non li scarica.
 */
async function getTransport(): Promise<Transport> {
  transportReady ??= import("@point-of-sale/webbluetooth-receipt-printer")
    .then((mod) => {
      const instance = new mod.default();
      // `isCurrent` scarta gli eventi di un'istanza già invalidata (vedi
      // `printBytes`): un `disconnected` in ritardo dal trasporto vecchio non
      // deve marcare offline la connessione nuova.
      const isCurrent = () => transport === instance;
      instance.addEventListener("connected", (device) => {
        if (isCurrent()) onConnected(device);
      });
      instance.addEventListener("disconnected", () => {
        // Perdere la stampante va mostrato QUANDO accade, non scoperto al
        // primo scontrino che non esce — ma solo se eravamo davvero in linea.
        // Il trasporto emette `disconnected` su un macrotask successivo: dopo
        // uno "Scollega" esplicito (o dopo il rifiuto di un device non
        // ESC/POS) quell'evento arriva a snapshot già resettato, e applicarlo
        // porterebbe su `disconnected` — che per contratto significa "era
        // collegata, offri Ricollega". Una disconnessione notificata da
        // `idle`/`disconnected` non è un'informazione.
        if (!isCurrent()) return;
        if (snapshot.status !== "connected" && snapshot.status !== "connecting")
          return;
        setSnapshot({ status: "disconnected" });
      });
      transport = instance;
      return instance;
    })
    .catch((error: unknown) => {
      // Senza questo reset la promise RIGETTATA resterebbe assegnata a
      // `transportReady`: rete assente al primo uso o chunk invalidato da un
      // deploy renderebbero la stampante inutilizzabile fino al reload della
      // pagina, anche a rete tornata. Stessa invalidazione del singleton di
      // `withPrintTimeout`, qui sul path di caricamento.
      transport = null;
      transportReady = null;
      throw error;
    });
  return transportReady;
}

/**
 * Cede un macrotask per lasciar girare i listener del trasporto, che emette
 * gli eventi con `setTimeout(…, 0)`. Dopo questo yield lo snapshot riflette
 * l'esito della `connect()` appena attesa.
 */
function flushTransportEvents(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function assertBluetoothUsable(): Promise<void> {
  const support = await getBluetoothPrintSupport();
  if (support.status === "adapter-off") {
    throw new PrinterError("adapter-off", "Bluetooth spento");
  }
  if (support.status !== "supported") {
    throw new PrinterError("unsupported", "Web Bluetooth non disponibile");
  }
}

export function subscribePrinter(callback: () => void): () => void {
  hydrateLastPrinter();
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function getPrinterSnapshot(): PrinterSnapshot {
  hydrateLastPrinter();
  return snapshot;
}

/** Snapshot lato server: nessuna stampante, nessun accesso a `navigator`. */
export function getPrinterServerSnapshot(): PrinterSnapshot {
  return IDLE_SNAPSHOT;
}

/**
 * Apre il chooser Bluetooth. Va chiamata da un gesto utente.
 *
 * @throws {PrinterError} `unsupported` | `adapter-off` | `not-selected`
 */
export async function connectPrinter(): Promise<void> {
  await assertBluetoothUsable();
  incompatiblePrinter = false;
  setSnapshot({ status: "connecting" });

  try {
    const printer = await getTransport();
    await printer.connect();
    await flushTransportEvents();
  } catch (error) {
    setSnapshot({ status: "idle" });
    throw new PrinterError(
      "not-selected",
      error instanceof Error ? error.message : undefined,
    );
  }

  if (incompatiblePrinter) {
    // Distinto da `not-selected`: qui l'utente ha scelto, ed è il dispositivo
    // a non andare bene. Dirgli "riprova" lo manderebbe in loop.
    throw new PrinterError(
      "incompatible-printer",
      "Stampante non compatibile ESC/POS",
    );
  }

  if (snapshot.status !== "connected") {
    // connect() ha risolto senza emettere `connected`: chooser annullato,
    // oppure handshake GATT fallito. Il trasporto non distingue i due casi.
    setSnapshot({ status: "idle" });
    throw new PrinterError("not-selected", "Nessuna stampante selezionata");
  }
}

/**
 * Tenta la riconnessione silenziosa a una stampante già autorizzata.
 *
 * Nel caso normale è un **no-op**: il trasporto esce subito se
 * `navigator.bluetooth.getDevices` non esiste (flag Chrome). Non lancia mai —
 * girando al mount, un errore qui sarebbe rumore in UI, non un'informazione.
 */
export async function tryReconnectPrinter(): Promise<void> {
  hydrateLastPrinter();
  if (reconnectAttempted || snapshot.status === "connected") return;
  reconnectAttempted = true;

  const last = readLastPrinter();
  if (!last) return;

  const support = await getBluetoothPrintSupport();
  if (support.status !== "supported") return;

  try {
    const printer = await getTransport();
    await printer.reconnect({ id: last.id });
    await flushTransportEvents();
  } catch {
    // Silenzio deliberato: la stampante resta "nota ma non collegata" e
    // l'utente ha comunque il bottone "Ricollega".
  }
}

export async function disconnectPrinter(): Promise<void> {
  try {
    if (transport) await transport.disconnect();
  } catch {
    // Se il GATT era già caduto poco importa: si prosegue col reset locale.
  }
  // Scollegare è una scelta esplicita: si dimentica anche l'accoppiamento,
  // altrimenti la UI continuerebbe a proporre "Ricollega" a chi non vuole più
  // quella stampante.
  clearLastPrinter();
  setSnapshot({
    status: "idle",
    deviceName: null,
    language: "esc-pos",
    codepageMapping: undefined,
  });
}

/**
 * Tetto di attesa per una singola stampa.
 *
 * Una ricevuta 58mm sono pochi KB, spediti in chunk da 100 byte: i casi
 * legittimi chiudono in pochi secondi anche su una stampante lenta. 15s è
 * abbondante e resta sotto la soglia in cui chi è al banco pensa che l'app sia
 * bloccata.
 */
export const PRINT_TIMEOUT_MS = 15_000;

/**
 * Corsa fra la stampa e il timeout — l'unico modo di uscire da una scrittura
 * GATT fallita.
 *
 * `print()` di `@point-of-sale/webbluetooth-receipt-printer@2` accoda i chunk
 * in una coda interna il cui runner fa `await job()` **senza catch**, e accoda
 * la `resolve` come ultimo task: se una `writeValueWithResponse` rigetta
 * (stampante spenta → `NetworkError`) la promise ritornata non si risolve né
 * rigetta MAI, e la coda resta `_working` per sempre. Senza questo race
 * `printBytes` non tornerebbe più: spinner infinito sul bottone Stampa e
 * trasporto inutilizzabile fino al reload della pagina.
 *
 * Allo scadere il singleton viene **invalidato**: la coda dell'istanza è
 * irrecuperabile, il prossimo "Ricollega" deve ricostruire il trasporto.
 */
function withPrintTimeout(pending: Promise<void>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      transport = null;
      transportReady = null;
      reject(new PrinterError("unreachable", "Timeout di stampa"));
    }, PRINT_TIMEOUT_MS);
    pending.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * Invia byte già codificati alla stampante.
 *
 * @throws {PrinterError} `not-connected` | `unreachable`
 */
export async function printBytes(bytes: Uint8Array): Promise<void> {
  if (snapshot.status !== "connected" || !transport) {
    throw new PrinterError("not-connected", "Nessuna stampante collegata");
  }

  try {
    await withPrintTimeout(transport.print(bytes));
  } catch (error) {
    // Stampante spenta, fuori portata o carta finita: lo stato deve riflettere
    // la realtà, altrimenti l'auto-stampa continua a insistere a vuoto.
    setSnapshot({ status: "disconnected" });
    if (error instanceof PrinterError) throw error;
    throw new PrinterError(
      "unreachable",
      error instanceof Error ? error.message : undefined,
    );
  }
}

/** Azzera il modulo fra un test e l'altro (solo per i test). */
export function resetPrinterStoreForTests(): void {
  snapshot = IDLE_SNAPSHOT;
  transport = null;
  transportReady = null;
  initialized = false;
  reconnectAttempted = false;
  incompatiblePrinter = false;
  subscribers.clear();
}
