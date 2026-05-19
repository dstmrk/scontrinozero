/**
 * UTF-8 Byte Order Mark. Excel italiano richiede il BOM all'inizio del file
 * per riconoscere l'encoding e applicare la virgola come separatore decimale.
 */
export const CSV_BOM = "﻿";

const FORMULA_LEADERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/**
 * Tipi accettati come singolo campo CSV. Restringere a primitivi + Date
 * evita di affidarsi al `[object Object]` di `String(any)`, che e' quasi
 * sempre un bug del caller.
 */
export type CsvFieldValue =
  | string
  | number
  | boolean
  | bigint
  | Date
  | null
  | undefined;

/**
 * Restituisce true se il campo deve essere wrappato in virgolette doppie
 * (contiene virgola, virgolette doppie, CR o LF).
 */
function needsQuoting(value: string): boolean {
  for (const c of value) {
    if (c === "," || c === '"' || c === "\n" || c === "\r") return true;
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
 * - virgola, doppia quote, newline → wrap in `"..."`
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
 * Costruisce una singola riga CSV (campi separati da virgola, terminatore CRLF
 * come da RFC 4180).
 */
export function rowToCsv(fields: readonly CsvFieldValue[]): string {
  return fields.map(escapeCsvField).join(",") + "\r\n";
}

/**
 * Concatena multiple righe CSV. Per export di grandi dimensioni preferire
 * `rowToCsv` riga-per-riga in streaming, evitando di costruire la stringa
 * intera in memoria.
 */
export function rowsToCsv(rows: readonly (readonly CsvFieldValue[])[]): string {
  let out = "";
  for (const row of rows) out += rowToCsv(row);
  return out;
}
