/**
 * Preferenze di stampa e memoria dell'ultima stampante — **per dispositivo**.
 *
 * Non vanno in DB: una stampante è fisicamente attaccata a un telefono, non a
 * un account. Stesso ragionamento del tema in
 * `src/components/settings/theme-section.tsx`. L'accesso passa sempre da
 * `safeLocalStorage`, che assorbe i browser dove anche solo *leggere*
 * `window.localStorage` lancia `SecurityError` (incidente SCONTRINOZERO-H).
 */

import { safeLocalStorage } from "@/lib/safe-storage";
import { PAPER_COLUMNS, type PaperWidth } from "./types";

const PREFERENCES_KEY = "sz_printer_prefs";
const LAST_PRINTER_KEY = "sz_printer_last";

export interface PrinterPreferences {
  /** Stampa lo scontrino appena l'AdE conferma, senza un tap in più. */
  readonly autoPrint: boolean;
  readonly paperWidth: PaperWidth;
  /** Stampa il QR della ricevuta digitale in coda allo scontrino. */
  readonly printQr: boolean;
}

export const DEFAULT_PRINTER_PREFERENCES: PrinterPreferences = {
  // Default ON: al banco lo scontrino deve uscire da solo. Chi non lo vuole
  // lo disattiva dalle impostazioni.
  autoPrint: true,
  paperWidth: "58",
  printQr: true,
};

/** Riferimento all'ultima stampante accoppiata su questo dispositivo. */
export interface LastPrinter {
  readonly id: string;
  readonly name: string;
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Chiave scritta da una versione precedente o manomessa: si riparte dai
    // default invece di rompere la pagina impostazioni.
    return null;
  }
}

function isPaperWidth(value: unknown): value is PaperWidth {
  return typeof value === "string" && value in PAPER_COLUMNS;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Legge le preferenze, normalizzando ogni campo non valido sul default. */
export function readPrinterPreferences(): PrinterPreferences {
  const stored = parseJson(safeLocalStorage.getItem(PREFERENCES_KEY));
  if (!stored || typeof stored !== "object") {
    return DEFAULT_PRINTER_PREFERENCES;
  }

  const raw = stored as Partial<Record<keyof PrinterPreferences, unknown>>;
  return {
    autoPrint: pickBoolean(
      raw.autoPrint,
      DEFAULT_PRINTER_PREFERENCES.autoPrint,
    ),
    paperWidth: isPaperWidth(raw.paperWidth)
      ? raw.paperWidth
      : DEFAULT_PRINTER_PREFERENCES.paperWidth,
    printQr: pickBoolean(raw.printQr, DEFAULT_PRINTER_PREFERENCES.printQr),
  };
}

/**
 * Applica una patch parziale e ritorna le preferenze risultanti, così il
 * chiamante aggiorna lo stato React senza una rilettura.
 */
export function writePrinterPreferences(
  patch: Partial<PrinterPreferences>,
): PrinterPreferences {
  const next: PrinterPreferences = { ...readPrinterPreferences(), ...patch };
  safeLocalStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
  return next;
}

/**
 * Ultima stampante accoppiata.
 *
 * Serve anche quando la riconnessione silenziosa non è disponibile
 * (`navigator.bluetooth.getDevices()` è dietro flag su Chrome, Android
 * incluso): senza questo record la UI direbbe "nessuna stampante" invece di
 * "Munbyn ITPP047 — non collegata · Ricollega".
 */
export function readLastPrinter(): LastPrinter | null {
  const stored = parseJson(safeLocalStorage.getItem(LAST_PRINTER_KEY));
  if (!stored || typeof stored !== "object") return null;

  const { id, name } = stored as Partial<Record<keyof LastPrinter, unknown>>;
  if (typeof id !== "string" || !id) return null;

  return { id, name: typeof name === "string" ? name : "Stampante" };
}

export function writeLastPrinter(printer: LastPrinter): void {
  safeLocalStorage.setItem(LAST_PRINTER_KEY, JSON.stringify(printer));
}

export function clearLastPrinter(): void {
  safeLocalStorage.removeItem(LAST_PRINTER_KEY);
}
