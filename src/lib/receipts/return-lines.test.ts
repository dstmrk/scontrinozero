import { describe, expect, it } from "vitest";

import { buildReturnLines, type SaleLineRow } from "./return-lines";
import { calcInputLinesTotalCents } from "./receipt-totals";

const doppio: SaleLineRow = {
  lineIndex: 0,
  description: "doppio",
  quantity: "2.000",
  grossUnitPrice: "30.00",
  lineDiscount: "1.00",
  vatCode: "22",
};
const singolo: SaleLineRow = {
  lineIndex: 1,
  description: "singolo",
  quantity: "1.000",
  grossUnitPrice: "20.00",
  lineDiscount: "0.00",
  vatCode: "N2",
};

/** Totale in centesimi delle righe di un reso, con l'aritmetica canonica. */
function totalCents(rows: ReturnType<typeof buildReturnLines>): number {
  return calcInputLinesTotalCents(
    rows.map((r) => ({
      grossUnitPrice: Number(r.grossUnitPrice),
      quantity: Number(r.quantity),
      lineDiscount: Number(r.lineDiscount),
    })),
  );
}

describe("buildReturnLines", () => {
  it("porta solo le righe rese, con l'indice della riga di vendita", () => {
    const rows = buildReturnLines([doppio, singolo], [0, 0], [0, 1]);
    expect(rows).toEqual([
      {
        lineIndex: 1,
        description: "singolo",
        quantity: "1",
        grossUnitPrice: "20.00",
        lineDiscount: "0.00",
        vatCode: "N2",
      },
    ]);
  });

  it("ripartisce lo sconto di riga in proporzione ai pezzi resi", () => {
    const rows = buildReturnLines([doppio, singolo], [0, 0], [1, 0]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ quantity: "1", lineDiscount: "0.50" });
    expect(totalCents(rows)).toBe(2950);
  });

  it("la somma dei resi chiude esattamente sulla vendita, anche in terzi", () => {
    const triplo: SaleLineRow = {
      lineIndex: 0,
      description: "triplo",
      quantity: "3.000",
      grossUnitPrice: "10.00",
      lineDiscount: "1.00",
      vatCode: "22",
    };
    const first = buildReturnLines([triplo], [0], [1]);
    const second = buildReturnLines([triplo], [1], [2]);

    // 100 centesimi di sconto in terzi: 33 + 67, mai 33 + 33 o 34 + 67.
    expect(first[0]!.lineDiscount).toBe("0.33");
    expect(second[0]!.lineDiscount).toBe("0.67");
    expect(totalCents(first) + totalCents(second)).toBe(
      calcInputLinesTotalCents([
        { grossUnitPrice: 10, quantity: 3, lineDiscount: 1 },
      ]),
    );
  });

  it("chiude anche quando lo sconto è dispari e i resi sono a pezzo singolo", () => {
    const odd: SaleLineRow = { ...doppio, lineDiscount: "0.01" };
    const first = buildReturnLines([odd], [0], [1]);
    const second = buildReturnLines([odd], [1], [1]);

    expect(
      Number(first[0]!.lineDiscount) + Number(second[0]!.lineDiscount),
    ).toBeCloseTo(0.01, 10);
  });

  it("gestisce le quantità frazionarie in centesimi, senza deriva float", () => {
    const peso: SaleLineRow = {
      lineIndex: 0,
      description: "formaggio",
      quantity: "0.300",
      grossUnitPrice: "20.00",
      lineDiscount: "0.30",
      vatCode: "4",
    };
    const rows = buildReturnLines([peso], [0.1], [0.2]);
    expect(rows[0]).toMatchObject({ quantity: "0.2", lineDiscount: "0.20" });
  });

  it("rifiuta righe non allineate invece di indovinare", () => {
    expect(() => buildReturnLines([doppio], [0, 0], [1, 0])).toThrow();
    expect(() => buildReturnLines([doppio, singolo], [0], [1, 0])).toThrow();
  });
});
