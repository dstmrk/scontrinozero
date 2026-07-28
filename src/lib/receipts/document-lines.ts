import { asc, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocumentLines } from "@/db/schema";
import type { SelectCommercialDocumentLine } from "@/db/schema/commercial-document-lines";

/**
 * Minimal slice of Drizzle's tx/db API used here. Accepting both the pooled
 * `getDb()` instance and a `tx` from `db.transaction()` lets callers wrap
 * the call inside `withStatementTimeout()` without forking the function.
 */
type LineQueryRunner = {
  select: ReturnType<typeof getDb>["select"];
};

/**
 * Fetches all lines for a given set of document IDs, ordered by lineIndex.
 *
 * Pass `runner` to execute inside an existing transaction (so a parent
 * `SET LOCAL statement_timeout` applies to this query too). Defaults to the
 * pooled db instance when no runner is provided — preserves the legacy call
 * sites that don't need a shared transaction.
 */
export async function fetchLinesByDocIds(
  docIds: string[],
  runner: LineQueryRunner = getDb(),
): Promise<SelectCommercialDocumentLine[]> {
  return runner
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
 * La matematica monetaria vive in `receipt-totals.ts`, che è **puro e
 * client-safe**: questo modulo importa `getDb()`, quindi qualunque componente
 * client che ne importasse anche solo `computeReceiptTotals` si porterebbe
 * dietro il driver `postgres` nel bundle del browser (rilevato dal build
 * quando la stampa termica ha iniziato a riusarla). Stessa separazione di
 * `plans-shared.ts` vs `plans.ts`.
 *
 * Il re-export tiene stabili i call site server-side esistenti.
 */
export {
  calcDocTotal,
  calcInputLinesTotalCents,
  computeReceiptTotals,
} from "./receipt-totals";
export type {
  ReceiptLineAmounts,
  ReceiptLineCalc,
  ReceiptTotals,
} from "./receipt-totals";
