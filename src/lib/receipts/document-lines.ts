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
 * Calculates the total amount for a document's lines, rounded to 2 decimal places.
 *
 * Uses the CANONICAL per-line rounding strategy: each line is rounded to
 * integer cents (`round(qty * price * 100)`) and the cents are summed, exactly
 * like `computeReceiptTotals` and `calcInputLinesTotalCents`. This guarantees
 * that the total shown in the storico/analytics matches the total on the PDF,
 * the public receipt page and the amount transmitted to AdE — they all derive
 * from the same per-line cents. (Historically this rounded the float sum once
 * per document, which drifted by 1 cent from the per-line surfaces on
 * fractional quantities — REVIEW.md #1.)
 */
export function calcDocTotal(lines: SelectCommercialDocumentLine[]): number {
  return (
    lines.reduce(
      (sum, l) =>
        sum +
        Math.round(
          Number.parseFloat(l.grossUnitPrice) *
            Number.parseFloat(l.quantity) *
            100,
        ),
      0,
    ) / 100
  );
}

/**
 * Sums input lines (numeric `grossUnitPrice`/`quantity`, as produced by the
 * cassa/API before persistence) into integer cents using the CANONICAL
 * per-line rounding: `round(grossUnitPrice * quantity * 100)` per line, summed
 * as integers.
 *
 * Same formula as `computeReceiptTotals`/`calcDocTotal`, so the amount sent to
 * AdE (`payments[0].amount`) and the lottery €1,00 threshold reconcile to the
 * cent with the PDF, the public receipt page and the storico/analytics.
 */
export function calcInputLinesTotalCents(
  lines: ReadonlyArray<{ grossUnitPrice: number; quantity: number }>,
): number {
  return lines.reduce(
    (sum, l) => sum + Math.round(l.grossUnitPrice * l.quantity * 100),
    0,
  );
}

export interface ReceiptLineCalc {
  readonly qty: number;
  readonly price: number;
  /** Line total (qty * price) rounded to 2 decimals. */
  readonly lineTotal: number;
}

export interface ReceiptTotals {
  readonly perLine: readonly ReceiptLineCalc[];
  /** Sum of all line totals, rounded to 2 decimals. */
  readonly grandTotal: number;
  /** VAT amount per vatCode, each rounded to 2 decimals (only entries > 0). */
  readonly vatByCode: ReadonlyMap<string, number>;
}

/**
 * Computes deterministic totals for a receipt using cents-based integer math.
 * All summations and VAT splits happen in integer cents, then converted back
 * to euros at the end. This avoids IEEE-754 drift visible to users when many
 * lines or fractional quantities accumulate (e.g. 0.1 + 0.2 ≠ 0.3 in float).
 *
 * Used by the public receipt page and the PDF renderer.
 */
export function computeReceiptTotals(
  lines: readonly SelectCommercialDocumentLine[],
): ReceiptTotals {
  const perLine: ReceiptLineCalc[] = [];
  const vatByCodeCents = new Map<string, number>();
  let grandTotalCents = 0;

  for (const line of lines) {
    const qty = Number.parseFloat(line.quantity ?? "1");
    const price = Number.parseFloat(line.grossUnitPrice ?? "0");
    const lineTotalCents = Math.round(qty * price * 100);
    grandTotalCents += lineTotalCents;

    perLine.push({ qty, price, lineTotal: lineTotalCents / 100 });

    const rate = Number.parseFloat(line.vatCode);
    if (Number.isNaN(rate) || rate === 0) continue;

    // VAT = gross − gross / (1 + rate/100). Computed in cents to keep precision.
    const netCents = Math.round(lineTotalCents / (1 + rate / 100));
    const vatCents = lineTotalCents - netCents;
    if (vatCents <= 0) continue;

    vatByCodeCents.set(
      line.vatCode,
      (vatByCodeCents.get(line.vatCode) ?? 0) + vatCents,
    );
  }

  const vatByCode = new Map<string, number>();
  for (const [code, cents] of vatByCodeCents.entries()) {
    vatByCode.set(code, cents / 100);
  }

  return {
    perLine,
    grandTotal: grandTotalCents / 100,
    vatByCode,
  };
}
