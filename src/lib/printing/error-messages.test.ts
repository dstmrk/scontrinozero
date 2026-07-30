import { describe, it, expect } from "vitest";
import { printErrorMessage, printSupportMessage } from "./error-messages";
import type { PrintErrorCode } from "./bluetooth-printer";
import type { BluetoothPrintSupport } from "./support";

const ALL_ERROR_CODES: PrintErrorCode[] = [
  "unsupported",
  "adapter-off",
  "not-selected",
  "not-connected",
  "unreachable",
  "incompatible-printer",
];

describe("printErrorMessage", () => {
  it("copre ogni codice d'errore con un messaggio non vuoto", () => {
    const missing = ALL_ERROR_CODES.filter((c) => !printErrorMessage(c).trim());
    expect(missing).toEqual([]);
  });

  it("dice come riaccendere il Bluetooth invece di limitarsi a constatarlo", () => {
    expect(printErrorMessage("adapter-off")).toContain("Attivalo");
  });

  it("cita i servizi di localizzazione su Android 11, la causa non ovvia", () => {
    // Sotto Android 12 la scansione BLE non restituisce nulla senza
    // localizzazione attiva: senza questo suggerimento l'app sembra rotta.
    expect(printErrorMessage("not-selected")).toContain("localizzazione");
  });

  it("suggerisce il PDF dove il Bluetooth non è disponibile", () => {
    expect(printErrorMessage("unsupported")).toContain("PDF");
  });

  it("elenca cosa controllare quando la stampante non risponde", () => {
    expect(printErrorMessage("unreachable")).toContain("carta");
  });

  it("dice quale stampante serve quando quella scelta non è compatibile", () => {
    // Senza il nome dello standard l'utente non sa cosa comprare né perché
    // una stampante che il telefono vede non funziona.
    expect(printErrorMessage("incompatible-printer")).toContain("ESC/POS");
  });
});

describe("printSupportMessage", () => {
  it("non dice nulla quando tutto funziona", () => {
    expect(printSupportMessage({ status: "supported" })).toBe("");
  });

  it("distingue la webview in-app, che si risolve aprendo in Chrome", () => {
    expect(printSupportMessage({ status: "in-app-webview" })).toContain(
      "Chrome",
    );
  });

  it("su browser non supportati offre il PDF invece di un vicolo cieco", () => {
    // Regola 8: su iOS non promettiamo il Bluetooth, ma non lasciamo nemmeno
    // l'utente senza una strada per stampare.
    expect(printSupportMessage({ status: "unsupported-browser" })).toContain(
      "PDF",
    );
  });

  it("copre ogni stato di supporto", () => {
    const states: BluetoothPrintSupport[] = [
      { status: "supported" },
      { status: "adapter-off" },
      { status: "in-app-webview" },
      { status: "unsupported-browser" },
    ];
    const undefinedMessages = states.filter(
      (s) => typeof printSupportMessage(s) !== "string",
    );
    expect(undefinedMessages).toEqual([]);
  });
});
