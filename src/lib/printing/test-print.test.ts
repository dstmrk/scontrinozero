import { describe, it, expect } from "vitest";
import { buildTestPrintCommands } from "./test-print";
import { PAPER_COLUMNS } from "./types";

function decode(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
}

const BASE = {
  columns: PAPER_COLUMNS["58"],
  printQr: false,
  language: "esc-pos",
} as const;

describe("buildTestPrintCommands", () => {
  it("si identifica come stampa di prova, non come documento fiscale", () => {
    const text = decode(buildTestPrintCommands(BASE));
    expect(text).toContain("Stampa di prova");
    expect(text).not.toContain("DOCUMENTO COMMERCIALE");
  });

  it("stampa un righello lungo esattamente quanto la carta impostata", () => {
    // È il riferimento visivo per capire se 58/80mm è impostato giusto: se
    // sborda o avanza spazio, l'utente vede subito l'errore.
    const text = decode(buildTestPrintCommands(BASE));
    const ruler = text
      .split("\n")
      .map((l) => l.replace(/\r/g, ""))
      .find((l) => l.startsWith("1234567890"));
    expect(ruler).toHaveLength(32);
  });

  it("adatta il righello alla carta da 80mm", () => {
    const text = decode(
      buildTestPrintCommands({ ...BASE, columns: PAPER_COLUMNS["80"] }),
    );
    const ruler = text
      .split("\n")
      .map((l) => l.replace(/\r/g, ""))
      .find((l) => l.startsWith("1234567890"));
    expect(ruler).toHaveLength(48);
  });

  it("dichiara la larghezza impostata, così l'utente confronta col righello", () => {
    expect(decode(buildTestPrintCommands(BASE))).toContain(
      "Larghezza: 32 colonne",
    );
  });

  it("include un campione di accenti minuscoli", () => {
    // 0x85 = à in CP437: se uscisse "?" il set caratteri sarebbe sbagliato.
    expect(decode(buildTestPrintCommands(BASE))).toContain("\x85");
  });

  it("include le accentate maiuscole nella forma traslitterata", () => {
    expect(decode(buildTestPrintCommands(BASE))).toContain("CAFFE' 1,50");
  });

  it("stampa il QR solo quando l'opzione è attiva, per far verificare il supporto", () => {
    // Su molti cloni GS ( k non è implementato: la prova serve proprio a
    // scoprirlo prima di stamparlo su uno scontrino vero.
    expect(
      decode(buildTestPrintCommands({ ...BASE, printQr: true })),
    ).toContain("\x1d(k");
  });

  it("omette il QR quando l'opzione è disattiva", () => {
    expect(decode(buildTestPrintCommands(BASE))).not.toContain("\x1d(k");
  });

  it("taglia la carta a fine prova", () => {
    expect(decode(buildTestPrintCommands(BASE))).toContain("\x1dV");
  });
});
