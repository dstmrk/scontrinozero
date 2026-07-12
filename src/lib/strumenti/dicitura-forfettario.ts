/**
 * Generatore della dicitura di esenzione IVA per il regime forfettario
 * (art. 1, commi 54-89, L. 190/2014), usato dal tool
 * /strumenti/dicitura-regime-forfettario.
 *
 * Fonti allineate ai contenuti del sito (guide/codici-natura-iva,
 * help/regime-forfettario): la dicitura è obbligatoria solo sulla fattura;
 * sullo scontrino elettronico (documento commerciale) basta la natura N2.
 */

export type DicituraDocumento = "fattura" | "scontrino";

export interface DicituraInput {
  readonly documento: DicituraDocumento;
  /** Aggiunge la clausola di non applicazione della ritenuta d'acconto (comma 67). */
  readonly conRitenuta?: boolean;
  /** Importo della fattura in euro, per l'avviso marca da bollo. */
  readonly importoEuro?: number | null;
}

export interface DicituraResult {
  /** true = la dicitura va riportata sul documento (solo fattura). */
  readonly obbligatoria: boolean;
  /** Testo pronto da copiare; stringa vuota per lo scontrino. */
  readonly testo: string;
  readonly note: readonly string[];
}

/** Soglia oltre la quale la fattura senza IVA richiede la marca da bollo (DPR 642/1972). */
export const BOLLO_SOGLIA_EURO = 77.47;
export const BOLLO_IMPORTO_EURO = 2;

export const DICITURA_FORFETTARIO_BASE =
  "Operazione effettuata ai sensi dell'articolo 1, commi da 54 a 89, della Legge n. 190/2014 - Regime forfettario.";

export const DICITURA_FORFETTARIO_RITENUTA =
  "Si richiede la non applicazione della ritenuta alla fonte a titolo d'acconto ai sensi dell'articolo 1, comma 67, della Legge n. 190/2014.";

const NOTA_SCONTRINO =
  "Sullo scontrino elettronico (documento commerciale) la dicitura non è richiesta: è sufficiente emettere le righe con natura IVA N2 (operazioni non soggette). La dicitura resta obbligatoria solo sulle fatture.";

const NOTA_BOLLO = `Importo superiore a ${BOLLO_SOGLIA_EURO.toFixed(2).replace(".", ",")} €: sulla fattura va assolta la marca da bollo da ${BOLLO_IMPORTO_EURO.toFixed(2).replace(".", ",")} € (in modo virtuale per la fattura elettronica).`;

export function buildDicituraForfettario(input: DicituraInput): DicituraResult {
  if (input.documento === "scontrino") {
    return { obbligatoria: false, testo: "", note: [NOTA_SCONTRINO] };
  }

  const testo = input.conRitenuta
    ? `${DICITURA_FORFETTARIO_BASE} ${DICITURA_FORFETTARIO_RITENUTA}`
    : DICITURA_FORFETTARIO_BASE;

  const importo = input.importoEuro;
  const note: string[] = [];
  if (
    typeof importo === "number" &&
    Number.isFinite(importo) &&
    importo > BOLLO_SOGLIA_EURO
  ) {
    note.push(NOTA_BOLLO);
  }

  return { obbligatoria: true, testo, note };
}
