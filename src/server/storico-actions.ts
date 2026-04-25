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
import { parseStrictIsoDateUtc } from "@/lib/date-utils";
import {
  STORICO_PAGE_SIZE,
  type SearchReceiptsResult,
  type SearchReceiptsParams,
} from "@/types/storico";

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const MAX_PAGE_SIZE = 100;

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

  let dateFromDate: Date | null = null;
  if (params.dateFrom) {
    dateFromDate = parseStrictIsoDateUtc(params.dateFrom);
    if (!dateFromDate)
      return {
        error: "Filtro data 'dateFrom' non valido.",
        items: [],
        total: 0,
      };
    conditions.push(gte(commercialDocuments.createdAt, dateFromDate));
  }

  if (params.dateTo) {
    const dateToDate = parseStrictIsoDateUtc(params.dateTo);
    if (!dateToDate)
      return { error: "Filtro data 'dateTo' non valido.", items: [], total: 0 };
    if (dateFromDate && dateFromDate > dateToDate)
      return {
        error: "La data di inizio non può essere successiva alla data di fine.",
        items: [],
        total: 0,
      };
    const toExclusive = new Date(dateToDate);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    conditions.push(lt(commercialDocuments.createdAt, toExclusive));
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
