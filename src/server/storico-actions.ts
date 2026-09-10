"use server";

import { and, count, desc, eq, gte, inArray, lt, type SQL } from "drizzle-orm";
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
import {
  parseRomeDayEndExclusiveUtc,
  parseRomeDayStartUtc,
} from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { parsePublicRequest } from "@/lib/receipts/public-request";
import { isValidUuid } from "@/lib/uuid";
import {
  STORICO_PAGE_SIZE,
  type AdeReceiptListItem,
  type GetReceiptDetailResult,
  type ReceiptListItem,
  type SearchReceiptsResult,
  type SearchReceiptsParams,
  type SearchStoricoResult,
  type StoricoRow,
} from "@/types/storico";
import { assertProPlan } from "@/lib/plans";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { buildAdeSearchRange } from "@/lib/services/ade-document-search";
import { fetchForeignAdeRows } from "@/lib/services/ade-storico-rows";
import { compareStoricoOrder } from "@/lib/receipts/storico-order";

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
    origin: "local",
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
    payments: publicRequest.payments,
    lotteryCode: publicRequest.lotteryCode,
    globalDiscountCents: publicRequest.globalDiscountCents,
    total: calcDocTotal(docLines).toFixed(2),
    lines: docLines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      grossUnitPrice: l.grossUnitPrice,
      lineDiscount: l.lineDiscount,
      vatCode: l.vatCode,
    })),
  };
}

/**
 * Sessione, formato degli identificativi e proprietà del business: le tre
 * guardie che ogni lettura dello storico deve superare, in un punto solo.
 *
 * Ritorna `{ error }` invece di lanciare (regola 19): con lo storico aperto e
 * la sessione scaduta, la pagina mostra un messaggio inline al posto
 * dell'error boundary di Next.
 */
async function authorizeStorico(
  action: string,
  ids: readonly string[],
  businessId: string,
): Promise<{ userId: string } | { error: string }> {
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, action);
  }

  // Guard UUID (regola 9): evita il 22P02 di Postgres a valle.
  if (ids.some((id) => !isValidUuid(id))) {
    return { error: "Identificativo non valido." };
  }

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) {
    // Allinea il contratto a tutte le altre server actions: error envelope
    // invece di throw. Evita che la pagina RSC mostri il fallback error.tsx
    // su un IDOR e permette messaggi inline gestiti.
    logger.warn(
      { userId: user.id, businessId },
      `${action}: ownership check failed`,
    );
    return { error: ownershipError.error };
  }

  return { userId: user.id };
}

/**
 * Predicati SQL di una ricerca nello storico, condivisi dalla ricerca locale e
 * da quella che include l'archivio AdE.
 *
 * Ritorna anche gli estremi risolti: la ricerca AdE deve poter filtrare le
 * righe del portale con **gli stessi** confini che il DB applica alle nostre,
 * altrimenti le due sorgenti mostrerebbero due giornate diverse.
 */
function buildStoricoConditions(
  businessId: string,
  params: SearchReceiptsParams,
):
  | { conditions: SQL[]; from: Date | null; toExclusive: Date | null }
  | { error: string } {
  const conditions: SQL[] = [
    eq(commercialDocuments.businessId, businessId),
    // Show only SALE documents (VOID docs are internal bookkeeping)
    eq(commercialDocuments.kind, "SALE"),
  ];

  // Filtro di periodo su `ade_registered_at`, la stessa grandezza che la riga
  // mostra: con il predicato su `created_at` una vendita registrata dall'AdE
  // il 1° febbraio compariva filtrando gennaio, con scritto accanto 01/02.
  // Stessa scelta dell'export CSV — elenco ed export partono dagli stessi
  // filtri, se divergessero il conteggio a schermo e le righe del file non
  // tornerebbero. Indice dedicato: migrazione 0032. Gli estremi sono le
  // mezzanotti **italiane**, non UTC: la giornata che l'esercente chiude e'
  // quella del suo calendario.
  let from: Date | null = null;
  if (params.dateFrom) {
    from = parseRomeDayStartUtc(params.dateFrom);
    if (!from) return { error: "Filtro data 'dateFrom' non valido." };
    conditions.push(gte(commercialDocuments.adeRegisteredAt, from));
  }

  let toExclusive: Date | null = null;
  if (params.dateTo) {
    // Estremo superiore esclusivo: l'inizio del giorno italiano successivo.
    toExclusive = parseRomeDayEndExclusiveUtc(params.dateTo);
    if (!toExclusive) return { error: "Filtro data 'dateTo' non valido." };
    // Confronto sulle stringhe yyyy-MM-dd: ordinamento lessicografico ==
    // cronologico, e non risente del giorno-dopo dell'estremo superiore.
    if (params.dateFrom && params.dateFrom > params.dateTo) {
      return {
        error: "La data di inizio non può essere successiva alla data di fine.",
      };
    }
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

  return { conditions, from, toExclusive };
}

export async function searchReceipts(
  businessId: string,
  params: SearchReceiptsParams = {},
): Promise<SearchReceiptsResult> {
  const auth = await authorizeStorico(
    "searchReceipts",
    [businessId],
    businessId,
  );
  if ("error" in auth) return { error: auth.error, items: [], total: 0 };

  const db = getDb();
  // Clamp page/pageSize: prevents large queries from tampered server action calls.
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, params.pageSize ?? STORICO_PAGE_SIZE),
  );
  const offset = (page - 1) * pageSize;

  const built = buildStoricoConditions(businessId, params);
  if ("error" in built) return { error: built.error, items: [], total: 0 };
  const { conditions } = built;

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
  const auth = await authorizeStorico(
    "getReceiptDetail",
    [businessId, documentId],
    businessId,
  );
  if ("error" in auth) return { error: auth.error, item: null };

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

