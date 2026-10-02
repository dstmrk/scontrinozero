import { describe, expect, it } from "vitest";
import { saleReturnProgress } from "./return-progress";

const line = (quantity: string, returnedQuantity: string) => ({
  quantity,
  returnedQuantity,
});

describe("saleReturnProgress", () => {
  it("nessun reso: none", () => {
    expect(saleReturnProgress([line("2.000", "0"), line("1.000", "0")])).toBe(
      "none",
    );
  });

  it("una riga resa in parte: partial", () => {
    expect(saleReturnProgress([line("2.000", "1"), line("1.000", "0")])).toBe(
      "partial",
    );
  });

  it("una riga resa del tutto, l'altra no: partial", () => {
    expect(saleReturnProgress([line("2.000", "2"), line("1.000", "0")])).toBe(
      "partial",
    );
  });

  it("ogni pezzo reso: full", () => {
    expect(saleReturnProgress([line("2.000", "2"), line("1.000", "1")])).toBe(
      "full",
    );
  });

  // Quantità frazionarie (etti, litri): il confronto avviene in centesimi
  // interi, come nel servizio di reso, non in float.
  it("confronta le frazioni in centesimi interi", () => {
    expect(saleReturnProgress([line("0.300", "0.1")])).toBe("partial");
    expect(saleReturnProgress([line("0.300", String(0.1 + 0.2))])).toBe("full");
  });

  it("documento senza righe: none", () => {
    expect(saleReturnProgress([])).toBe("none");
  });
});
