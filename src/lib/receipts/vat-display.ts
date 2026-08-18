/**
 * Resa dell'aliquota/natura sul documento commerciale — **puro, client-safe**.
 *
 * Il layout standard AdE non stampa in colonna la descrizione estesa della
 * natura: usa un mnemonico di due lettere con asterisco (`ES*`) e scioglie
 * l'asterisco in una legenda a piè di documento (`*ES = Esente`). La tabella
 * CODIFICHE del layout è la fonte di questa mappa.
 *
 * Il motivo per cui vale la pena adottarla non è solo la conformità: la
 * colonna IVA è la più stretta del documento (22pt sul PDF a 58mm, 4 caratteri
 * sulla termica a 32 colonne) e le etichette descrittive di `VAT_LABELS` —
 * fino a "0% – Non sogg." — ci andavano a capo, finendo sopra il separatore.
 *
 * `VAT_LABELS` resta la resa giusta **nella UI di cassa**, dove l'esercente
 * deve capire quale natura sta scegliendo; qui parliamo al cliente, che ha
 * bisogno di una colonna leggibile più della tassonomia.
 *
 * Qui NON deve mai comparire un import di `@/db`: il modulo è raggiunto anche
 * dai client component della stampa termica.
 */

export interface VatLegendEntry {
  /** Codice natura AdE, es. `N4`. */
  readonly code: string;
  /** Mnemonico di due lettere stampato in colonna, es. `ES`. */
  readonly mnemonic: string;
  /** Dicitura da stampare in legenda, es. `Esente`. */
  readonly dicitura: string;
}

/**
 * Tabella CODIFICHE del layout AdE, nel suo ordine (N1→N6).
 *
 * ⚠️ `N6` è "Altro non IVA" → "Operazione non IVA": è la lista piatta del
 * documento commerciale, non quella della fattura elettronica dove N6 è
 * l'inversione contabile. Stessa avvertenza di `VAT_LABELS` in
 * `src/types/cassa.ts`.
 */
const NATURE_CODIFICATION: readonly VatLegendEntry[] = [
  { code: "N1", mnemonic: "EE", dicitura: "Esclusa" },
  { code: "N2", mnemonic: "NS", dicitura: "Non soggetta" },
  { code: "N3", mnemonic: "NI", dicitura: "Non imponibile" },
  { code: "N4", mnemonic: "ES", dicitura: "Esente" },
  { code: "N5", mnemonic: "RM", dicitura: "Regime del margine" },
  { code: "N6", mnemonic: "AL", dicitura: "Operazione non IVA" },
];

const BY_CODE: ReadonlyMap<string, VatLegendEntry> = new Map(
  NATURE_CODIFICATION.map((entry) => [entry.code, entry]),
);

/**
 * Etichetta della colonna IVA: `22%` per le aliquote, `ES*` per le nature.
 *
 * Un codice sconosciuto torna invariato invece di sparire: su un documento
 * fiscale un dato che non sappiamo rendere va comunque mostrato.
 */
export function receiptVatLabel(vatCode: string): string {
  const nature = BY_CODE.get(vatCode);
  if (nature) return `${nature.mnemonic}*`;
  return Number.isNaN(Number.parseFloat(vatCode)) ? vatCode : `${vatCode}%`;
}

/**
 * Voci di legenda per le sole nature presenti nel documento, nell'ordine
 * della tabella AdE (non nell'ordine delle righe: la legenda è una tabella di
 * riferimento, e un ordine stabile la rende confrontabile fra scontrini).
 *
 * Vuoto quando il documento non ha nature — e allora la legenda non si stampa
 * affatto, come chiedono le prescrizioni sul risparmio carta.
 */
export function receiptVatLegend(
  vatCodes: readonly string[],
): VatLegendEntry[] {
  const present = new Set(vatCodes);
  return NATURE_CODIFICATION.filter((entry) => present.has(entry.code));
}

/** Riga di legenda già formattata, es. `*ES = Esente`. */
export function formatVatLegendLine(entry: VatLegendEntry): string {
  return `*${entry.mnemonic} = ${entry.dicitura}`;
}
