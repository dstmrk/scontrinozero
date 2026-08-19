"use server";

import { and, count, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { commercialDocuments } from "@/db/schema";
import type {
  SelectCommercialDocument,
  SelectCommercialDocumentLine,
} from "@/db/schema";
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
  type GetReceiptDetailResult,
  type ReceiptListItem,
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
 * Ordine: DESC adeRegisteredAt (più recenti prima).
 * Source: DB locale (nessuna chiamata AdE).
 */
/**
 * Self-join per trovare l'annullo di una vendita: `commercial_documents`
 * contiene entrambi, collegati da `voided_document_id`. Stesso alias e stesse
 * condizioni di `src/lib/receipts/csv-export.ts`, dove il JOIN esiste già.
 */
const voidDocAlias = alias(commercialDocuments, "void_doc");

/**
 * Condizione del JOIN sull'annullo: solo il VOID accettato che punta a questa
 * vendita. Estratta perché `searchReceipts` e `getReceiptDetail` devono
 * leggere la stessa riga — una delle due che divergesse darebbe due verità
 * diverse sullo stesso documento.
 */
const voidDocJoinCondition = and(
  eq(voidDocAlias.voidedDocumentId, commercialDocuments.id),
  eq(voidDocAlias.kind, "VOID"),
  eq(voidDocAlias.status, "VOID_ACCEPTED"),
);

/** Colonne di una riga dello storico, condivise fra elenco e dettaglio. */
const receiptColumns = {
  id: commercialDocuments.id,
  kind: commercialDocuments.kind,
  status: commercialDocuments.status,
  adeProgressive: commercialDocuments.adeProgressive,
  adeTransactionId: commercialDocuments.adeTransactionId,
  createdAt: commercialDocuments.createdAt,
  adeRegisteredAt: commercialDocuments.adeRegisteredAt,
  // L'annullo collegato, quando la vendita è stata annullata: è ciò da
  // cui il dettaglio apre e stampa la ricevuta di annullamento.
  voidDocumentId: voidDocAlias.id,
  voidAdeProgressive: voidDocAlias.adeProgressive,
  voidAdeRegisteredAt: voidDocAlias.adeRegisteredAt,
  // Serve alla ristampa su termica: la copia consegnata al cliente deve
  // riportare il metodo di pagamento REALE del documento trasmesso
  // all'AdE, non un default.
  publicRequest: commercialDocuments.publicRequest,
};

type ReceiptDocRow = Pick<
  SelectCommercialDocument,
  | "id"
  | "kind"
  | "status"
  | "adeProgressive"
  | "adeTransactionId"
  | "createdAt"
  | "adeRegisteredAt"
  | "publicRequest"
> & {
  voidDocumentId: string | null;
  voidAdeProgressive: string | null;
  voidAdeRegisteredAt: Date | null;
};

/** Compone la riga DB + le sue righe articolo nella forma esposta al client. */
function toReceiptListItem(
  doc: ReceiptDocRow,
  docLines: SelectCommercialDocumentLine[],
): ReceiptListItem {
  const publicRequest = parsePublicRequest(doc.publicRequest);

  return {
    id: doc.id,
    kind: doc.kind,
    status: doc.status,
    adeProgressive: doc.adeProgressive,
    adeTransactionId: doc.adeTransactionId,
    createdAt: doc.createdAt,
    adeRegisteredAt: doc.adeRegisteredAt,
    voidDocument:
      doc.voidDocumentId && doc.voidAdeProgressive && doc.voidAdeRegisteredAt
        ? {
            id: doc.voidDocumentId,
            adeProgressive: doc.voidAdeProgressive,
            adeRegisteredAt: doc.voidAdeRegisteredAt,
          }
        : null,
    paymentMethod: publicRequest.paymentMethod,
    lotteryCode: publicRequest.lotteryCode,
    total: calcDocTotal(docLines).toFixed(2),
    lines: docLines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      grossUnitPrice: l.grossUnitPrice,
      vatCode: l.vatCode,
    })),
  };
}

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

  // Filtro di periodo su `ade_registered_at`, la stessa grandezza che la riga
  // mostra: con il predicato su `created_at` una vendita registrata dall'AdE
  // il 1° febbraio compariva filtrando gennaio, con scritto accanto 01/02.
  // Stessa scelta dell'export CSV — elenco ed export partono dagli stessi
  // filtri, se divergessero il conteggio a schermo e le righe del file non
  // tornerebbero. Indice dedicato: migrazione 0032.
  let dateFromDate: Date | null = null;
  if (params.dateFrom) {
    dateFromDate = parseStrictIsoDateUtc(params.dateFrom);
    if (!dateFromDate)
      return {
        error: "Filtro data 'dateFrom' non valido.",
        items: [],
        total: 0,
      };
    conditions.push(gte(commercialDocuments.adeRegisteredAt, dateFromDate));
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
    conditions.push(lt(commercialDocuments.adeRegisteredAt, toExclusive));
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
      .select(receiptColumns)
      .from(commercialDocuments)
      .leftJoin(voidDocAlias, voidDocJoinCondition)
      .where(and(...conditions))
      // `id` (UUID PRIMARY KEY) come chiave secondaria rende l'ordine TOTALE:
      // a parita' di `ade_registered_at` Postgres non garantisce un ordine
      // stabile fra due esecuzioni, e navigando fra le pagine un documento
      // potrebbe comparire due volte o sparire.
      .orderBy(
        desc(commercialDocuments.adeRegisteredAt),
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

  const items = docs.map((doc) =>
    toReceiptListItem(doc, linesByDocId.get(doc.id) ?? []),
  );

  return { items, total };
}

// ---------------------------------------------------------------------------
// getReceiptDetail
// ---------------------------------------------------------------------------

/**
 * Rilegge UNA vendita con le stesse colonne e lo stesso JOIN sull'annullo di
 * `searchReceipts`.
 *
 * Serve allo storico subito dopo un annullo riuscito: l'aggiornamento
 * ottimistico della riga conosce solo il nuovo `status`, mentre l'annullo
 * appena creato (id, progressivo, istante registrato dall'AdE) esiste solo sul
 * server. Senza questa rilettura la modale riaperta non offrirebbe né la
 * ricevuta di annullamento né la sua stampa finché l'utente non rifà la
 * ricerca.
 *
 * Degrada a `{ item: null, error }` invece di lanciare (regola 19): il
 * chiamante tiene la riga aggiornata in modo ottimistico.
 */
export async function getReceiptDetail(
  businessId: string,
  documentId: string,
): Promise<GetReceiptDetailResult> {
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return { ...authErrorResult(err, "getReceiptDetail"), item: null };
  }

  // Guard UUID (regola 9) su entrambi gli identificativi: sono colonne uuid,
  // un valore malformato darebbe un 22P02 di Postgres invece di un errore
  // applicativo.
  if (!isValidUuid(businessId) || !isValidUuid(documentId)) {
    return { error: "Identificativo non valido.", item: null };
  }

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) {
    logger.warn(
      { userId: user.id, businessId },
      "getReceiptDetail: ownership check failed",
    );
    return { error: ownershipError.error, item: null };
  }

  const db = getDb();
  const [doc] = await db
    .select(receiptColumns)
    .from(commercialDocuments)
    .leftJoin(voidDocAlias, voidDocJoinCondition)
    .where(
      and(
        eq(commercialDocuments.id, documentId),
        eq(commercialDocuments.businessId, businessId),
        eq(commercialDocuments.kind, "SALE"),
      ),
    )
    .limit(1);

  if (!doc) return { item: null };

  const lines = await fetchLinesByDocIds([doc.id]);
  return { item: toReceiptListItem(doc, lines) };
}
