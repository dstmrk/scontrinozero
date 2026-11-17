import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractPdfText, extractPdfTextRuns } from "./pdf-text";

/** Un "PDF" minimo: basta un content stream FlateDecode per l'estrattore. */
function pdfWithStream(content: string): Buffer {
  const deflated = zlib.deflateSync(Buffer.from(content, "latin1"));
  return Buffer.concat([
    Buffer.from("%PDF-1.3\nstream\n", "latin1"),
    deflated,
    Buffer.from("\nendstream\n", "latin1"),
  ]);
}

describe("extractPdfTextRuns", () => {
  it("ricompone un array TJ scartando i valori di kerning", () => {
    const pdf = pdfWithStream("BT [<4369> -30 <616f> 12.5 <21>] TJ ET");
    expect(extractPdfTextRuns(pdf)).toEqual(["Ciao!"]);
  });

  it("legge un operatore Tj semplice e decodifica il WinAnsi alto", () => {
    const pdf = pdfWithStream("BT <803130> Tj ET");
    expect(extractPdfTextRuns(pdf)).toEqual(["€10"]);
  });

  it("emette un run per operatore, nell'ordine di scrittura", () => {
    const pdf = pdfWithStream("[<41>] TJ\n<42> Tj\n[ <43> 10 <44> ] TJ");
    expect(extractPdfText(pdf)).toBe("A\nB\nCD");
  });

  it("scarta gli array TJ senza testo", () => {
    const pdf = pdfWithStream("[<>] TJ <> Tj [] TJ");
    expect(extractPdfTextRuns(pdf)).toEqual([]);
  });

  // CodeQL js/redos: con il vecchio pattern `(?:\s*<hex>\s*-?[\d.]*)*` lo
  // spazio fra due `<>` poteva appartenere a due iterazioni diverse, e un
  // array TJ mai chiuso faceva backtracking esponenziale: il tempo raddoppia
  // per ogni `<>` in più. Con n = 28 il vecchio pattern impiega ~5 s anche
  // dopo il tier-up di V8 a codice nativo (~30 s interpretato), quindi sfora
  // il limite in ogni caso; n resta basso apposta perché una regressione
  // deve far fallire il test, non appendere la CI per ore.
  it("rifiuta in tempo lineare un array TJ non chiuso (no ReDoS)", () => {
    const pdf = pdfWithStream("[" + " <>".repeat(28) + "x");
    const start = performance.now();
    expect(extractPdfTextRuns(pdf)).toEqual([]);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
