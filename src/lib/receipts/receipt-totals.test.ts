import { describe, it, expect } from "vitest";
import {
  calcDocTotal,
  calcInputLinesTotalCents,
  computeReceiptTotals,
  type ReceiptLineAmounts,
} from "@/lib/receipts/receipt-totals";

/** Riga DB-like: i campi arrivano come stringhe da `numeric`. */
function line(
  grossUnitPrice: string,
  quantity: string,
  vatCode: string,
  lineDiscount: string | null = "0",
): ReceiptLineAmounts {
  return { grossUnitPrice, quantity, vatCode, lineDiscount };
}

describe("sconto di riga — canone dei totali", () => {
  it("sottrae lo sconto dal totale di riga", () => {
    // Oracolo HAR.md voce #1, riga 2: 1,00 @10% con 0,10 di sconto → 0,90.
    const totals = computeReceiptTotals([line("1.00", "1", "10", "0.10")]);
    expect(totals.perLine[0].lineTotal).toBe(0.9);
    expect(totals.grandTotal).toBe(0.9);
  });

  it("scorpora l'IVA DOPO lo sconto, non prima", () => {
    // È la differenza fiscale che definisce lo sconto di riga (HAR.md voce
    // #3a): l'IVA si versa su 0,81818… non su 0,90909…. Sul lordo di 0,90 al
    // 10% l'imposta è 0,08, non 0,09.
    const totals = computeReceiptTotals([line("1.00", "1", "10", "0.10")]);
    expect(totals.vatTotal).toBe(0.08);
    expect(totals.vatByCode.get("10")).toBe(0.08);
  });

  it("applica lo sconto ALLA RIGA, non per unità (HAR.md voce #12)", () => {
    // Oracolo voce #12: qta 2, 3,00 @22%, sconto 1,00 → totale 5,00.
    // Se lo sconto fosse per unità il totale sarebbe 6,00 − 2,00 = 4,00.
    const totals = computeReceiptTotals([line("3.00", "2", "22", "1.00")]);
    expect(totals.grandTotal).toBe(5);
  });

  it("non produce IVA su una riga a natura, nemmeno scontata", () => {
    const totals = computeReceiptTotals([line("1.00", "1", "N2", "0.10")]);
    expect(totals.grandTotal).toBe(0.9);
    expect(totals.vatTotal).toBe(0);
    expect(totals.vatByCode.size).toBe(0);
  });

  it("somma in centesimi interi su più righe scontate (regola 17)", () => {
    // Tre righe da 0,10 con 0,03 di sconto: 0,07 × 3 = 0,21 esatti.
    const totals = computeReceiptTotals([
      line("0.10", "1", "22", "0.03"),
      line("0.10", "1", "22", "0.03"),
      line("0.10", "1", "22", "0.03"),
    ]);
    expect(totals.grandTotal).toBe(0.21);
  });

  it("tratta come zero uno sconto assente o nullo (righe storiche)", () => {
    // Nessuna migrazione riscrive le righe emesse prima della 0034.
    expect(
      computeReceiptTotals([line("1.00", "1", "10", null)]).grandTotal,
    ).toBe(1);
    expect(
      computeReceiptTotals([
        { grossUnitPrice: "1.00", quantity: "1", vatCode: "10" },
      ] as unknown as ReceiptLineAmounts[]).grandTotal,
    ).toBe(1);
  });

  it("non lascia mai un totale di riga negativo", () => {
    // Difesa: lo Zod rifiuta uno sconto oltre il totale di riga, ma queste
    // funzioni leggono anche dal DB, dove un import manuale potrebbe averlo
    // scritto. Un totale negativo si propagherebbe ad AdE.
    const totals = computeReceiptTotals([line("1.00", "1", "22", "5.00")]);
    expect(totals.grandTotal).toBe(0);
    expect(totals.perLine[0].lineTotal).toBe(0);
  });
});

describe("calcDocTotal / calcInputLinesTotalCents — sconto di riga", () => {
  it("calcDocTotal sottrae lo sconto", () => {
    expect(calcDocTotal([line("3.00", "2", "22", "1.00")])).toBe(5);
  });

  it("calcInputLinesTotalCents sottrae lo sconto", () => {
    expect(
      calcInputLinesTotalCents([
        { grossUnitPrice: 3, quantity: 2, lineDiscount: 1 },
      ]),
    ).toBe(500);
  });

  it("senza sconti riproduce esattamente i valori di prima", () => {
    // Regressione PR #702: quantità frazionarie, canone per-riga.
    const dbLines = [line("0.33", "1.5", "22"), line("0.33", "1.5", "22")];
    expect(calcDocTotal(dbLines)).toBe(1);
    expect(
      calcInputLinesTotalCents([
        { grossUnitPrice: 0.33, quantity: 1.5 },
        { grossUnitPrice: 0.33, quantity: 1.5 },
      ]),
    ).toBe(100);
  });
});
