import { asc, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocumentLines } from "@/db/schema";
import type { SelectCommercialDocumentLine } from "@/db/schema/commercial-document-lines";

/**
 * Fetches all lines for a given set of document IDs, ordered by lineIndex.
 */
export async function fetchLinesByDocIds(
  docIds: string[],
): Promise<SelectCommercialDocumentLine[]> {
  const db = getDb();
  return db
    .select()
    .from(commercialDocumentLines)
    .where(inArray(commercialDocumentLines.documentId, docIds))
    .orderBy(asc(commercialDocumentLines.lineIndex));
}

/**
 * Groups a flat list of document lines into a Map keyed by documentId.
 */
export function groupLinesByDocId(
  lines: SelectCommercialDocumentLine[],
): Map<string, SelectCommercialDocumentLine[]> {
  const map = new Map<string, SelectCommercialDocumentLine[]>();
  for (const line of lines) {
    const existing = map.get(line.documentId) ?? [];
    existing.push(line);
    map.set(line.documentId, existing);
  }
  return map;
}

/**
 * Calculates the total amount for a document's lines, rounded to 2 decimal places.
 * Uses string-based parseFloat to avoid IEEE-754 accumulation errors.
 */
export function calcDocTotal(lines: SelectCommercialDocumentLine[]): number {
  return (
    Math.round(
      lines.reduce(
        (sum, l) =>
          sum +
          Number.parseFloat(l.grossUnitPrice) * Number.parseFloat(l.quantity),
        0,
      ) * 100,
    ) / 100
  );
}
