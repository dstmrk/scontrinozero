"use server";

import { and, count, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocuments } from "@/db/schema";
import {
  checkBusinessOwnership,
  getAuthenticatedUser,
} from "@/lib/server-auth";
import { authErrorResult } from "@/lib/auth-errors";
import {
  fetchLinesByDocIds,
  groupLinesByDocId,
  calcDocTotal,
} from "@/lib/receipts/document-lines";
import { parseStrictIsoDateUtc } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { isValidUuid } from "@/lib/uuid";
import {
  STORICO_PAGE_SIZE,
  type SearchReceiptsResult,
  type SearchReceiptsParams,
} from "@/types/storico";
import type { PaymentMethod } from "@/types/cassa";

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const MAX_PAGE_SIZE = 100;

/**
 * Estrae metodo di pagamento e codice lotteria dal jsonb `public_request`.
 *
 * La colonna è `unknown` (jsonb non tipizzato) e sulle righe storiche può
 * essere NULL o avere una forma diversa: si valida campo per campo invece di
 * castare. Il default `PC` interviene solo quando il dato manca davvero —
 * serve alla ristampa, che deve riportare il pagamento reale del documento.
 */
function parsePublicRequest(raw: unknown): {
  paymentMethod: PaymentMethod;
  lotteryCode: string | null;
} {
  const value = (raw ?? {}) as Record<string, unknown>;
  const paymentMethod = value.paymentMethod === "PE" ? "PE" : "PC";
  const lotteryCode =
    typeof value.lotteryCode === "string" && value.lotteryCode
      ? value.lotteryCode
      : null;
  return { paymentMethod, lotteryCode };
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
  // Sessione assente (scaduta con lo storico aperto) → degrada a { error }
  // inline invece di propagare all'error boundary di Next (regola 19/20).
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return { ...authErrorResult(err, "searchReceipts"), items: [], total: 0 };
  }
  // Guard UUID (regola 9): evita il 22P02 di Postgres in checkBusinessOwnership.
  if (!isValidUuid(businessId)) {
    return { error: "Identificativo non valido.", items: [], total: 0 };
  }
  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) {
    // Allinea il contratto a tutte le altre server actions: error envelope
    // invece di throw. Evita che la pagina RSC mostri il fallback error.tsx
    // su un IDOR e permette messaggi inline gestiti.
    logger.warn(
      { userId: user.id, businessId },
      "searchReceipts: ownership check failed",
    );
    return { error: ownershipError.error, items: [], total: 0 };
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

  // Total count + page (same conditions, no data-dependency) → in parallelo.
  const [[{ value: total }], docs] = await Promise.all([
    db
      .select({ value: count() })
      .from(commercialDocuments)
      .where(and(...conditions)),
    db
      .select({
        id: commercialDocuments.id,
        kind: commercialDocuments.kind,
        status: commercialDocuments.status,
        adeProgressive: commercialDocuments.adeProgressive,
        adeTransactionId: commercialDocuments.adeTransactionId,
        createdAt: commercialDocuments.createdAt,
        adeRegisteredAt: commercialDocuments.adeRegisteredAt,
        // Serve alla ristampa su termica: la copia consegnata al cliente deve
        // riportare il metodo di pagamento REALE del documento trasmesso
        // all'AdE, non un default.
        publicRequest: commercialDocuments.publicRequest,
      })
      .from(commercialDocuments)
      .where(and(...conditions))
      // `id` (UUID PRIMARY KEY) come chiave secondaria rende l'ordine TOTALE:
      // a parita' di `created_at` Postgres non garantisce un ordine stabile
      // fra due esecuzioni, e navigando fra le pagine un documento potrebbe
      // comparire due volte o sparire.
      .orderBy(
        desc(commercialDocuments.createdAt),
        desc(commercialDocuments.id),
      )
      .limit(pageSize)
      .offset(offset),
  ]);

  if (docs.length === 0) return { items: [], total };

  // Fetch lines only for the current page's documents
  const docIds = docs.map((d) => d.id);
  const lines = await fetchLinesByDocIds(docIds);
  const linesByDocId = groupLinesByDocId(lines);

  const items = docs.map((doc) => {
    const docLines = linesByDocId.get(doc.id) ?? [];
    const docTotal = calcDocTotal(docLines);
    const publicRequest = parsePublicRequest(doc.publicRequest);

    return {
      id: doc.id,
      kind: doc.kind,
      status: doc.status,
      adeProgressive: doc.adeProgressive,
      adeTransactionId: doc.adeTransactionId,
      createdAt: doc.createdAt,
      adeRegisteredAt: doc.adeRegisteredAt,
      paymentMethod: publicRequest.paymentMethod,
      lotteryCode: publicRequest.lotteryCode,
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
