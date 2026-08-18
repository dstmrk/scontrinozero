/**
 * Estrae il testo visibile da un PDF generato con `pdfkit`.
 *
 * Serve per testare il **layout** dei documenti commerciali: senza questo, i
 * test del PDF possono solo verificare il magic number `%PDF` e che due input
 * diversi producano buffer diversi — cioè nulla su etichette, ordine delle
 * sezioni e presenza delle righe obbligatorie.
 *
 * Perché non basta cercare la stringa nel buffer: pdfkit comprime i content
 * stream con FlateDecode, quindi il testo non compare mai in chiaro. Qui si
 * inflazionano gli stream e si ricompongono gli operatori di scrittura.
 *
 * Con i font standard (Helvetica) pdfkit emette array `[<hex> kern <hex>] TJ`
 * in WinAnsiEncoding; i valori di kerning vanno scartati, non sono testo.
 */
import zlib from "node:zlib";

/**
 * WinAnsi (CP1252) diverge da latin1 nel range 0x80-0x9F. Solo i caratteri
 * che possono davvero finire su uno scontrino: valuta, trattini tipografici e
 * virgolette che arrivano dal copia-incolla nelle descrizioni articolo.
 */
const WINANSI_HIGH: ReadonlyMap<number, string> = new Map([
  [0x80, "€"],
  [0x91, "‘"],
  [0x92, "’"],
  [0x93, "“"],
  [0x94, "”"],
  [0x96, "–"],
  [0x97, "—"],
  [0x85, "…"],
]);

function decodeWinAnsi(hex: string): string {
  let out = "";
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const byte = Number.parseInt(hex.slice(i, i + 2), 16);
    out += WINANSI_HIGH.get(byte) ?? String.fromCharCode(byte);
  }
  return out;
}

/** Inflaziona ogni content stream del PDF, scartando quelli non compressi. */
function inflateStreams(pdf: Buffer): string[] {
  const latin = pdf.toString("latin1");
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const out: string[] = [];
  let match = streamRe.exec(latin);
  while (match !== null) {
    try {
      out.push(
        zlib.inflateSync(Buffer.from(match[1], "latin1")).toString("latin1"),
      );
    } catch {
      // Stream non-Flate (font embeddati, immagini): non contiene testo.
    }
    match = streamRe.exec(latin);
  }
  return out;
}

/**
 * Restituisce le righe di testo del PDF, nell'ordine in cui sono state
 * scritte. Ogni operatore `TJ`/`Tj` diventa una riga: pdfkit ne emette uno per
 * cella, quindi una riga a colonne (descrizione | IVA | importo) esce come tre
 * elementi consecutivi.
 */
export function extractPdfTextRuns(pdf: Buffer): string[] {
  const runs: string[] = [];
  for (const content of inflateStreams(pdf)) {
    const showRe =
      /\[((?:\s*<[0-9a-fA-F]*>\s*-?[\d.]*)*)\s*\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj/g;
    let match = showRe.exec(content);
    while (match !== null) {
      const hex = (match[1] ?? match[2] ?? "")
        .split(/[^0-9a-fA-F<>]+/)
        .filter((chunk) => chunk.startsWith("<"))
        .map((chunk) => chunk.replace(/[<>]/g, ""))
        .join("");
      const text = decodeWinAnsi(hex);
      if (text.length > 0) runs.push(text);
      match = showRe.exec(content);
    }
  }
  return runs;
}

/**
 * Tutto il testo del PDF in una sola stringa, con i run separati da `\n`.
 * Comodo per asserzioni di presenza/assenza (`toContain`).
 */
export function extractPdfText(pdf: Buffer): string {
  return extractPdfTextRuns(pdf).join("\n");
}
