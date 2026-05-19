/**
 * UTF-8 Byte Order Mark. Excel italiano richiede il BOM all'inizio del file
 * per riconoscere l'encoding e applicare la virgola come separatore decimale.
 */
export const CSV_BOM = "﻿";

const FORMULA_LEADERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/**
 * Restituisce true se il campo deve essere wrappato in virgolette doppie
 * (contiene virgola, virgolette doppie, CR o LF).
 */
function needsQuoting(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "," || c === '"' || c === "\n" || c === "\r") return true;
  }
  return false;
}

/**
 * Escape conforme RFC 4180 di un singolo campo CSV.
 *
 * - null/undefined → stringa vuota
 * - numeri/booleani/Date → toString / toISOString
 * - virgola, doppia quote, newline → wrap in `"..."`
 * - doppia quote interna raddoppiata
 *
 * Protegge anche da CSV formula injection (Excel/LibreOffice eseguono
 * formule se il campo inizia con `=`, `+`, `-`, `@`, TAB, CR): in quel caso
 * viene anteposto un apostrofo che neutralizza l'interpretazione come
 * formula senza alterare la lettura visiva in molti tool.
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";

  let str: string;
  if (value instanceof Date) {
    str = value.toISOString();
  } else {
    str = String(value);
  }

  if (str.length > 0 && FORMULA_LEADERS.has(str[0])) {
    str = `'${str}`;
  }

  if (needsQuoting(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Costruisce una singola riga CSV (campi separati da virgola, terminatore CRLF
 * come da RFC 4180).
 */
export function rowToCsv(fields: readonly unknown[]): string {
  return fields.map(escapeCsvField).join(",") + "\r\n";
}

/**
 * Concatena multiple righe CSV. Per export di grandi dimensioni preferire
 * `rowToCsv` riga-per-riga in streaming, evitando di costruire la stringa
 * intera in memoria.
 */
export function rowsToCsv(rows: readonly (readonly unknown[])[]): string {
  let out = "";
  for (const row of rows) out += rowToCsv(row);
  return out;
}
