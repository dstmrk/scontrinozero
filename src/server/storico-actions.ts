"use server";

import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocumentLines, commercialDocuments } from "@/db/schema";
import {
  checkBusinessOwnership,
  getAuthenticatedUser,
} from "@/lib/server-auth";
import type { ReceiptListItem, SearchReceiptsParams } from "@/types/storico";

// ---------------------------------------------------------------------------
// searchReceipts
// ---------------------------------------------------------------------------

/**
 * Restituisce la lista degli scontrini (SALE) del business, con filtri opzionali.
 *
 * Ordine: DESC createdAt (più recenti prima).
 * Source: DB locale (nessuna chiamata AdE).
 */
export async function searchReceipts(
  businessId: string,
  params: SearchReceiptsParams = {},
): Promise<ReceiptListItem[]> {
  const user = await getAuthenticatedUser();
  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) {
    throw new Error("Non autorizzato.");
  }

  const db = getDb();

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
  }

  const docs = await db
    .select()
    .from(commercialDocuments)
    .where(and(...conditions))
    .orderBy(desc(commercialDocuments.createdAt));

  if (docs.length === 0) return [];

  // Fetch all lines in a single query
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

  return docs.map((doc) => {
    const docLines = linesByDocId.get(doc.id) ?? [];
    const total =
      Math.round(
        docLines.reduce(
          (sum, l) =>
            sum + parseFloat(l.grossUnitPrice) * parseFloat(l.quantity),
          0,
        ) * 100,
      ) / 100;

    return {
      id: doc.id,
      kind: doc.kind as "SALE" | "VOID",
      status: doc.status as ReceiptListItem["status"],
      adeProgressive: doc.adeProgressive,
      adeTransactionId: doc.adeTransactionId,
      createdAt: doc.createdAt,
      total: total.toFixed(2),
      lines: docLines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        grossUnitPrice: l.grossUnitPrice,
        vatCode: l.vatCode,
      })),
    };
  });
}
