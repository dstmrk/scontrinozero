"use server";

import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  like,
  lt,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { businessMembers, commercialDocuments } from "@/db/schema";
import type {
  SelectCommercialDocument,
  SelectCommercialDocumentLine,
} from "@/db/schema";
import {
  checkBusinessMembership,
  type BusinessMembership,
  getAuthenticatedUser,
} from "@/lib/server-auth";
import {
  collaboratorSuspendedError,
  OWNER_ONLY_MESSAGE,
  ownDocumentsCondition,
} from "@/lib/business-permissions";
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
import { fetchReturnedByLine } from "@/lib/receipts/returned-quantities";
import { isValidUuid } from "@/lib/uuid";
import {
  STORICO_PAGE_SIZE,
  type AdeReceiptListItem,
  type FindSaleForReturnResult,
  type GetReceiptDetailResult,
  type ReceiptListItem,
  type SearchReceiptsResult,
  type SearchReceiptsParams,
  type SearchStoricoResult,
  type StoricoRow,
} from "@/types/storico";
import { assertProPlan, getPlanSafe } from "@/lib/plans";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { buildAdeSearchRanges } from "@/lib/services/ade-document-search";
import { fetchForeignAdeRows } from "@/lib/services/ade-storico-rows";
import { compareStoricoOrder } from "@/lib/receipts/storico-order";
import {
  describeIssuer,
  issuerColumns,
  issuerCondition,
  issuerJoinCondition,
  type IssuerColumns,
} from "@/lib/receipts/document-issuer";

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

/**
 * Self-join inverso per un reso: la vendita a cui `returned_document_id`
 * punta. Su vendite e annulli la colonna è NULL e il JOIN non trova nulla.
 */
const returnedSaleAlias = alias(commercialDocuments, "returned_sale");
const returnedSaleJoinCondition = eq(
  returnedSaleAlias.id,
  commercialDocuments.returnedDocumentId,
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
  // Su un reso, la vendita resa: il riferimento che dettaglio e ristampa
  // portano ("Documento di riferimento", HAR.md #19g).
  returnOfId: returnedSaleAlias.id,
  returnOfAdeProgressive: returnedSaleAlias.adeProgressive,
  returnOfAdeRegisteredAt: returnedSaleAlias.adeRegisteredAt,
  // Serve alla ristampa su termica: la copia consegnata al cliente deve
  // riportare il metodo di pagamento REALE del documento trasmesso
  // all'AdE, non un default.
  publicRequest: commercialDocuments.publicRequest,
  // Chi ha emesso il documento (issue #1099): il titolare lo vede sulla riga.
  ...issuerColumns,
};

type Db = ReturnType<typeof getDb>;

/**
 * Le colonne di una riga dello storico con i loro tre JOIN: l'annullo, la
 * vendita resa e chi ha emesso. Elenco, dettaglio, ricerca per numero e
 * rilettura dopo il merge con l'AdE leggono la stessa forma.
 */
function selectReceipts(db: Db) {
  return db
    .select(receiptColumns)
    .from(commercialDocuments)
    .leftJoin(voidDocAlias, voidDocJoinCondition)
    .leftJoin(returnedSaleAlias, returnedSaleJoinCondition)
    .leftJoin(businessMembers, issuerJoinCondition);
}

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
  returnOfId: string | null;
  returnOfAdeProgressive: string | null;
  returnOfAdeRegisteredAt: Date | null;
} & IssuerColumns;

/** Compone la riga DB + le sue righe articolo nella forma esposta al client. */
function toReceiptListItem(
  doc: ReceiptDocRow,
  docLines: SelectCommercialDocumentLine[],
  returned?: ReadonlyMap<number, number>,
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
    returnOf:
      doc.returnOfId &&
      doc.returnOfAdeProgressive &&
      doc.returnOfAdeRegisteredAt
        ? {
            id: doc.returnOfId,
            adeProgressive: doc.returnOfAdeProgressive,
            adeRegisteredAt: doc.returnOfAdeRegisteredAt,
          }
        : null,
    issuer: describeIssuer(doc),
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
      returnedQuantity: String(returned?.get(l.lineIndex) ?? 0),
    })),
  };
}

/** Righe DB + righe articolo + già-reso → elementi dello storico. */
async function toReceiptListItems(
  docs: readonly ReceiptDocRow[],
): Promise<ReceiptListItem[]> {
  if (docs.length === 0) return [];
  const saleIds = docs.filter((d) => d.kind === "SALE").map((d) => d.id);
  const [lines, returned] = await Promise.all([
    fetchLinesByDocIds(docs.map((d) => d.id)),
    fetchReturnedByLine(saleIds),
  ]);
  const linesByDocId = groupLinesByDocId(lines);
  return docs.map((doc) =>
    toReceiptListItem(
      doc,
      linesByDocId.get(doc.id) ?? [],
      returned.get(doc.id),
    ),
  );
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
): Promise<
  { userId: string; membership: BusinessMembership } | { error: string }
