/**
 * Parser robusto per importi inseriti da utenti italiani. Gestisce tre forme:
 *   - inglese: "1234.56" / "1.5"
 *   - italiana decimale: "19,99"
 *   - italiana con separatore migliaia: "1.234,56" o "1.000"
 *
 * Regole:
 *   - se la stringa contiene una virgola, i punti sono separatori di migliaia
 *     (vengono rimossi) e la virgola è il separatore decimale.
 *   - senza virgola: i punti sono separatori di migliaia solo se ≥2 punti o
 *     se l'unico punto è seguito da esattamente 3 cifre ("1.000"); altrimenti
 *     il punto resta come separatore decimale ("1.5", "19.99").
 *   - più di una virgola → input ambiguo → NaN.
 *
 * Usato dai tool /strumenti/* per evitare che "1.234,56" venga letto come 1.234
 * (bug rilevato in code review Codex su PR #474, v1.2.12).
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

  const trailing = trimmed.slice(trimmed.lastIndexOf(".") + 1);
  const looksLikeThousands =
    dotCount >= 2 || (dotCount === 1 && /^\d{3}$/.test(trailing));
  return Number.parseFloat(
    looksLikeThousands ? trimmed.replaceAll(".", "") : trimmed,
  );
}
