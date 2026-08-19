/**
 * UTF-8 Byte Order Mark. Senza, Excel italiano legge il file come ANSI e
 * sfascia gli accenti (`Caffè` → `CaffÃ¨`). Riguarda **solo** l'encoding: il
 * separatore di campo è un'altra cosa, vedi `CSV_SEPARATOR`.
 */
export const CSV_BOM = "﻿";

/**
 * Separatore di campo: **punto e virgola**, non virgola.
 *
 * Excel usa il "separatore di elenco" di sistema, che in locale italiano è
 * `;`: un file separato da virgole aperto con doppio clic finisce tutto in una
 * colonna sola, e va reimportato a mano da Dati → Da testo. Così la virgola
 * resta libera per il separatore decimale, che in italiano è lei (`12,50`) —
 * ed è il motivo per cui le due scelte vanno prese insieme.
 */
export const CSV_SEPARATOR = ";";

const FORMULA_LEADERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/**
 * Tipi accettati come singolo campo CSV. Restringere a primitivi + Date
 * evita di affidarsi al `[object Object]` di `String(any)`, che e' quasi
 * sempre un bug del caller.
 */
export type CsvFieldValue =
  string | number | boolean | bigint | Date | null | undefined;

/**
 * Restituisce true se il campo deve essere wrappato in virgolette doppie
 * (contiene il separatore, virgolette doppie, CR o LF).
 *
 * Il controllo e' sul separatore in uso, non sulla virgola: con `;` un totale
 * come `12,50` non ha bisogno di quoting, mentre una descrizione con un punto
 * e virgola dentro si'.
 */
function needsQuoting(value: string): boolean {
  for (const c of value) {
    if (c === CSV_SEPARATOR || c === '"' || c === "\n" || c === "\r")
      return true;
  }
  return false;
}

function valueToString(
  value: Exclude<CsvFieldValue, null | undefined>,
): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  // number / boolean / bigint — tutte hanno toString() ben definita.
  return String(value);
}

/**
 * Escape conforme RFC 4180 di un singolo campo CSV.
 *
 * - null/undefined → stringa vuota
 * - numeri/booleani/bigint/Date → toString / toISOString
 * - separatore, doppia quote, newline → wrap in `"..."`
 * - doppia quote interna raddoppiata
 *
 * Protegge anche da CSV formula injection (Excel/LibreOffice eseguono
 * formule se il campo inizia con `=`, `+`, `-`, `@`, TAB, CR): in quel caso
 * viene anteposto un apostrofo che neutralizza l'interpretazione come
 * formula senza alterare la lettura visiva in molti tool.
 */
export function escapeCsvField(value: CsvFieldValue): string {
  if (value === null || value === undefined) return "";

  let str = valueToString(value);

  if (str.length > 0 && FORMULA_LEADERS.has(str[0])) {
    str = `'${str}`;
  }

  if (needsQuoting(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

/**
 * Costruisce una singola riga CSV (campi separati da `CSV_SEPARATOR`,
 * terminatore CRLF come da RFC 4180).
 */
export function rowToCsv(fields: readonly CsvFieldValue[]): string {
  return fields.map(escapeCsvField).join(CSV_SEPARATOR) + "\r\n";
}