> {
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

  const membership = await checkBusinessMembership(user.id, businessId);
  if ("error" in membership) {
    // Allinea il contratto a tutte le altre server actions: error envelope
    // invece di throw. Evita che la pagina RSC mostri il fallback error.tsx
    // su un IDOR e permette messaggi inline gestiti.
    logger.warn(
      { userId: user.id, businessId },
      `${action}: ownership check failed`,
    );
    return { error: membership.error };
  }

  return { userId: user.id, membership };
}

/**
 * Le condizioni della ricerca più, per il collaboratore, il filtro sui
 * documenti che ha creato (issue #1099). Conteggio ed elenco usano le stesse:
 * un totale calcolato su tutta l'attività tradirebbe quanti documenti ci sono.
 */
function scopedConditions(
  conditions: readonly SQL[],
  membership: BusinessMembership,
): SQL[] {
  const own = ownDocumentsCondition(membership);
  return own ? [...conditions, own] : [...conditions];
}

/**
 * Predicati SQL di una ricerca nello storico, condivisi dalla ricerca locale e
 * da quella che include l'archivio AdE.
 *
 * Ritorna anche gli estremi risolti: la ricerca AdE deve poter filtrare le
 * righe del portale con **gli stessi** confini che il DB applica alle nostre,
 * altrimenti le due sorgenti mostrerebbero due giornate diverse.
 */
const STATUS_FILTERS = ["ACCEPTED", "VOID_ACCEPTED"] as const;

function isStatusFilter(
  value: unknown,
): value is (typeof STATUS_FILTERS)[number] {
  return (STATUS_FILTERS as readonly unknown[]).includes(value);
}

/**
 * Pagina e dimensione pagina di una richiesta, o `{ error }` se non sono interi
 * sicuri. I tipi di TypeScript non esistono a runtime: una server action può
 * ricevere NaN, Infinity, una frazione o una stringa, e `Math.max/min` li
 * lascia passare (NaN) fino a LIMIT/OFFSET. Valori fuori scala ma interi
 * (0, negativi, pageSize enorme) restano un clamp, come prima.
 */
function resolvePaging(
  params: Pick<SearchReceiptsParams, "page" | "pageSize">,
): { page: number; pageSize: number } | { error: string } {
  const rawPage: unknown = params.page ?? 1;
  const rawSize: unknown = params.pageSize ?? STORICO_PAGE_SIZE;
  if (!Number.isSafeInteger(rawPage) || !Number.isSafeInteger(rawSize)) {
    return { error: "Paginazione non valida." };
  }
  return {
    page: Math.max(1, rawPage as number),
    pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize as number)),
  };
}

/**
 * Le condizioni dei filtri «Stato» ed «Emesso da», o l'errore con cui
 * rifiutarli. Fuori da `buildStoricoConditions` per restare sotto la soglia
 * di Cognitive Complexity di SonarCloud.
 */
function resolveFilterConditions(
  params: Pick<SearchReceiptsParams, "status" | "issuer">,
): SQL[] | { error: string } {
  // `|| undefined`: "" (tutti, vedi `StatusFilter`) e null valgono come omesso,
  // come prima. Qualunque altro valore deve essere nell'enum: una server action
  // è raggiungibile con un valore qualsiasi, e una stringa estranea arrivava a
  // Postgres come cast di enum fallito (22P02), un throw al posto di `{ error }`.
  const status: unknown = params.status || undefined;
  if (status !== undefined && !isStatusFilter(status)) {
    return { error: "Filtro stato non valido." };
  }

  // "Emesso da" (issue #1099): un membro o la Developer API. Al collaboratore
  // si aggiunge comunque il filtro sui propri documenti (`scopedConditions`).
  const issuer = issuerCondition(params.issuer);
  if (issuer && "error" in issuer) return issuer;

  // "Tutti" means only successfully processed documents — never show failed attempts
  const statusCondition = status
    ? eq(commercialDocuments.status, status)
    : inArray(commercialDocuments.status, ["ACCEPTED", "VOID_ACCEPTED"]);
  return issuer ? [issuer, statusCondition] : [statusCondition];
}

