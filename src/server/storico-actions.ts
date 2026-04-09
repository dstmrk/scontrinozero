"use server";

import { and, asc, count, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocumentLines, commercialDocuments } from "@/db/schema";
import {
  checkBusinessOwnership,
  getAuthenticatedUser,
} from "@/lib/server-auth";
import {
  STORICO_PAGE_SIZE,
  type SearchReceiptsResult,
  type SearchReceiptsParams,
} from "@/types/storico";

// ---------------------------------------------------------------------------
// searchReceipts
// ---------------------------------------------------------------------------

/**
 * Restituisce la lista paginata degli scontrini (SALE) del business, con filtri opzionali.
 *
 * Ordine: DESC createdAt (più recenti prima).
 * Source: DB locale (nessuna chiamata AdE).
 */
export async function searchReceipts(
  businessId: string,
  params: SearchReceiptsParams = {},
): Promise<SearchReceiptsResult> {
  const user = await getAuthenticatedUser();
  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) {
    throw new Error("Non autorizzato.");
  }

  const db = getDb();
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? STORICO_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  // Build conditions
  const conditions = [
    eq(commercialDocuments.businessId, businessId),
    // Show only SALE documents (VOID docs are internal bookkeeping)
    eq(commercialDocuments.kind, "SALE"),
  ];

  if (params.dateFrom) {
    conditions.push(
      gte(commercialDocuments.createdAt, new Date(params.dateFrom)),
    );
  }
  if (params.dateTo) {
    // Include the entire day by adding 1 day
    const dateTo = new Date(params.dateTo);
    dateTo.setDate(dateTo.getDate() + 1);
    conditions.push(lt(commercialDocuments.createdAt, dateTo));
  }
  if (params.status) {
    conditions.push(eq(commercialDocuments.status, params.status));
  } else {
    // "Tutti" means only successfully processed documents — never show failed attempts
    conditions.push(
      inArray(commercialDocuments.status, ["ACCEPTED", "VOID_ACCEPTED"]),
    );
  }

  // Total count (same conditions, no pagination)
  const [{ value: total }] = await db
    .select({ value: count() })
    .from(commercialDocuments)
    .where(and(...conditions));

  const docs = await db
    .select({
      id: commercialDocuments.id,
      kind: commercialDocuments.kind,
      status: commercialDocuments.status,
      adeProgressive: commercialDocuments.adeProgressive,
      adeTransactionId: commercialDocuments.adeTransactionId,
      createdAt: commercialDocuments.createdAt,
    })
    .from(commercialDocuments)
    .where(and(...conditions))
    .orderBy(desc(commercialDocuments.createdAt))
    .limit(pageSize)
    .offset(offset);

  if (docs.length === 0) return { items: [], total };

  // Fetch lines only for the current page's documents
  const docIds = docs.map((d) => d.id);
  const lines = await db
    .select()
    .from(commercialDocumentLines)
    .where(inArray(commercialDocumentLines.documentId, docIds))
    .orderBy(asc(commercialDocumentLines.lineIndex));

  // Group lines by documentId
  const linesByDocId = new Map<string, typeof lines>();
  for (const line of lines) {
    const existing = linesByDocId.get(line.documentId) ?? [];
    existing.push(line);
    linesByDocId.set(line.documentId, existing);
  }

  const items = docs.map((doc) => {
    const docLines = linesByDocId.get(doc.id) ?? [];
    const docTotal =
      Math.round(
        docLines.reduce(
          (sum, l) =>
            sum +
            Number.parseFloat(l.grossUnitPrice) * Number.parseFloat(l.quantity),
          0,
        ) * 100,
      ) / 100;

    return {
      id: doc.id,
      kind: doc.kind,
      status: doc.status,
      adeProgressive: doc.adeProgressive,
      adeTransactionId: doc.adeTransactionId,
      createdAt: doc.createdAt,
      total: docTotal.toFixed(2),
      lines: docLines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        grossUnitPrice: l.grossUnitPrice,
        vatCode: l.vatCode,
      })),
    };
  });

  return { items, total };
}
