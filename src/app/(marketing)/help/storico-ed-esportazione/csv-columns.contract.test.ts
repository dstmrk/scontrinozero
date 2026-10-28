// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RECEIPT_CSV_HEADERS,
  RECEIPT_LINES_CSV_HEADERS,
} from "@/lib/receipts/csv-export";

/**
 * Le tabelle delle colonne nella pagina help dello Storico devono elencare
 * tutte le colonne dei due export. La colonna `emesso_da` (issue #1099) è
 * arrivata nel CSV senza arrivare qui: un commercialista che legge l'help non
 * l'avrebbe trovata. Il test legge le celle `font-mono` del sorgente della
 * pagina, dove ogni colonna (o gruppo di colonne separate da virgola) ha la
 * sua.
 */
const PAGE = readFileSync(path.join(import.meta.dirname, "page.tsx"), "utf8");

/** Le colonne nominate nelle celle `font-mono` di `source`, in ordine. */
function columnsIn(source: string): string[] {
  const cells = source.matchAll(/font-mono text-xs">\s*([^<]*?)\s*</g);
  return [...cells].flatMap((match) =>
    match[1].split(",").map((column) => column.trim()),
  );
}

function documentedColumns(): Set<string> {
  return new Set(columnsIn(PAGE));
}

/** Le colonne della tabella che segue il titolo `heading`, in ordine. */
function tableColumns(heading: string): string[] {
  const start = PAGE.indexOf(heading);
  const end = PAGE.indexOf("</table>", start);
  if (start === -1 || end === -1) throw new Error(`tabella ${heading} assente`);
  return columnsIn(PAGE.slice(start, end));
}

describe("help Storico ↔ colonne dell'export CSV", () => {
  const documented = documentedColumns();

  it.each([...new Set([...RECEIPT_CSV_HEADERS, ...RECEIPT_LINES_CSV_HEADERS])])(
    "la colonna %s è descritta",
    (column) => {
      expect(documented).toContain(column);
    },
  );
});

// Le tabelle seguono l'ordine del file: chi legge l'help per capire cosa c'è
// nella colonna N deve trovarla all'N-esima riga (issue #1131).
describe("help Storico ↔ ordine delle colonne dell'export CSV", () => {
  it.each([
    ["Le colonne del riepilogo", RECEIPT_CSV_HEADERS],
    ["Le colonne del dettaglio", RECEIPT_LINES_CSV_HEADERS],
  ] as const)("«%s» segue l'ordine degli header", (heading, headers) => {
    expect(tableColumns(heading)).toEqual([...headers]);
  });
});
