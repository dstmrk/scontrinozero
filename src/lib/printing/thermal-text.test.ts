import { describe, it, expect } from "vitest";
import { sanitizeThermalText, shortVatLabel } from "./thermal-text";

describe("sanitizeThermalText", () => {
  it("lascia intatte le vocali accentate minuscole (coperte da CP437)", () => {
    expect(sanitizeThermalText("caffè perché più città però")).toBe(
      "caffè perché più città però",
    );
  });

  it("traslittera le accentate MAIUSCOLE, che CP437 non rappresenta", () => {
    // Senza questa conversione l'encoder emette "?" o droppa il carattere:
    // su un documento fiscale è perdita di dato, non un dettaglio estetico.
    expect(sanitizeThermalText("CAFFÈ CITTÀ PERCHÉ PIÙ CIÒ")).toBe(
      "CAFFE' CITTA' PERCHE' PIU' CIO'",
    );
  });

  it("sostituisce il segno di moltiplicazione con la x ASCII", () => {
    expect(sanitizeThermalText("n.2 × 0,60")).toBe("n.2 x 0,60");
  });

  it("normalizza le virgolette tipografiche e i trattini lunghi", () => {
    expect(sanitizeThermalText("“Bar” – dell’angolo")).toBe(
      `"Bar" - dell'angolo`,
    );
  });

  it("non tocca i caratteri fuori mappa: la sostituzione spetta all'encoder", () => {
    // Deliberatamente NON replichiamo qui la tabella CP437 — l'encoder sa già
    // scegliere la codepage e sostituire il non rappresentabile. Questo modulo
    // copre solo il buco documentato (accentate maiuscole + punteggiatura).
    expect(sanitizeThermalText("Sushi 寿司")).toBe("Sushi 寿司");
  });

  it("è idempotente", () => {
    const once = sanitizeThermalText("CAFFÈ × “x”");
    expect(sanitizeThermalText(once)).toBe(once);
  });
});

describe("shortVatLabel", () => {
  it("rende le aliquote numeriche come percentuale", () => {
    expect(shortVatLabel("22")).toBe("22%");
  });

  it("tiene i codici natura nella forma corta N1..N6", () => {
    // VAT_LABELS userebbe "0% – Non sogg." (14 char): non entra nella colonna
    // IVA di uno scontrino a 32 colonne.
    expect(shortVatLabel("N2")).toBe("N2");
  });

  it("non supera mai 3 caratteri", () => {
    const codes = ["4", "5", "10", "22", "N1", "N2", "N3", "N4", "N5", "N6"];
    const tooLong = codes.filter((c) => shortVatLabel(c).length > 3);
    expect(tooLong).toEqual([]);
  });
});
