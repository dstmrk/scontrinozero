"use server";

import { and, count, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocuments } from "@/db/schema";
import {
  checkBusinessOwnership,
  getAuthenticatedUser,
} from "@/lib/server-auth";
import {
  fetchLinesByDocIds,
  groupLinesByDocId,
  calcDocTotal,
} from "@/lib/receipts/document-lines";
import {
  STORICO_PAGE_SIZE,
  type SearchReceiptsResult,
  type SearchReceiptsParams,
} from "@/types/storico";

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const MAX_PAGE_SIZE = 100;

/** Returns a valid UTC-midnight Date for an ISO yyyy-MM-dd string, or null if invalid. */
function parseIsoDate(str: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = new Date(str + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

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
  // Clamp page/pageSize: prevents large queries from tampered server action calls.
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, params.pageSize ?? STORICO_PAGE_SIZE),
  );
  const offset = (page - 1) * pageSize;

  // Build conditions
  const conditions = [
    eq(commercialDocuments.businessId, businessId),
    // Show only SALE documents (VOID docs are internal bookkeeping)
    eq(commercialDocuments.kind, "SALE"),
  ];

  if (params.dateFrom) {
    // Validate format and value: silently ignore invalid dates instead of crashing.
    const d = parseIsoDate(params.dateFrom);
    if (d) {
      // Explicit UTC midnight: avoids local-timezone off-by-one on servers outside UTC
      conditions.push(gte(commercialDocuments.createdAt, d));
    }
  }
  if (params.dateTo) {
    const d = parseIsoDate(params.dateTo);
    if (d) {
      // Include the entire 'to' day by advancing to the start of the next UTC day
      d.setUTCDate(d.getUTCDate() + 1);
      conditions.push(lt(commercialDocuments.createdAt, d));
    }
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
  const lines = await fetchLinesByDocIds(docIds);
  const linesByDocId = groupLinesByDocId(lines);

  const items = docs.map((doc) => {
    const docLines = linesByDocId.get(doc.id) ?? [];
    const docTotal = calcDocTotal(docLines);

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