function buildStoricoConditions(
  businessId: string,
  params: SearchReceiptsParams,
):
  | {
      conditions: SQL[];
      from: Date | null;
      toExclusive: Date | null;
      page: number;
      pageSize: number;
    }
  | { error: string } {
  // Paginazione e filtri si validano insieme, nello stesso punto: i chiamanti
  // hanno un solo ramo `{ error }` da gestire (e restano sotto la soglia di
  // Cognitive Complexity di SonarCloud).
  const paging = resolvePaging(params);
  if ("error" in paging) return paging;

  const conditions: SQL[] = [
    eq(commercialDocuments.businessId, businessId),
    // Vendite e resi: il reso è un documento fiscale con la sua data, e un
    // export di ottobre deve contenere il reso di ottobre di una vendita di
    // settembre. Un reso che conta è sempre ACCEPTED, quindi il filtro di
    // stato qui sotto lo tiene sotto "emessi" e fuori da "annullati". Gli
    // annulli restano uno stato della vendita, non righe.
    inArray(commercialDocuments.kind, ["SALE", "RETURN"]),
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

  const filters = resolveFilterConditions(params);
  if ("error" in filters) return filters;
  conditions.push(...filters);

  return { conditions, from, toExclusive, ...paging };
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

  const built = buildStoricoConditions(businessId, params);
  if ("error" in built) return { error: built.error, items: [], total: 0 };
  const { page, pageSize } = built;
  const offset = (page - 1) * pageSize;
  const conditions = scopedConditions(built.conditions, auth.membership);

  // Total count + page (same conditions, no data-dependency) → in parallelo.
  const [[{ value: total }], docs] = await Promise.all([
    db
      .select({ value: count() })
      .from(commercialDocuments)
      .where(and(...conditions)),
    selectReceipts(db)
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

  // Righe articolo e già-reso solo per i documenti della pagina.
  return { items: await toReceiptListItems(docs), total };
}

// ---------------------------------------------------------------------------
// getReceiptDetail
// ---------------------------------------------------------------------------

/**
 * Rilegge UN documento dello storico (vendita o reso) con le stesse colonne,
 * gli stessi JOIN e lo stesso già-reso di `searchReceipts`.
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
  const [doc] = await selectReceipts(db)
    .where(
      and(
        ...scopedConditions(
          [
            eq(commercialDocuments.id, documentId),
            eq(commercialDocuments.businessId, businessId),
            inArray(commercialDocuments.kind, ["SALE", "RETURN"]),
          ],
          auth.membership,
        ),
      ),
    )
    .limit(1);

  if (!doc) return { item: null };

  const [item] = await toReceiptListItems([doc]);
  return { item };
}

// ---------------------------------------------------------------------------
// findSaleForReturn — la vendita da rendere, dal numero stampato (issue #1099)
// ---------------------------------------------------------------------------

/**
 * 30 ricerche/ora per utente. Ogni reso parte da una ricerca e un numero
 * digitato male costa un tentativo, quindi il tetto sta sopra quello dei resi
 * (20). Basta a rendere inutile provare numeri e date a caso per leggere le
 * vendite degli altri membri.
 */
const saleLookupLimiter = new RateLimiter({
  maxRequests: 30,
  windowMs: RATE_LIMIT_WINDOWS.HOURLY,
});

/**
 * Il numero dopo «DOCUMENTO N.» sullo scontrino, intero (`DCW2026/5111-2188`)
 * o nella sola parte dopo la barra, come lo mostra lo storico. Il primo blocco
 * ammette lettere per i progressivi del mock AdE di dev e sandbox (`MOCK-12`).
 */
const PRINTED_NUMBER = /^(?:DCW\d{4}\/)?([A-Z0-9]+-\d+)$/;

const SALE_NOT_FOUND = "Nessuno scontrino con questo numero in questa data.";

/** La parte dopo la barra, in maiuscolo, o `null` se il numero non lo è. */
function printedNumberSuffix(raw: string): string | null {
  return PRINTED_NUMBER.exec(raw.trim().toUpperCase())?.[1] ?? null;
}

/**
 * Il messaggio di sospensione se il collaboratore non può fare resi, `null`
 * altrimenti. Il titolare non paga la lettura del piano.
 */
async function returnSuspendedError(auth: {
  userId: string;
  membership: BusinessMembership;
}): Promise<string | null> {
  if (auth.membership.role === "owner") return null;
  const planResult = await getPlanSafe(auth.userId, "findSaleForReturn");
  if (!planResult.ok) return planResult.error;
  return collaboratorSuspendedError(auth.membership, planResult.info);
}

/**
 * La vendita da rendere, cercata col numero stampato sullo scontrino e la data
 * (issue #1099, decisione 2). Il collaboratore rende qualunque vendita
 * dell'attività ma nello storico vede solo le proprie: qui trova quella che il
 * cliente ha in mano, e soltanto quella. Il titolare la usa allo stesso modo,
 * senza scorrere l'elenco.
 *
 * Una vendita annullata lo dice; una mai accettata dall'AdE risponde come una
 * che non c'è. Il resto dei controlli (pezzi rendibili, resi fatti dal
 * portale) resta al servizio del reso.
 */
export async function findSaleForReturn(
  businessId: string,
  input: { number: string; date: string },
): Promise<FindSaleForReturnResult> {
  const auth = await authorizeStorico(
    "findSaleForReturn",
    [businessId],
    businessId,
  );
  if ("error" in auth) return { error: auth.error };

  const rate = saleLookupLimiter.check(`saleLookup:${auth.userId}`);
  if (!rate.success) {
    logger.warn(
      { userId: auth.userId },
      "Ricerca della vendita da rendere: rate limit superato",
    );
    return {
      error: "Troppe ricerche ravvicinate. Riprova tra qualche minuto.",
    };
  }

  const suffix = printedNumberSuffix(input.number);
  if (!suffix) {
    return {
      error:
        "Numero non valido: è quello dopo «DOCUMENTO N.», per esempio DCW2026/5111-2188.",
    };
  }
  const from = parseRomeDayStartUtc(input.date);
  const toExclusive = parseRomeDayEndExclusiveUtc(input.date);
  if (!from || !toExclusive) return { error: "Data non valida." };

  const suspended = await returnSuspendedError(auth);
  if (suspended) return { error: suspended };

  const db = getDb();
  const [doc] = await selectReceipts(db)
    .where(
      and(
        eq(commercialDocuments.businessId, businessId),
        eq(commercialDocuments.kind, "SALE"),
        // Il suffisso ha solo lettere, cifre e un trattino: nessun jolly di
        // LIKE può arrivare dall'input.
        like(commercialDocuments.adeProgressive, `%/${suffix}`),
        gte(commercialDocuments.adeRegisteredAt, from),
        lt(commercialDocuments.adeRegisteredAt, toExclusive),
      ),
    )
    .limit(1);

  if (doc?.status === "VOID_ACCEPTED") {
    return {
      error: "Questo scontrino è stato annullato: non si può fare il reso.",
    };
  }
  if (doc?.status !== "ACCEPTED") return { error: SALE_NOT_FOUND };

  const [item] = await toReceiptListItems([doc]);
  return { item };
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
  const docs = await selectReceipts(db).where(
    and(
      eq(commercialDocuments.businessId, businessId),
      inArray(commercialDocuments.id, [...ids]),
    ),
  );

  const items = await toReceiptListItems(docs);
  return new Map(items.map((item) => [item.id, item]));
}

/**
 * Il messaggio d'errore se il chiamante non può cercare su AdE; `null` se può.
 * Tutti i controlli vengono prima di qualunque lavoro.
 */
async function adeSearchAccessError(
  businessId: string,
): Promise<string | null> {
  const auth = await authorizeStorico(
    "searchReceiptsIncludingAde",
    [businessId],
    businessId,
  );
  if ("error" in auth) return auth.error;

  // La ricerca su AdE legge tutta la P.IVA, anche i documenti emessi fuori da
  // ScontrinoZero: è del titolare (issue #1099, decisione 11).
  if (auth.membership.role !== "owner") return OWNER_ONLY_MESSAGE;

  // La ricerca su AdE è Pro. `assertProPlan` porta con sé la classificazione
  // degli errori di lettura del piano (profilo mancante, timeout DB) che qui
  // servirebbe comunque.
  const proCheck = await assertProPlan(auth.userId);
  if (!proCheck.ok) return proCheck.error;

  const rate = adeSearchLimiter.check(`storicoAde:${auth.userId}`);
  if (!rate.success) {
    logger.warn(
      { userId: auth.userId },
      "Ricerca storico AdE: rate limit superato",
    );
    return "Troppe ricerche ravvicinate. Riprova tra qualche minuto.";
  }

  return null;
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
  const denied = await adeSearchAccessError(businessId);
  if (denied !== null) return { error: denied, items: [], total: 0 };

  const built = buildStoricoConditions(businessId, params);
  if ("error" in built) return { error: built.error, items: [], total: 0 };

  // Periodo assente o troppo largo → rifiuto, non degrado silenzioso: un
  // elenco locale presentato come se includesse l'AdE mentirebbe. Un periodo
  // lungo ma ammesso diventa qui una query per mese solare.
  const ranges = buildAdeSearchRanges(params.dateFrom, params.dateTo);
  if ("error" in ranges) return { error: ranges.error, items: [], total: 0 };

  const { page, pageSize } = built;

  const db = getDb();

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
    // Un documento che vive solo sull'AdE non ha un membro che l'abbia
    // emesso: con il filtro "Emesso da" non può comparire, e non serve
    // chiederlo al portale (un login in meno).
    params.issuer
      ? Promise.resolve({ rows: [], truncated: false })
      : fetchForeignAdeRows({
          businessId,
          ranges: ranges.ranges,
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
