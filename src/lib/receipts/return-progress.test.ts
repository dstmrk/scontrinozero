import { describe, expect, it } from "vitest";
import {
  parseReturnQuantityInput,
  returnableQuantity,
  saleReturnProgress,
} from "./return-progress";

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

describe("returnableQuantity", () => {
  it("venduti meno già resi", () => {
    expect(returnableQuantity(line("3.000", "1"))).toBe(2);
  });

  it("in centesimi interi, senza residui float", () => {
    expect(returnableQuantity(line("0.300", "0.1"))).toBe(0.2);
  });

  it("mai sotto zero", () => {
    expect(returnableQuantity(line("1.000", "2"))).toBe(0);
  });
});

describe("parseReturnQuantityInput", () => {
  it("vuoto vale zero: riga non resa", () => {
    expect(parseReturnQuantityInput("", 2)).toBe(0);
    expect(parseReturnQuantityInput("  ", 2)).toBe(0);
  });

  it("accetta la virgola decimale", () => {
    expect(parseReturnQuantityInput("0,5", 2)).toBe(0.5);
  });

  it("accetta il massimo rendibile", () => {
    expect(parseReturnQuantityInput("2", 2)).toBe(2);
  });

  it.each([
    ["oltre il rendibile", "3"],
    ["negativo", "-1"],
    ["non numerico", "abc"],
    ["più di due decimali", "0.125"],
    ["notazione esponenziale", "1e1"],
  ])("rifiuta %s", (_label, raw) => {
    expect(parseReturnQuantityInput(raw, 2)).toBeNull();
  });
});
