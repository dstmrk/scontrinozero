import { describe, expect, it } from "vitest";
import {
  BOLLO_IMPORTO_EURO,
  BOLLO_SOGLIA_EURO,
  DICITURA_FORFETTARIO_BASE,
  DICITURA_FORFETTARIO_RITENUTA,
  buildDicituraForfettario,
} from "./dicitura-forfettario";

describe("buildDicituraForfettario — fattura", () => {
  it("returns the base dicitura, marked as obbligatoria", () => {
    const result = buildDicituraForfettario({ documento: "fattura" });
    expect(result.obbligatoria).toBe(true);
    expect(result.testo).toBe(DICITURA_FORFETTARIO_BASE);
  });

  it("cites art. 1 commi 54-89 L. 190/2014 in the text", () => {
    const result = buildDicituraForfettario({ documento: "fattura" });
    expect(result.testo).toContain("articolo 1, commi da 54 a 89");
    expect(result.testo).toContain("Legge n. 190/2014");
  });

  it("appends the ritenuta d'acconto clause (comma 67) when requested", () => {
    const result = buildDicituraForfettario({
      documento: "fattura",
      conRitenuta: true,
    });
    expect(result.testo).toBe(
      `${DICITURA_FORFETTARIO_BASE} ${DICITURA_FORFETTARIO_RITENUTA}`,
    );
    expect(result.testo).toContain("comma 67");
  });

  it("omits the ritenuta clause when conRitenuta is false or absent", () => {
    expect(
      buildDicituraForfettario({ documento: "fattura", conRitenuta: false })
        .testo,
    ).not.toContain("comma 67");
    expect(
      buildDicituraForfettario({ documento: "fattura" }).testo,
    ).not.toContain("comma 67");
  });

  it("adds the marca da bollo note when importo exceeds €77,47", () => {
    const result = buildDicituraForfettario({
      documento: "fattura",
      importoEuro: 100,
    });
    expect(result.note.some((n) => n.includes("bollo"))).toBe(true);
    expect(result.note.some((n) => n.includes("2,00"))).toBe(true);
  });

  it("does NOT add the bollo note at exactly €77,47 (soglia non superata)", () => {
    const result = buildDicituraForfettario({
      documento: "fattura",
      importoEuro: BOLLO_SOGLIA_EURO,
    });
    expect(result.note.some((n) => n.includes("bollo"))).toBe(false);
  });

  it("says no bollo is due when importo is at or below the threshold", () => {
    const result = buildDicituraForfettario({
      documento: "fattura",
      importoEuro: 50,
    });
    expect(
      result.note.some((n) => n.includes("non") && n.includes("bollo")),
    ).toBe(false);
    expect(result.note).toHaveLength(0);
  });

  it("treats NaN, negative and null importo as not provided (no bollo note)", () => {
    for (const importoEuro of [Number.NaN, -5, null, undefined]) {
      const result = buildDicituraForfettario({
        documento: "fattura",
        importoEuro,
      });
      expect(result.note.some((n) => n.includes("bollo"))).toBe(false);
    }
  });

  it("adds bollo note just above the threshold (77,48)", () => {
    const result = buildDicituraForfettario({
      documento: "fattura",
      importoEuro: 77.48,
    });
    expect(result.note.some((n) => n.includes("bollo"))).toBe(true);
  });
});

describe("buildDicituraForfettario — scontrino", () => {
  it("is not obbligatoria and returns empty text", () => {
    const result = buildDicituraForfettario({ documento: "scontrino" });
    expect(result.obbligatoria).toBe(false);
    expect(result.testo).toBe("");
  });

  it("explains that natura N2 is sufficient", () => {
    const result = buildDicituraForfettario({ documento: "scontrino" });
    expect(result.note.some((n) => n.includes("N2"))).toBe(true);
  });

  it("never adds the bollo note, even with a high importo", () => {
    const result = buildDicituraForfettario({
      documento: "scontrino",
      importoEuro: 500,
    });
    expect(result.note.some((n) => n.includes("bollo"))).toBe(false);
  });

  it("ignores the ritenuta flag (no clause on scontrino)", () => {
    const result = buildDicituraForfettario({
      documento: "scontrino",
      conRitenuta: true,
    });
    expect(result.testo).toBe("");
  });
});

describe("exported constants", () => {
  it("BOLLO_SOGLIA_EURO is 77.47 and BOLLO_IMPORTO_EURO is 2", () => {
    expect(BOLLO_SOGLIA_EURO).toBe(77.47);
    expect(BOLLO_IMPORTO_EURO).toBe(2);
  });

  it("base dicitura does not mention ritenuta", () => {
    expect(DICITURA_FORFETTARIO_BASE).not.toContain("ritenuta");
    expect(DICITURA_FORFETTARIO_RITENUTA).toContain("ritenuta");
  });
});