// ---------------------------------------------------------------------------
// searchStorico — ricerca che include anche l'archivio AdE (Pro, v1.8.0)
// ---------------------------------------------------------------------------

/**
 * 20 ricerche/ora per utente.
 *
 * Stessa soglia e stessa unità di costo della verifica di uno scontrino in
 * sospeso (`pending-actions.ts`): ogni ricerca con il flag attivo paga un login
 * AdE più una o più `searchDocuments`, cioè secondi di attesa e traffico sul
 * portale **a nome dell'esercente**. È una guardia anti-loop, non throttling di
 * business: chi cerca venti volte in un'ora sta tenendo premuto un pulsante.
 */
const adeSearchLimiter = new RateLimiter({
  maxRequests: 20,
  windowMs: RATE_LIMIT_WINDOWS.HOURLY,
});

/**
 * Una riga in attesa di essere ordinata. Le righe nostre entrano nel merge
 * come due sole colonne — id e istante — e diventano documenti interi solo
 * dopo lo `slice` della pagina.
 */
type StoricoSortable =
  | {
      readonly origin: "local";
      readonly id: string;
      readonly adeRegisteredAt: Date;
    }
  | AdeReceiptListItem;

/**
 * Rilegge per intero le sole righe nostre finite nella pagina richiesta.
 *
 * Il predicato su `business_id` è ridondante oggi — gli id arrivano
 * dall'indice, che è già filtrato — ma una query che dipende da chi la chiama
 * per restare sicura smette di esserlo al primo secondo chiamante.
 */
async function hydrateLocalRows(
  businessId: string,
  ids: readonly string[],
): Promise<Map<string, ReceiptListItem>> {
  if (ids.length === 0) return new Map();

  const db = getDb();
  const docs = await db
    .select(receiptColumns)
    .from(commercialDocuments)
    .leftJoin(voidDocAlias, voidDocJoinCondition)
    .where(
      and(
        eq(commercialDocuments.businessId, businessId),
        inArray(commercialDocuments.id, [...ids]),
      ),
    );

  const lines = await fetchLinesByDocIds(docs.map((d) => d.id));
  const linesByDocId = groupLinesByDocId(lines);

  return new Map(
    docs.map((doc) => [
      doc.id,
      toReceiptListItem(doc, linesByDocId.get(doc.id) ?? []),
    ]),
  );
}

/**
 * Elenco storico che include anche i documenti commerciali presenti solo
 * sull'archivio AdE — emessi dal portale, dall'app o da un altro software che
 * usa lo stesso servizio (feature Pro, v1.8.0).
 *
 * **Sola lettura, e nessuna copia.** I documenti AdE non entrano nel nostro
 * database: vivono per la durata di questa risposta. Non sono annullabili
 * (l'annullo creerebbe una riga VOID il cui `voided_document_id` non punta a
 * nulla) e non hanno voci vendute (la ricerca AdE dà la sola testata).
 *
 * **Perché una action separata da `searchReceipts`.** Non è una variante dello
 * stesso gesto: qui l'impaginazione non può stare in SQL. Il nostro elenco
 * pagina con `LIMIT/OFFSET`, AdE con `page`/`perPage` sul suo `totalCount`, e
 * due sorgenti ordinate con offset indipendenti non si fondono in una query —
 * una pagina chiesta a metà di ognuna salterebbe righe. Il merge corretto è in
 * memoria sulle due liste intere, ed è ciò che paga il tetto sul periodo.
 * Tenerle separate lascia intatta la ricerca di tutti i giorni, che resta una
 * query e basta.
 */
