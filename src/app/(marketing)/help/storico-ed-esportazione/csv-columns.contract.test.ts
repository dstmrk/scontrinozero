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

function documentedColumns(): Set<string> {
  const cells = PAGE.matchAll(/font-mono text-xs">\s*([^<]*?)\s*</g);
  return new Set(
    [...cells].flatMap((match) =>
      match[1].split(",").map((column) => column.trim()),
    ),
  );
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
