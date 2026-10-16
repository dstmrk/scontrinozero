/**
 * Parser robusto per importi inseriti da utenti italiani. Gestisce tre forme:
 *   - inglese: "1234.56" / "1.5"
 *   - italiana decimale: "19,99"
 *   - italiana con separatore migliaia: "1.234,56" o "1.000"
 *
 * Regole:
 *   - se la stringa contiene una virgola, i punti sono separatori di migliaia
 *     (vengono rimossi) e la virgola è il separatore decimale.
 *   - senza virgola: i punti sono separatori di migliaia solo se la stringa ha
 *     la forma di un numero raggruppato ("1.000", "1.234.567"), con prima cifra
 *     diversa da zero; altrimenti il punto resta decimale ("1.5", "19.99",
 *     "0.125").
 *   - più di una virgola → NaN; senza virgola, più punti che non formano
 *     gruppi di migliaia ("1.23.456") → input ambiguo → NaN. Con la virgola
 *     i punti vengono rimossi senza controllarne la posizione.
 *
 * Usato dai tool /strumenti/* per evitare che "1.234,56" venga letto come 1.234.
 */
export function parseItalianNumber(input: string): number {
  const trimmed = input.trim();
  if (trimmed.length === 0) return Number.NaN;

  const commaCount = (trimmed.match(/,/g) ?? []).length;
  if (commaCount > 1) return Number.NaN;

  if (commaCount === 1) {
    return Number.parseFloat(trimmed.replaceAll(".", "").replace(",", "."));
  }

  const dotCount = (trimmed.match(/\./g) ?? []).length;
  if (dotCount === 0) {
    return Number.parseFloat(trimmed);
  }

  const looksLikeThousands = /^[+-]?[1-9]\d{0,2}(\.\d{3})+$/.test(trimmed);
  if (dotCount > 1 && !looksLikeThousands) return Number.NaN;
  return Number.parseFloat(
    looksLikeThousands ? trimmed.replaceAll(".", "") : trimmed,
  );
}