export async function searchReceiptsIncludingAde(
  businessId: string,
  params: SearchReceiptsParams = {},
): Promise<SearchStoricoResult> {
  const auth = await authorizeStorico(
    "searchReceiptsIncludingAde",
    [businessId],
    businessId,
  );
  if ("error" in auth) return { error: auth.error, items: [], total: 0 };

  // Gate di piano prima di qualunque lavoro: la ricerca su AdE è Pro.
  // `assertProPlan` porta con sé la classificazione degli errori di lettura
  // del piano (profilo mancante, timeout DB) che qui servirebbe comunque.
  const proCheck = await assertProPlan(auth.userId);
  if (!proCheck.ok) return { error: proCheck.error, items: [], total: 0 };

  const rate = adeSearchLimiter.check(`storicoAde:${auth.userId}`);
  if (!rate.success) {
    logger.warn(
      { userId: auth.userId },
      "Ricerca storico AdE: rate limit superato",
    );
    return {
      error: "Troppe ricerche ravvicinate. Riprova tra qualche minuto.",
      items: [],
      total: 0,
    };
  }

  const built = buildStoricoConditions(businessId, params);
  if ("error" in built) return { error: built.error, items: [], total: 0 };

  // Periodo assente o troppo largo → rifiuto, non degrado silenzioso: un
  // elenco locale presentato come se includesse l'AdE mentirebbe.
  const range = buildAdeSearchRange(params.dateFrom, params.dateTo);
  if ("error" in range) return { error: range.error, items: [], total: 0 };

  const db = getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, params.pageSize ?? STORICO_PAGE_SIZE),
  );

  // L'indice locale è l'elenco COMPLETO del periodo, ma con due sole colonne:
  // serve a sapere quante righe nostre precedono ciascuna riga AdE, e senza di
  // esso non si può dire quali documenti cadano nella pagina richiesta. Le
  // righe intere si rileggono dopo, solo per la pagina.
  const [index, adeBranch] = await Promise.all([
    db
      .select({
        id: commercialDocuments.id,
        adeRegisteredAt: commercialDocuments.adeRegisteredAt,
      })
      .from(commercialDocuments)
      .where(and(...built.conditions)),
    fetchForeignAdeRows({
      businessId,
      range,
      ...(params.status ? { status: params.status } : {}),
      from: built.from,
      toExclusive: built.toExclusive,
    }),
  ]);

  let adeRows: AdeReceiptListItem[] = [];
  let adeTruncated = false;
  const degraded: Pick<SearchStoricoResult, "adeError" | "adeReauthRequired"> =
    {};

  if ("adeError" in adeBranch) {
    degraded.adeError = adeBranch.adeError;
    if (adeBranch.adeReauthRequired) degraded.adeReauthRequired = true;
  } else {
    adeTruncated = adeBranch.truncated;
    adeRows = adeBranch.rows;
  }

  // Solo ciò che serve a ordinare: le righe nostre qui sono ancora due
  // colonne, e diventano documenti interi solo dopo lo `slice` della pagina.
  const merged: StoricoSortable[] = [
    ...index.map((row) => ({
      origin: "local" as const,
      id: row.id,
      adeRegisteredAt: row.adeRegisteredAt,
    })),
    ...adeRows,
  ].sort((a, b) =>
    compareStoricoOrder(
      { ...a, sortId: a.origin === "ade" ? a.idtrx : a.id },
      { ...b, sortId: b.origin === "ade" ? b.idtrx : b.id },
    ),
  );

  const pageRows = merged.slice((page - 1) * pageSize, page * pageSize);
  const hydrated = await hydrateLocalRows(
    businessId,
    pageRows.filter((row) => row.origin === "local").map((row) => row.id),
  );

  const items: StoricoRow[] = [];
  for (const row of pageRows) {
    if (row.origin === "ade") {
      items.push(row);
      continue;
    }
    // Sparita fra l'indice e la rilettura (annullata e ri-filtrata, purgata):
    // si salta invece di mostrare un guscio senza totale né righe.
    const full = hydrated.get(row.id);
    if (full) items.push(full);
  }

  return { items, total: merged.length, ...degraded, adeTruncated };
}
