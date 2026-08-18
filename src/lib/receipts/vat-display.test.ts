import { describe, it, expect } from "vitest";
import {
  formatVatLegendLine,
  receiptVatLabel,
  receiptVatLegend,
} from "./vat-display";
import { VAT_CODES } from "@/types/cassa";

describe("receiptVatLabel", () => {
  it.each([
    ["4", "4%"],
    ["5", "5%"],
    ["10", "10%"],
    ["22", "22%"],
  ])("rende l'aliquota %s come %s", (code, expected) => {
    expect(receiptVatLabel(code)).toBe(expected);
  });

  it.each([
    ["N1", "EE*"],
    ["N2", "NS*"],
    ["N3", "NI*"],
    ["N4", "ES*"],
    ["N5", "RM*"],
    ["N6", "AL*"],
  ])("rende la natura %s col mnemonico AdE %s", (code, expected) => {
    expect(receiptVatLabel(code)).toBe(expected);
  });

  it("rende le percentuali di compensazione agricoltura come aliquote", () => {
    expect(receiptVatLabel("7.5")).toBe("7.5%");
  });

  it("restituisce invariato un codice sconosciuto invece di perderlo", () => {
    expect(receiptVatLabel("XX")).toBe("XX");
  });

  it("non supera i 3 caratteri per nessun codice supportato dalla cassa", () => {
    // La colonna IVA è larga 4 caratteri sulla termica a 32 colonne: era
    // proprio il wrapping di "0% – Non sogg." a rompere il layout.
    for (const code of VAT_CODES) {
      expect(receiptVatLabel(code).length).toBeLessThanOrEqual(3);
    }
  });
});

describe("receiptVatLegend", () => {
  it("restituisce solo le nature presenti nel documento", () => {
    expect(receiptVatLegend(["22", "N4", "10"])).toEqual([
      { code: "N4", mnemonic: "ES", dicitura: "Esente" },
    ]);
  });

  it("segue l'ordine della tabella AdE, non quello delle righe", () => {
    expect(receiptVatLegend(["N5", "N1", "N4"]).map((e) => e.code)).toEqual([
      "N1",
      "N4",
      "N5",
    ]);
  });

  it("deduplica una natura ripetuta su più righe", () => {
    expect(receiptVatLegend(["N4", "N4", "N4"])).toHaveLength(1);
  });

  it("è vuota quando il documento non ha nature (nessuna legenda da stampare)", () => {
    expect(receiptVatLegend(["22", "10"])).toEqual([]);
  });

  it("è vuota per un documento senza righe", () => {
    expect(receiptVatLegend([])).toEqual([]);
  });

  it("ignora i codici sconosciuti", () => {
    expect(receiptVatLegend(["XX", "N9"])).toEqual([]);
  });

  it("N6 è 'Operazione non IVA', non l'inversione contabile della fattura elettronica", () => {
    expect(receiptVatLegend(["N6"])[0].dicitura).toBe("Operazione non IVA");
  });
});

describe("formatVatLegendLine", () => {
  it("formatta la voce come nel layout AdE", () => {
    expect(formatVatLegendLine(receiptVatLegend(["N4"])[0])).toBe(
      "*ES = Esente",
    );
  });

  it("nessuna riga di legenda supera le 32 colonne della termica", () => {
    for (const entry of receiptVatLegend([
      "N1",
      "N2",
      "N3",
      "N4",
      "N5",
      "N6",
    ])) {
      expect(formatVatLegendLine(entry).length).toBeLessThanOrEqual(32);
    }
  });
});
