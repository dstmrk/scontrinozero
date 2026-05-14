import { describe, expect, it } from "vitest";
import { splitVat, type VatSplitResult } from "./scorporo-iva";

describe("splitVat", () => {
  describe("aliquote IVA standard italiane", () => {
    it.each([
      { gross: 122, rate: 22, net: 100, vat: 22 },
      { gross: 110, rate: 10, net: 100, vat: 10 },
      { gross: 105, rate: 5, net: 100, vat: 5 },
      { gross: 104, rate: 4, net: 100, vat: 4 },
    ])(
      "scorpora lordo $gross @ $rate% → netto $net, IVA $vat",
      ({ gross, rate, net, vat }) => {
        const result = splitVat({ grossAmount: gross, vatRate: rate });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.net).toBeCloseTo(net, 2);
        expect(result.vat).toBeCloseTo(vat, 2);
        expect(result.gross).toBeCloseTo(gross, 2);
      },
    );
  });

  it("arrotonda a 2 decimali (cents-based, niente float noise)", () => {
    const result = splitVat({ grossAmount: 19.99, vatRate: 22 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 19.99 / 1.22 = 16.385... → 16.39 (round-half-to-even/half-up sui centesimi)
    // 19.99 - 16.39 = 3.60
    expect(result.net + result.vat).toBeCloseTo(19.99, 2);
    expect(Number(result.net.toFixed(2))).toBe(result.net);
    expect(Number(result.vat.toFixed(2))).toBe(result.vat);
  });

  it("ritorna ok=false con messaggio per importo zero o negativo", () => {
    const zero = splitVat({ grossAmount: 0, vatRate: 22 });
    expect(zero.ok).toBe(false);
    if (zero.ok) return;
    expect(zero.error).toMatch(/maggiore di zero/i);

    const neg = splitVat({ grossAmount: -10, vatRate: 22 });
    expect(neg.ok).toBe(false);
  });

  it("ritorna ok=false per aliquote non valide (negative o ≥ 100)", () => {
    const negRate = splitVat({ grossAmount: 100, vatRate: -1 });
    expect(negRate.ok).toBe(false);

    const tooHigh = splitVat({ grossAmount: 100, vatRate: 100 });
    expect(tooHigh.ok).toBe(false);
  });

  it("ammette aliquota 0 (operazione esente/non imponibile)", () => {
    const result = splitVat({ grossAmount: 100, vatRate: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.net).toBeCloseTo(100, 2);
    expect(result.vat).toBeCloseTo(0, 2);
  });

  it("rifiuta NaN e Infinity", () => {
    expect(splitVat({ grossAmount: Number.NaN, vatRate: 22 }).ok).toBe(false);
    expect(
      splitVat({ grossAmount: Number.POSITIVE_INFINITY, vatRate: 22 }).ok,
    ).toBe(false);
    expect(splitVat({ grossAmount: 100, vatRate: Number.NaN }).ok).toBe(false);
  });

  it("ritorna VatSplitResult coerente come tagged union", () => {
    const result: VatSplitResult = splitVat({ grossAmount: 122, vatRate: 22 });
    if (result.ok) {
      expect(typeof result.net).toBe("number");
      expect(typeof result.vat).toBe("number");
      expect(typeof result.gross).toBe("number");
    } else {
      expect(typeof result.error).toBe("string");
    }
  });

  it("la somma netto + IVA è sempre uguale al lordo (invariante)", () => {
    for (const gross of [1.23, 10, 99.99, 1234.56, 0.01]) {
      for (const rate of [4, 5, 10, 22]) {
        const result = splitVat({ grossAmount: gross, vatRate: rate });
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        expect(result.net + result.vat).toBeCloseTo(gross, 2);
      }
    }
  });
});
