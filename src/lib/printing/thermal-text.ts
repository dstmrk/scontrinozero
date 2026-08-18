/**
 * Normalizzazione del testo prima dell'encoding ESC/POS.
 *
 * `@point-of-sale/receipt-printer-encoder` sceglie da solo la codepage e
 * converte le accentate **minuscole** (à è é ì ò ù sono tutte in CP437, che
 * ogni stampante ESC/POS supporta). Restano fuori due casi verificati
 * empiricamente contro l'encoder v3:
 *
 *  1. Le accentate **maiuscole** — `È PERCHÉ PIÙ CITTÀ` esce come
 *     `? PERCH PI? CITT?`. CP437 non le ha, e su un documento fiscale un `?`
 *     al posto di una lettera è perdita di dato. Le ragioni sociali in
 *     maiuscolo ("CAFFÈ CENTRALE") sono comunissime, quindi il caso è reale.
 *     Si traslittera nella forma apostrofata `E'`, la convenzione dei
 *     registratori di cassa italiani da sempre.
 *  2. Il segno di moltiplicazione `×` (U+00D7) usato nella riga quantità: non
 *     è in CP437 e diventa `?`. Si usa la `x` ASCII.
 *
 * Tutto il resto NON viene toccato: replicare qui la tabella CP437 duplicherebbe
 * il lavoro dell'encoder, che sa già sostituire ciò che non sa rappresentare.
 */

/**
 * Sostituzioni carattere→testo applicate prima dell'encoding.
 * Chiavi di un solo carattere, così la sostituzione è un semplice replace.
 */
const THERMAL_REPLACEMENTS: ReadonlyMap<string, string> = new Map([
  // Vocali accentate maiuscole (assenti da CP437).
  ["À", "A'"],
  ["Á", "A'"],
  ["È", "E'"],
  ["É", "E'"],
  ["Ì", "I'"],
  ["Í", "I'"],
  ["Ò", "O'"],
  ["Ó", "O'"],
  ["Ù", "U'"],
  ["Ú", "U'"],
  // Segno di moltiplicazione della riga quantità.
  ["×", "x"],
  // Punteggiatura tipografica: fuori CP437, e arriva facilmente da
  // copia-incolla nelle descrizioni articolo.
  ["‘", "'"],
  ["’", "'"],
  ["“", '"'],
  ["”", '"'],
  ["–", "-"],
  ["—", "-"],
  ["…", "..."],
]);

const THERMAL_REPLACEMENT_RE = new RegExp(
  `[${[...THERMAL_REPLACEMENTS.keys()].join("")}]`,
  "g",
);

/**
 * Prepara `text` per la stampa termica. Idempotente: l'output non contiene
 * più nessuno dei caratteri sostituiti.
 */
export function sanitizeThermalText(text: string): string {
  return text.replace(
    THERMAL_REPLACEMENT_RE,
    (char) => THERMAL_REPLACEMENTS.get(char) ?? char,
  );
}
