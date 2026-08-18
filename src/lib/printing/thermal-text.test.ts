import { describe, it, expect } from "vitest";
import { sanitizeThermalText } from "./thermal-text";

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
