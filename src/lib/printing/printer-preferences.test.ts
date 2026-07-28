// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEFAULT_PRINTER_PREFERENCES,
  readPrinterPreferences,
  writePrinterPreferences,
  readLastPrinter,
  writeLastPrinter,
  clearLastPrinter,
} from "./printer-preferences";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  // Ordine obbligato: il test dello storage ostile sostituisce il *getter* di
  // window.localStorage con uno che lancia, quindi va ripristinato PRIMA di
  // toccare lo store, altrimenti il clear esplode e inquina i test successivi.
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("preferenze stampante", () => {
  it("parte dai default quando non c'è nulla di salvato", () => {
    expect(readPrinterPreferences()).toEqual(DEFAULT_PRINTER_PREFERENCES);
  });

  it("ha l'auto-stampa attiva di default", () => {
    // Al banco lo scontrino deve uscire da solo: è il flusso reale della cassa.
    expect(DEFAULT_PRINTER_PREFERENCES.autoPrint).toBe(true);
  });

  it("usa 58mm di default, la larghezza delle stampantine economiche", () => {
    expect(DEFAULT_PRINTER_PREFERENCES.paperWidth).toBe("58");
  });

  it("rilegge quel che ha scritto", () => {
    writePrinterPreferences({ autoPrint: false, paperWidth: "80" });
    expect(readPrinterPreferences()).toEqual({
      ...DEFAULT_PRINTER_PREFERENCES,
      autoPrint: false,
      paperWidth: "80",
    });
  });

  it("applica una patch parziale senza azzerare le altre preferenze", () => {
    writePrinterPreferences({ printQr: false });
    writePrinterPreferences({ paperWidth: "80" });
    expect(readPrinterPreferences().printQr).toBe(false);
  });

  it("ritorna le preferenze aggiornate, così il chiamante non rilegge", () => {
    expect(writePrinterPreferences({ autoPrint: false }).autoPrint).toBe(false);
  });

  it("ignora il JSON corrotto invece di lanciare", () => {
    localStorage.setItem("sz_printer_prefs", "{non-json");
    expect(readPrinterPreferences()).toEqual(DEFAULT_PRINTER_PREFERENCES);
  });

  it("scarta una larghezza carta non supportata", () => {
    localStorage.setItem(
      "sz_printer_prefs",
      JSON.stringify({ paperWidth: "112" }),
    );
    expect(readPrinterPreferences().paperWidth).toBe("58");
  });

  it("scarta un valore non booleano su autoPrint", () => {
    localStorage.setItem(
      "sz_printer_prefs",
      JSON.stringify({ autoPrint: "sì" }),
    );
    expect(readPrinterPreferences().autoPrint).toBe(true);
  });

  it("degrada ai default su storage bloccato invece di lanciare", () => {
    // Browser con storage negato: leggere la property stessa lancia
    // SecurityError (incidente SCONTRINOZERO-H). safeLocalStorage lo assorbe.
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Access is denied", "SecurityError");
    });
    expect(() => readPrinterPreferences()).not.toThrow();
  });
});

describe("ultima stampante usata", () => {
  it("non ricorda nulla all'inizio", () => {
    expect(readLastPrinter()).toBeNull();
  });

  it("ricorda id e nome, per poter dire quale stampante riconnettere", () => {
    // getDevices() è dietro flag su Chrome: senza il nome salvato la UI
    // direbbe "nessuna stampante" invece di "Munbyn — non collegata".
    writeLastPrinter({ id: "abc123", name: "Munbyn ITPP047" });
    expect(readLastPrinter()).toEqual({ id: "abc123", name: "Munbyn ITPP047" });
  });

  it("dimentica la stampante quando l'utente la scollega", () => {
    writeLastPrinter({ id: "abc123", name: "Munbyn ITPP047" });
    clearLastPrinter();
    expect(readLastPrinter()).toBeNull();
  });

  it("scarta un record senza id", () => {
    localStorage.setItem("sz_printer_last", JSON.stringify({ name: "X" }));
    expect(readLastPrinter()).toBeNull();
  });

  it("ignora il JSON corrotto", () => {
    localStorage.setItem("sz_printer_last", "{non-json");
    expect(readLastPrinter()).toBeNull();
  });
});
