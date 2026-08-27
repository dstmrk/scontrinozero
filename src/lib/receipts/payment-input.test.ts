import { describe, it, expect } from "vitest";
import {
  isMixedPayment,
  splitCashElectronic,
  sumPaymentCents,
  toPaymentEntries,
} from "@/lib/receipts/payment-input";
import { resolvePaymentRows } from "@/lib/receipts/public-request";

describe("toPaymentEntries", () => {
  it("converte gli importi in euro in centesimi interi", () => {
    expect(
      toPaymentEntries([
        { type: "PC", amount: 0.5 },
        { type: "PE", amount: 1.0 },
      ]),
    ).toEqual([
      { type: "PC", amountCents: 50 },
      { type: "PE", amountCents: 100 },
    ]);
  });

  it("ritorna null quando l'input non porta una ripartizione", () => {
    expect(toPaymentEntries(undefined)).toBeNull();
    expect(toPaymentEntries([])).toBeNull();
  });

  it("scarta le voci a zero, e con esse un array di soli zeri", () => {
    // Uno slot a zero non è un incasso: il layout AdE non lo stampa
    // (HAR.md voce #17c) e il documento non deve ricordarlo.
    expect(
      toPaymentEntries([
        { type: "PC", amount: 0 },
        { type: "PE", amount: 2 },
      ]),
    ).toEqual([{ type: "PE", amountCents: 200 }]);
    expect(toPaymentEntries([{ type: "PC", amount: 0 }])).toBeNull();
  });

  it("compone con resolvePaymentRows nella stessa forma della lettura", () => {
    // L'input e il jsonb già scritto devono arrivare alla stessa forma
    // canonica: è ciò che tiene la cassa e la ristampa dello stesso documento
    // sulla stessa resa.
    const rows = resolvePaymentRows(
      {
        paymentMethod: "PC",
        payments: toPaymentEntries([
          { type: "PE", amount: 1.0 },
          { type: "PC", amount: 0.5 },
        ]),
      },
      150,
    );
    expect(rows).toEqual([
      { type: "PC", amountCents: 50 },
      { type: "PE", amountCents: 100 },
    ]);
  });
});

describe("sumPaymentCents", () => {
  it("somma in centesimi interi, mai in float", () => {
    // 0.1 + 0.2 !== 0.3: sommare in euro rifiuterebbe quadrature legittime.
    expect(
      sumPaymentCents([
        { type: "PC", amount: 0.1 },
        { type: "PE", amount: 0.2 },
      ]),
    ).toBe(30);
  });

  it("vale zero su un input assente o vuoto", () => {
    expect(sumPaymentCents(undefined)).toBe(0);
    expect(sumPaymentCents([])).toBe(0);
  });
});

describe("isMixedPayment", () => {
  it("è vero solo quando incassa su più di una modalità", () => {
    expect(
      isMixedPayment([
        { type: "PC", amount: 1 },
        { type: "PE", amount: 2 },
      ]),
    ).toBe(true);
    expect(isMixedPayment([{ type: "PC", amount: 1 }])).toBe(false);
    expect(isMixedPayment(undefined)).toBe(false);
  });

  it("non conta come misto una ripartizione con una sola voce non a zero", () => {
    // `payments: [{PC, 0}, {PE, 3}]` incassa su una modalità sola: gatearlo
    // come misto negherebbe a uno Starter un pagamento che misto non è.
    expect(
      isMixedPayment([
        { type: "PC", amount: 0 },
        { type: "PE", amount: 3 },
      ]),
    ).toBe(false);
  });
});

describe("splitCashElectronic", () => {
  it("dà all'elettronico il resto dell'incassato", () => {
    expect(splitCashElectronic(1000, 250)).toEqual({
      cashCents: 250,
      electronicCents: 750,
    });
  });

  it("le due quote sommano sempre all'incassato", () => {
    // È l'invariante che rende la quadratura AdE (voce #5) vera per
    // costruzione: non esiste uno stato con un residuo da azzerare.
    for (const cash of [0, 1, 333, 999, 1000, 5000, -20]) {
      const split = splitCashElectronic(1000, cash);
      expect(split.cashCents + split.electronicCents).toBe(1000);
    }
  });

  it("clampa la quota contanti invece di produrre un elettronico negativo", () => {
    expect(splitCashElectronic(1000, 5000)).toEqual({
      cashCents: 1000,
      electronicCents: 0,
    });
    expect(splitCashElectronic(1000, -20)).toEqual({
      cashCents: 0,
      electronicCents: 1000,
    });
  });

  it("regge un incassato a zero senza produrre importi negativi", () => {
    // Capita con uno sconto a pagare pari al totale: lo schema lo rifiuta a
    // valle, ma la UI ci passa mentre l'esercente digita.
    expect(splitCashElectronic(-50, 100)).toEqual({
      cashCents: 0,
      electronicCents: 0,
    });
  });
});
