"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  connectPrinter,
  disconnectPrinter,
  getPrinterServerSnapshot,
  getPrinterSnapshot,
  subscribePrinter,
  tryReconnectPrinter,
  PrinterError,
  type PrintErrorCode,
  type PrinterStatus,
} from "@/lib/printing/bluetooth-printer";
import {
  getBluetoothPrintSupport,
  type BluetoothPrintSupport,
} from "@/lib/printing/support";
import type { PrintableReceipt } from "@/lib/printing/types";

export interface UsePrinterResult {
  readonly status: PrinterStatus;
  /** Nome dell'ultima stampante nota, anche quando non è collegata. */
  readonly deviceName: string | null;
  /** `null` finché la rilevazione non è conclusa (è asincrona). */
  readonly support: BluetoothPrintSupport | null;
  /** Scorciatoia: il browser può parlare con una stampante Bluetooth? */
  readonly canUseBluetooth: boolean;
  /** Un'operazione sulla stampante è in corso: disabilita i bottoni. */
  readonly isBusy: boolean;
  readonly connect: () => Promise<PrintErrorCode | null>;
  readonly disconnect: () => Promise<void>;
  readonly print: (receipt: PrintableReceipt) => Promise<PrintErrorCode | null>;
  readonly testPrint: () => Promise<PrintErrorCode | null>;
}

/**
 * Converte l'esito di un'operazione in un codice d'errore invece di lasciar
 * propagare l'eccezione: i call site sono handler di click, dove una promise
 * rifiutata diventerebbe un unhandled rejection (e una issue Sentry) per
 * quella che è una condizione ordinaria — Bluetooth spento, chooser annullato,
 * stampante fuori portata (regola 20).
 */
async function toErrorCode(
  operation: () => Promise<void>,
): Promise<PrintErrorCode | null> {
  try {
    await operation();
    return null;
  } catch (error) {
    return error instanceof PrinterError ? error.code : "unreachable";
  }
}

/**
 * Stato e azioni della stampante Bluetooth.
 *
 * Legge il singleton di modulo (`bluetooth-printer.ts`) via
 * `useSyncExternalStore`: la connessione GATT deve sopravvivere alle
 * navigazioni client-side, quindi non può vivere in uno stato React.
 */
export function usePrinter(): UsePrinterResult {
  const snapshot = useSyncExternalStore(
    subscribePrinter,
    getPrinterSnapshot,
    getPrinterServerSnapshot,
  );
  const [support, setSupport] = useState<BluetoothPrintSupport | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getBluetoothPrintSupport().then((result) => {
      if (active) setSupport(result);
    });
    // Tentativo di riconnessione silenziosa: nel caso normale è un no-op
    // (getDevices è dietro flag su Chrome) e non lancia mai.
    void tryReconnectPrinter();
    return () => {
      active = false;
    };
  }, []);

  const run = useCallback(
    async (operation: () => Promise<void>): Promise<PrintErrorCode | null> => {
      setIsBusy(true);
      try {
        return await toErrorCode(operation);
      } finally {
        setIsBusy(false);
      }
    },
    [],
  );

  const connect = useCallback(() => run(connectPrinter), [run]);

  const disconnect = useCallback(async () => {
    await disconnectPrinter();
  }, []);

  const print = useCallback(
    (receipt: PrintableReceipt) =>
      run(async () => {
        // Import dinamico: tiene l'encoder (~21 KB gz) fuori dal bundle
        // iniziale della cassa.
        const { printReceipt } = await import("@/lib/printing/print-receipt");
        await printReceipt(receipt);
      }),
    [run],
  );

  const testPrint = useCallback(
    () =>
      run(async () => {
        const { printTestPage } = await import("@/lib/printing/print-receipt");
        await printTestPage();
      }),
    [run],
  );

  return {
    status: snapshot.status,
    deviceName: snapshot.deviceName,
    support,
    canUseBluetooth: support?.status === "supported",
    isBusy,
    connect,
    disconnect,
    print,
    testPrint,
  };
}
