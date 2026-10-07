/**
 * Logica di business per il reso merce (documento commerciale di reso,
 * HAR.md voce #19).
 *
 * Come `void-service.ts`, NON gestisce autenticazione né autorizzazione: il
 * chiamante (server action o API route) ha già verificato identità e
 * ownership del business.
 *
 * Il reso ricalca l'annullo — riga PENDING, sessione AdE, POST, finalizzazione
 * — con tre differenze che reggono tutto il resto:
 *
 * 1. **La vendita resta ACCEPTED.** Una vendita può avere più resi parziali;
 *    quanto è stato reso si legge dall'AdE (cumulativo `reso` del dettaglio
 *    GET), che conosce anche i resi fatti dal portale.
 * 2. **Le guardie le mettiamo noi.** L'AdE accetta l'annullo di una vendita già
 *    resa (voce #19f); qui il reso si rifiuta su una vendita annullata (anche
 *    dal portale, flag `annulli` della riga V) e l'indice "una correzione in
 *    volo per vendita" (migrazione 0042) impedisce un reso concorrente a un
 *    altro reso o a un annullo.
 * 3. **Un reso rimasto in sospeso non blocca per sempre.** Se la riga PENDING
 *    di un'altra richiesta è stale, la si riconcilia con l'AdE prima di
 *    procedere, invece di rispondere "in corso" all'infinito: registrata →
 *    finalizzata e la nuova richiesta va rifatta sul residuo aggiornato;
 *    assente → marcata ERROR e la nuova richiesta procede.
 *
 * Tutto ciò che precede la POST non ha effetti fiscali: una riga nata in
 * questa richiesta e fallita prima della POST si **rilascia** (DELETE), così
 * un retry con la stessa chiave riparte pulito invece di aspettare la soglia
 * stale.
 */
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocumentLines, commercialDocuments } from "@/db/schema";
import { withAdeSession, isInteractiveSessionMissing } from "@/lib/ade";
import type { AdeClient } from "@/lib/ade/client";
import { AdeReauthRequiredError } from "@/lib/ade/errors";
import {
  getUserFacingAdeErrorMessage,
  isTransientAdeError,
} from "@/lib/ade/error-messages";
import { logAdeFailure } from "@/lib/ade/log-failure";
import { toAdeAmount } from "@/lib/ade/mapper";
import {
  getReturnedQuantities,
  isReturnComputable,
  mapReturnToAdePayload,
  validateReturnQuantities,
  type ReturnQuantitiesError,
} from "@/lib/ade/return-mapper";
import type { AdeDocumentDetail, AdeResponse } from "@/lib/ade/types";
import { isStatementTimeoutError } from "@/lib/api-errors";
import { isUniqueConstraintViolation } from "@/lib/db-errors";
import {
  retryOnStatementTimeout,
  withStatementTimeout,
} from "@/lib/db-timeout";
import { logger } from "@/lib/logger";
import {
  buildReturnLines,
  type ReturnLineRow,
  type SaleLineRow,
} from "@/lib/receipts/return-lines";
import {
  fetchAdePrerequisites,
  toAdeSessionParams,
  type AdePrerequisites,
} from "@/lib/server-auth";
import type { ReturnReceiptInput, ReturnReceiptResult } from "@/types/storico";
import {
  adeRegisteredAtPatch,
  adeRegisteredAtPatchFromDate,
} from "./ade-registered-at";
import {
  buildAdeSearchWindow,
  claimStaleDocument,
  findClaimedTransactionIds,
  isStaleUpdatedAt,
  markDocumentErrorBestEffort,
  reconcileReturnDocument,
} from "./ade-recovery";
import { hashReturnRequest } from "./request-hash";

const FLOW = "return-receipt";

/**
 * Cosa resta su `public_request` di un reso. `adeAmount` è
 * l'`ammontareComplessivo` trasmesso, scritto **prima** della POST: è la
 * chiave con cui la riconciliazione distingue il nostro reso dagli altri resi
 * della stessa vendita (voce #19e). Assente = la POST non è mai partita.
 *
 * `submittedAt` è l'istante dell'ultima POST, scritto con l'importo: la
 * ricerca di riconciliazione copre ±1 giorno, e una riga può ritrasmettere
 * giorni dopo la sua nascita. Cercare intorno a `createdAt` perderebbe la
 * POST da riconciliare e ne aprirebbe una seconda.
 */
type ReturnPublicRequest = {
  documentId: string;
  quantities: number[];
  adeAmount?: string;
  submittedAt?: string;
};

type SaleRef = {
  id: string;
  adeTransactionId: string;
  adeProgressive: string;
};

type ReturnContext = {
  input: ReturnReceiptInput;
  apiKeyId: string | null;
  requestHash: string;
  sale: SaleRef;
  saleLines: SaleLineRow[];
  prerequisites: AdePrerequisites;
};

/** Una riga RETURN esistente, presa in carico per riconciliarla. */
type ClaimedRow = {
  rowId: string;
  /** Centro della finestra di ricerca: l'ultima POST, o la nascita della riga. */
  searchAround: Date;
  expectedAmount: string | null;
};

type Claim =
  | { kind: "done"; result: ReturnReceiptResult }
  | { kind: "fresh"; rowId: string }
  /** Riga di questa stessa richiesta (stessa key), stale: da riconciliare. */
  | ({ kind: "recover" } & ClaimedRow)
  /** Riga di un'altra richiesta sulla stessa vendita, stale: da riconciliare. */
  | ({ kind: "supersede" } & ClaimedRow);

/** Stato mutabile del tentativo, letto dal gestore degli errori. */
type Attempt = {
  rowId: string;
  /** La riga è nata in questa richiesta: prima della POST si può cancellare. */
  fresh: boolean;
  /** Sappiamo che l'AdE non ha questo reso (riga nuova o riconciliata a vuoto). */
  knownAbsent: boolean;
  /** La POST è partita: da qui l'esito può essere ignoto. */
  submitted: boolean;
};

const dbTimeoutResult: ReturnReceiptResult = {
  error: "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
  code: "DB_TIMEOUT",
};

function pendingInProgress(returnDocumentId?: string): ReturnReceiptResult {
  return {
    error:
      "Un reso su questo scontrino è ancora in elaborazione. Riprova tra qualche secondo.",
    code: "RETURN_PENDING_IN_PROGRESS",
    ...(returnDocumentId ? { returnDocumentId } : {}),
  };
}

function notAllowed(error: string): ReturnReceiptResult {
  return { error, code: "RETURN_NOT_ALLOWED" };
}

const QUANTITY_MESSAGES: Record<ReturnQuantitiesError, string> = {
  LINE_COUNT_MISMATCH:
    "Le righe del reso non corrispondono a quelle dello scontrino.",
  INVALID_QUANTITY:
    "Quantità di reso non valida: usa numeri positivi con al massimo due decimali.",
  NOTHING_TO_RETURN: "Indica almeno un prodotto da rendere.",
  EXCEEDS_RETURNABLE:
    "Una quantità supera quella ancora rendibile. Riapri il reso per vedere le quantità aggiornate.",
};

function invalidQuantities(reason: ReturnQuantitiesError): ReturnReceiptResult {
  return {
    error: QUANTITY_MESSAGES[reason],
    code: "RETURN_INVALID_QUANTITIES",
  };
}

function readExpectedAmount(publicRequest: unknown): string | null {
  const amount = (publicRequest as Partial<ReturnPublicRequest> | null)
    ?.adeAmount;
  return typeof amount === "string" ? amount : null;
}

/**
 * L'istante dell'ultima POST, o `null` se manca o non si legge. In quel caso
 * si cerca intorno alla nascita della riga: una ricerca in più, mai una POST
 * alla cieca.
 */
function readSubmittedAt(publicRequest: unknown): Date | null {
  const at = (publicRequest as Partial<ReturnPublicRequest> | null)
    ?.submittedAt;
  if (typeof at !== "string") return null;
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ---------------------------------------------------------------------------
// Fase DB prima della sessione AdE
// ---------------------------------------------------------------------------

type PrepareOutcome =
  | { kind: "done"; result: ReturnReceiptResult }
  | {
      kind: "ready";
      ctx: ReturnContext;
      claim: Exclude<Claim, { kind: "done" }>;
    };

async function loadSale(
  input: ReturnReceiptInput,
  apiKeyId: string | null,
): Promise<{ result: ReturnReceiptResult } | { sale: SaleRef }> {
  const db = getDb();
  const [doc] = await db
    .select()
    .from(commercialDocuments)
    .where(
      and(
        eq(commercialDocuments.id, input.documentId),
        eq(commercialDocuments.businessId, input.businessId),
      ),
    )
    .limit(1);

  if (!doc) {
    // Stesso segnale anti-enumerazione dell'annullo, solo sul canale API.
    if (apiKeyId) {
      logger.warn(
        {
          documentId: input.documentId,
          businessId: input.businessId,
          apiKeyId,
          errorClass: "v1_document_not_found",
        },
        "v1 document not found",
      );
    }
    return { result: { error: "Scontrino non trovato.", code: "NOT_FOUND" } };
  }
  if (doc.kind !== "SALE") {
    return {
      result: notAllowed("Solo i documenti di vendita si possono rendere."),
    };
  }
  if (doc.status !== "ACCEPTED") {
    return {
      result: notAllowed(
        "Lo scontrino non si può rendere: è annullato o non è stato accettato dall'AdE.",
      ),
    };
  }
  if (!doc.adeTransactionId || !doc.adeProgressive) {
    return { result: { error: "Dati AdE mancanti per il reso." } };
  }
  return {
    sale: {
      id: doc.id,
      adeTransactionId: doc.adeTransactionId,
      adeProgressive: doc.adeProgressive,
    },
  };
}

async function loadSaleLines(saleId: string): Promise<SaleLineRow[]> {
  return getDb()
    .select({
      lineIndex: commercialDocumentLines.lineIndex,
      description: commercialDocumentLines.description,
      quantity: commercialDocumentLines.quantity,
      grossUnitPrice: commercialDocumentLines.grossUnitPrice,
      lineDiscount: commercialDocumentLines.lineDiscount,
      vatCode: commercialDocumentLines.vatCode,
    })
    .from(commercialDocumentLines)
    .where(eq(commercialDocumentLines.documentId, saleId))
    .orderBy(asc(commercialDocumentLines.lineIndex));
}

async function prepareReturn(
  input: ReturnReceiptInput,
  apiKeyId: string | null,
): Promise<PrepareOutcome> {
  let sale: SaleRef;
  let saleLines: SaleLineRow[];
  try {
    const loaded = await loadSale(input, apiKeyId);
    if ("result" in loaded) return { kind: "done", result: loaded.result };
    sale = loaded.sale;
    saleLines = await loadSaleLines(sale.id);
  } catch (err) {
    if (isStatementTimeoutError(err)) {
      logger.warn(
        { businessId: input.businessId, saleDocumentId: input.documentId },
        "returnReceipt SELECT SALE timed out",
      );
      return { kind: "done", result: dbTimeoutResult };
    }
    throw err;
  }

  if (input.quantities.length !== saleLines.length) {
    return { kind: "done", result: invalidQuantities("LINE_COUNT_MISMATCH") };
  }

  const prerequisites = await fetchAdePrerequisites(input.businessId);
  if ("error" in prerequisites) {
    return { kind: "done", result: { error: prerequisites.error } };
  }
  // CIE: sessione interattiva assente/scaduta → rinnovo PRIMA della riga
  // PENDING (stessa regola di emissione e annullo, skill ade-integration).
  if (
    (prerequisites.method === "cie" || prerequisites.method === "spid") &&
    isInteractiveSessionMissing(input.businessId, prerequisites.method)
  ) {
    return { kind: "done", result: { reauthRequired: true } };
  }

  const ctx: ReturnContext = {
    input,
    apiKeyId,
    requestHash: hashReturnRequest({
      documentId: input.documentId,
      quantities: input.quantities,
    }),
    sale,
    saleLines,
    prerequisites,
  };

  try {
    // Un annullo già riuscito l'ha escluso `loadSale` (la vendita passa a
    // VOID_ACCEPTED nella stessa transazione); uno in volo lo esclude l'indice
    // di correzione, e quello fatto dal portale il flag `annulli` in sessione.
    const claim = await insertReturnRow(ctx);
    if (claim.kind === "done") return { kind: "done", result: claim.result };
    return { kind: "ready", ctx, claim };
  } catch (err) {
    if (isStatementTimeoutError(err)) {
      logger.warn(
        { businessId: input.businessId, saleDocumentId: input.documentId },
        "returnReceipt INSERT RETURN timed out",
      );
      return { kind: "done", result: dbTimeoutResult };
    }
    throw err;
  }
}

type ExistingRow = {
  id: string;
  kind: string;
  status: string;
  returnedDocumentId: string | null;
  requestHash: string | null;
  publicRequest: unknown;
  adeTransactionId: string | null;
  adeProgressive: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const existingRowColumns = {
  id: commercialDocuments.id,
  kind: commercialDocuments.kind,
  status: commercialDocuments.status,
  returnedDocumentId: commercialDocuments.returnedDocumentId,
  requestHash: commercialDocuments.requestHash,
  publicRequest: commercialDocuments.publicRequest,
  adeTransactionId: commercialDocuments.adeTransactionId,
  adeProgressive: commercialDocuments.adeProgressive,
  createdAt: commercialDocuments.createdAt,
  updatedAt: commercialDocuments.updatedAt,
};

/**
 * Prende in carico una riga stale con il CAS su `updated_at`: il primo
 * tentativo vince, ogni tentativo concorrente riceve "in corso" e NON
 * ritrasmette (doppio reso irreversibile).
 *
 * Il claim riporta la riga a `PENDING` (`reopen`): da qui può partire una
 * POST, e deve partire dentro l'indice "una correzione in volo per vendita".
 * Se un'altra correzione è già in volo sulla stessa vendita l'indice rifiuta
 * la riapertura: "in corso", senza toccare l'AdE.
 */
async function claimStale(
  row: ExistingRow,
  kind: "recover" | "supersede",
): Promise<Claim> {
  if (!isStaleUpdatedAt(row.updatedAt)) {
    return { kind: "done", result: pendingInProgress(row.id) };
  }
  let claimed: boolean;
  try {
    claimed = await claimStaleDocument(getDb(), row.id, row.updatedAt, {
      reopen: true,
    });
  } catch (err) {
    if (!isUniqueConstraintViolation(err)) throw err;
    return { kind: "done", result: pendingInProgress() };
  }
  if (!claimed) return { kind: "done", result: pendingInProgress(row.id) };
  logger.warn(
    { returnDocumentId: row.id, status: row.status, mode: kind },
    "Recovering stale PENDING/ERROR return",
  );
  return {
    kind,
    rowId: row.id,
    searchAround: readSubmittedAt(row.publicRequest) ?? row.createdAt,
    expectedAmount: readExpectedAmount(row.publicRequest),
  };
}

/** Stessa idempotencyKey: replay, recovery o riuso improprio. */
function resolveExistingByKey(
  row: ExistingRow,
  ctx: ReturnContext,
): Claim | Promise<Claim> {
  const reused =
    row.kind !== "RETURN" ||
    row.returnedDocumentId !== ctx.sale.id ||
    (row.requestHash != null && row.requestHash !== ctx.requestHash);
  if (reused) {
    logger.warn(
      { businessId: ctx.input.businessId, documentId: row.id, kind: row.kind },
      "Return idempotency key reused for a different request",
    );
    return {
      kind: "done",
      result: {
        error:
          "La chiave di idempotenza è già stata usata per un'altra operazione. Usa una nuova chiave.",
        code: "IDEMPOTENCY_PAYLOAD_MISMATCH",
      },
    };
  }
  if (row.status === "ACCEPTED") {
    return {
      kind: "done",
      result: {
        returnDocumentId: row.id,
        adeTransactionId: row.adeTransactionId ?? undefined,
        adeProgressive: row.adeProgressive ?? undefined,
      },
    };
  }
  if (row.status === "REJECTED") {
    return {
      kind: "done",
      result: {
        error:
          "Reso precedente rifiutato dall'AdE. Riapri il reso con una nuova chiave.",
      },
    };
  }
  return claimStale(row, "recover");
}

/**
 * Perché l'INSERT è saltato? O la stessa key (gestita prima), o l'indice "una
 * correzione in volo per vendita": un annullo o un altro reso PENDING.
 */
async function resolveInFlightConflict(ctx: ReturnContext): Promise<Claim> {
  const [inFlight] = await getDb()
    .select(existingRowColumns)
    .from(commercialDocuments)
    .where(
      and(
        eq(commercialDocuments.returnedDocumentId, ctx.sale.id),
        eq(commercialDocuments.status, "PENDING"),
      ),
    )
    .limit(1);
  if (inFlight) return claimStale(inFlight, "supersede");

  const [voidInFlight] = await getDb()
    .select({ id: commercialDocuments.id })
    .from(commercialDocuments)
    .where(
      and(
        eq(commercialDocuments.voidedDocumentId, ctx.sale.id),
        eq(commercialDocuments.status, "PENDING"),
      ),
    )
    .limit(1);
  if (voidInFlight) {
    return {
      kind: "done",
      result: notAllowed(
        "Lo scontrino ha un annullo in corso: non si può rendere.",
      ),
    };
  }
  // Conflitto sparito fra INSERT e SELECT (la riga si è conclusa nel mezzo):
  // il chiamante ritenta e rilegge lo stato aggiornato.
  return { kind: "done", result: pendingInProgress() };
}

/** INSERT della riga PENDING; su conflitto delega alla risoluzione. */
async function insertReturnRow(ctx: ReturnContext): Promise<Claim> {
  const publicRequest: ReturnPublicRequest = {
    documentId: ctx.sale.id,
    quantities: ctx.input.quantities,
  };
  const [row] = await getDb()
    .insert(commercialDocuments)
    .values({
      businessId: ctx.input.businessId,
      kind: "RETURN",
      idempotencyKey: ctx.input.idempotencyKey,
      returnedDocumentId: ctx.sale.id,
      publicRequest,
      requestHash: ctx.requestHash,
      apiKeyId: ctx.apiKeyId,
      status: "PENDING",
    })
    .onConflictDoNothing()
    .returning({ id: commercialDocuments.id });

  if (row) return { kind: "fresh", rowId: row.id };

  const [sameKey] = await getDb()
    .select(existingRowColumns)
    .from(commercialDocuments)
    .where(
      and(
        eq(commercialDocuments.businessId, ctx.input.businessId),
        eq(commercialDocuments.idempotencyKey, ctx.input.idempotencyKey),
      ),
    )
    .limit(1);
  if (sameKey) return resolveExistingByKey(sameKey, ctx);
  return resolveInFlightConflict(ctx);
}

// ---------------------------------------------------------------------------
// Fase in sessione AdE
// ---------------------------------------------------------------------------

/**
 * Chiude una riga RETURN come ACCEPTED. `kind` nel WHERE come difesa in
 * profondità (stesso guard dell'annullo, PR #704): un id sbagliato non può
 * flippare una vendita.
 */
async function finalizeReturnRow(params: {
  rowId: string;
  adeTransactionId: string | null;
  adeProgressive: string | null;
  adeResponse?: AdeResponse;
  registeredAt?: Date | null;
}): Promise<void> {
  const { rowId, adeTransactionId, adeProgressive, adeResponse } = params;
  await retryOnStatementTimeout("return-finalize", () =>
    withStatementTimeout(3000, (tx) =>
      tx
        .update(commercialDocuments)
        .set({
          status: "ACCEPTED",
          adeTransactionId,
          adeProgressive,
          ...(adeResponse
            ? { adeResponse, ...adeRegisteredAtPatch(adeResponse) }
            : adeRegisteredAtPatchFromDate(params.registeredAt)),
        })
        .where(
          and(
            eq(commercialDocuments.id, rowId),
            eq(commercialDocuments.kind, "RETURN"),
          ),
        ),
    ),
  );
}

function syncFailed(
  rowId: string,
  adeTransactionId: string | null,
  err: unknown,
) {
  // Il reso è sull'AdE: la riga resta PENDING (mai ERROR) così l'indice di
  // correzione in volo blocca un secondo reso finché qualcuno non la chiude.
  logger.error(
    { err, critical: true, returnDocumentId: rowId, adeTransactionId },
    "Return finalization failed after submitReturn succeeded — MANUAL CLEANUP NEEDED",
  );
  return {
    error:
      "Reso registrato su AdE ma sincronizzazione DB in errore. Contatta il supporto.",
    code: "RETURN_SYNC_FAILED" as const,
    returnDocumentId: rowId,
  };
}

type ReconcileOutcome =
  { kind: "absent" } | { kind: "result"; result: ReturnReceiptResult };

/**
 * Riconcilia con l'AdE una riga RETURN stale prima di qualunque nuova POST.
 * Senza `adeAmount` la POST non è mai partita: niente da cercare.
 */
async function reconcilePendingReturn(
  client: AdeClient,
  ctx: ReturnContext,
  claim: Extract<Claim, { kind: "recover" | "supersede" }>,
): Promise<ReconcileOutcome> {
  if (!claim.expectedAmount) return { kind: "absent" };

  let result;
  try {
    const list = await client.searchDocuments({
      ...buildAdeSearchWindow(claim.searchAround),
      tipoOperazione: "R",
    });
    const claimedIdtrx = await findClaimedTransactionIds(getDb(), {
      businessId: ctx.input.businessId,
      excludeDocumentId: claim.rowId,
      idtrxs: list.elencoRisultati.map((doc) => doc.idtrx),
    });
    result = reconcileReturnDocument({
      documents: list.elencoRisultati,
      saleProgressivo: ctx.sale.adeProgressive,
      expectedAmount: claim.expectedAmount,
      claimedIdtrx,
    });
  } catch (err) {
    // Fail-safe: non sappiamo se il reso c'è → nessuna nuova POST.
    logAdeFailure(
      err,
      {
        returnDocumentId: claim.rowId,
        saleDocumentId: ctx.sale.id,
        flow: FLOW,
      },
      {
        transient: "Return recovery: searchDocuments lookup failed (transient)",
        failure: "Return recovery: searchDocuments lookup failed",
      },
    );
    return { kind: "result", result: pendingInProgress(claim.rowId) };
  }

  if (result.kind === "none") return { kind: "absent" };
  if (result.kind === "ambiguous") {
    logger.warn(
      { returnDocumentId: claim.rowId, saleDocumentId: ctx.sale.id },
      "Return recovery: match AdE ambiguo → resta PENDING (conservativo)",
    );
    return { kind: "result", result: pendingInProgress(claim.rowId) };
  }

  try {
    await finalizeReturnRow({
      rowId: claim.rowId,
      adeTransactionId: result.idtrx,
      adeProgressive: result.numeroProgressivo,
      registeredAt: result.registeredAt,
    });
  } catch (err) {
    return {
      kind: "result",
      result: syncFailed(claim.rowId, result.idtrx, err),
    };
  }
  logger.warn(
    { returnDocumentId: claim.rowId, idtrx: result.idtrx, mode: claim.kind },
    "Return recovery: AdE già registrato (match) → finalize-only",
  );
  if (claim.kind === "recover") {
    return {
      kind: "result",
      result: {
        returnDocumentId: claim.rowId,
        adeTransactionId: result.idtrx,
        adeProgressive: result.numeroProgressivo,
      },
    };
  }
  return {
    kind: "result",
    result: {
      error:
        "Un reso precedente su questo scontrino risulta registrato. Riapri il reso per vedere le quantità aggiornate.",
      code: "RETURN_STATE_CHANGED",
    },
  };
}

/**
 * Prima della POST: la riga si ritira se è nata in questa richiesta (nessun
 * effetto fiscale, la stessa key riparte pulita), altrimenti si marca ERROR —
 * è già stata riconciliata a vuoto, quindi sull'AdE non c'è.
 */
async function releaseBeforeSubmit(attempt: Attempt): Promise<void> {
  if (!attempt.knownAbsent) return;
  if (!attempt.fresh) {
    await markDocumentErrorBestEffort(
      attempt.rowId,
      { returnDocumentId: attempt.rowId },
      "Failed to mark RETURN as ERROR before submit",
    );
    return;
  }
  try {
    await getDb()
      .delete(commercialDocuments)
      .where(
        and(
          eq(commercialDocuments.id, attempt.rowId),
          eq(commercialDocuments.kind, "RETURN"),
          eq(commercialDocuments.status, "PENDING"),
        ),
      );
  } catch (err) {
    // Resta PENDING: la soglia stale la renderà riconciliabile (senza
    // `adeAmount` la riconciliazione la dà assente subito).
    logger.warn(
      { err, returnDocumentId: attempt.rowId },
      "Failed to release RETURN row before submit",
    );
  }
}

/** Scrive importo atteso e righe del reso, poi la POST può partire. */
async function persistBeforeSubmit(
  ctx: ReturnContext,
  rowId: string,
  adeAmount: string,
  lines: ReturnLineRow[],
): Promise<void> {
  const publicRequest: ReturnPublicRequest = {
    documentId: ctx.sale.id,
    quantities: ctx.input.quantities,
    adeAmount,
    submittedAt: new Date().toISOString(),
  };
  await withStatementTimeout(3000, async (tx) => {
    await tx
      .update(commercialDocuments)
      .set({ publicRequest })
      .where(eq(commercialDocuments.id, rowId));
    // Un recovery che ritrasmette ricalcola le righe sul residuo di adesso.
    await tx
      .delete(commercialDocumentLines)
      .where(eq(commercialDocumentLines.documentId, rowId));
    await tx
      .insert(commercialDocumentLines)
      .values(lines.map((line) => ({ ...line, documentId: rowId })));
  });
}

async function processReturnResponse(
  response: AdeResponse,
  ctx: ReturnContext,
  rowId: string,
): Promise<ReturnReceiptResult> {
  if (!response.esito) {
    // Rifiuto di merito dell'AdE: warn, non Sentry (regola 20).
    logger.warn(
      {
        returnDocumentId: rowId,
        saleDocumentId: ctx.sale.id,
        adeErrorCodes: response.errori?.map((e) => e.codice) ?? [],
        adeErrorDescriptions: response.errori?.map((e) => e.descrizione) ?? [],
      },
      "AdE rejected return",
    );
    await retryOnStatementTimeout("return-update-rejected", () =>
      getDb()
        .update(commercialDocuments)
        .set({ status: "REJECTED", adeResponse: response })
        .where(eq(commercialDocuments.id, rowId)),
    );
    return {
      error:
        "Il portale Agenzia delle Entrate Fatture e Corrispettivi ha rifiutato il reso. Non dipende da te né da ScontrinoZero. Riprova tra qualche minuto.",
    };
  }

  try {
    await finalizeReturnRow({
      rowId,
      adeTransactionId: response.idtrx,
      adeProgressive: response.progressivo,
      adeResponse: response,
    });
  } catch (err) {
    return syncFailed(rowId, response.idtrx, err);
  }

  logger.info(
    {
      returnDocumentId: rowId,
      saleDocumentId: ctx.sale.id,
      businessId: ctx.input.businessId,
      adeTransactionId: response.idtrx,
      apiKeyId: ctx.apiKeyId ?? undefined,
    },
    "Receipt returned successfully",
  );
  return {
    returnDocumentId: rowId,
    adeTransactionId: response.idtrx ?? undefined,
    adeProgressive: response.progressivo ?? undefined,
  };
}

/** Aliquote uguali: le nature per codice, le percentuali per valore. */
function sameVatCode(ade: string, ours: string): boolean {
  if (ade === ours) return true;
  const a = Number(ade);
  return Number.isFinite(a) && ade.trim() !== "" && a === Number(ours);
}

/**
 * Le righe del dettaglio AdE sono quelle della vendita salvata, nello stesso
 * ordine? Le quantità del reso arrivano allineate per indice alle NOSTRE righe
 * (dialog e Developer API leggono il DB), mentre mapper e residuo le applicano
 * per indice alle righe dell'AdE: con un ordine diverso il reso stornerebbe un
 * prodotto diverso da quello scelto.
 *
 * Si confrontano quantità e aliquota, che il mapper di vendita trasmette da
 * sempre così come stanno in DB. Non la descrizione, che l'AdE potrebbe
 * normalizzare, né il prezzo, che fino alla v1.7.0 viaggiava moltiplicato per
 * la quantità (HAR.md #11).
 */
function adeLinesMatchSale(
  doc: AdeDocumentDetail,
  saleLines: readonly SaleLineRow[],
): boolean {
  const adeLines = doc.documentoCommerciale.elementiContabili;
  return (
    adeLines.length === saleLines.length &&
    adeLines.every((el, i) => {
      const line = saleLines[i]!;
      return (
        toAdeAmount(Number(el.quantita)) ===
          toAdeAmount(Number(line.quantity)) &&
        sameVatCode(el.aliquotaIVA, line.vatCode)
      );
    })
  );
}

/** La vendita risulta annullata sull'AdE (anche dal portale, voce #19f)? */
async function isVoidedOnAde(
  client: AdeClient,
  sale: SaleRef,
): Promise<boolean> {
  const list = await client.searchDocuments({
    numeroProgressivo: sale.adeProgressive,
    tipoOperazione: "V",
  });
  return list.elencoRisultati.some(
    (doc) =>
      doc.numeroProgressivo === sale.adeProgressive && doc.annulli === "A",
  );
}

async function submitReturnFlow(
  client: AdeClient,
  ctx: ReturnContext,
  attempt: Attempt,
): Promise<ReturnReceiptResult> {
  if (await isVoidedOnAde(client, ctx.sale)) {
    await releaseBeforeSubmit(attempt);
    return notAllowed(
      "Lo scontrino risulta annullato sul portale AdE: non si può rendere.",
    );
  }

  const originalDoc = await client.getDocument(ctx.sale.adeTransactionId);
  if (!adeLinesMatchSale(originalDoc, ctx.saleLines)) {
    logger.warn(
      {
        saleDocumentId: ctx.sale.id,
        adeLines: originalDoc.documentoCommerciale.elementiContabili.length,
        ourLines: ctx.saleLines.length,
      },
      "Return: AdE document lines do not match the stored sale",
    );
    await releaseBeforeSubmit(attempt);
    return notAllowed(
      "Il documento sull'AdE non corrisponde allo scontrino salvato: non si può rendere da qui.",
    );
  }

  const invalid = validateReturnQuantities(originalDoc, ctx.input.quantities);
  if (invalid) {
    await releaseBeforeSubmit(attempt);
    return invalidQuantities(invalid);
  }

  if (!isReturnComputable(originalDoc, ctx.input.quantities)) {
    // Vendita emessa fino alla v1.7.0, o via API con quantità a tre decimali:
    // le formule del portale stornerebbero un altro importo. Non è un errore
    // dell'utente né un guasto: warn, senza Sentry (regola 20).
    logger.warn(
      { saleDocumentId: ctx.sale.id, businessId: ctx.input.businessId },
      "Return: sale lines not computable with the portal formulas",
    );
    await releaseBeforeSubmit(attempt);
    return notAllowed(
      "Questo scontrino è stato emesso con un formato degli importi da cui il reso non si calcola con esattezza: per non trasmettere un importo sbagliato all'AdE il reso è bloccato. Scrivi all'assistenza.",
    );
  }

  const payload = mapReturnToAdePayload({
    cedentePrestatore: ctx.prerequisites.cedentePrestatore,
    originalDoc,
    originalProgressive: ctx.sale.adeProgressive,
    quantities: ctx.input.quantities,
  });
  const lines = buildReturnLines(
    ctx.saleLines,
    getReturnedQuantities(originalDoc),
    ctx.input.quantities,
  );
  await persistBeforeSubmit(
    ctx,
    attempt.rowId,
    payload.documentoCommerciale.ammontareComplessivo,
    lines,
  );

  attempt.submitted = true;
  const response = await client.submitReturn(payload);
  return processReturnResponse(response, ctx, attempt.rowId);
}

async function runReturn(
  client: AdeClient,
  ctx: ReturnContext,
  claim: Exclude<Claim, { kind: "done" }>,
  attempt: Attempt,
): Promise<ReturnReceiptResult> {
  if (claim.kind === "recover" || claim.kind === "supersede") {
    const reconciled = await reconcilePendingReturn(client, ctx, claim);
    if (reconciled.kind === "result") return reconciled.result;
    attempt.knownAbsent = true;

    if (claim.kind === "supersede") {
      // La riga dell'altra richiesta non ha prodotto nulla sull'AdE: si chiude
      // e questa richiesta prende il suo posto.
      await markDocumentErrorBestEffort(
        claim.rowId,
        { returnDocumentId: claim.rowId },
        "Failed to mark superseded RETURN as ERROR",
      );
      const next = await insertReturnRow(ctx);
      if (next.kind === "done") return next.result;
      if (next.kind !== "fresh") return pendingInProgress(next.rowId);
      attempt.rowId = next.rowId;
      attempt.fresh = true;
    }
  }
  return submitReturnFlow(client, ctx, attempt);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Emette un documento commerciale di reso per la vendita indicata.
 *
 * @param input    vendita, idempotencyKey, business e quantità per riga
 * @param apiKeyId UUID della API key usata, o null/undefined per UI session
 */
export async function returnReceiptForBusiness(
  input: ReturnReceiptInput,
  apiKeyId?: string | null,
): Promise<ReturnReceiptResult> {
  const prep = await prepareReturn(input, apiKeyId ?? null);
  if (prep.kind === "done") return prep.result;
  const { ctx, claim } = prep;

  const attempt: Attempt = {
    rowId: claim.rowId,
    fresh: claim.kind === "fresh",
    knownAbsent: claim.kind === "fresh",
    submitted: false,
  };

  try {
    return await withAdeSession(
      toAdeSessionParams(input.businessId, ctx.prerequisites),
      (client) => runReturn(client, ctx, claim, attempt),
    );
  } catch (err) {
    return handleReturnFailure(err, ctx, attempt);
  }
}

async function handleReturnFailure(
  err: unknown,
  ctx: ReturnContext,
  attempt: Attempt,
): Promise<ReturnReceiptResult> {
  const { rowId } = attempt;

  if (!attempt.submitted) {
    // Nessuna POST: nessun effetto fiscale possibile da questo tentativo.
    await releaseBeforeSubmit(attempt);
    if (err instanceof AdeReauthRequiredError) return { reauthRequired: true };
  } else if (err instanceof AdeReauthRequiredError) {
    // 401 sulla POST = reso NON registrato (stesso ragionamento dell'annullo,
    // PR #707): ERROR, e il retry riparte da zero. Niente Sentry (regola 20).
    await markDocumentErrorBestEffort(
      rowId,
      { returnDocumentId: rowId },
      "Failed to mark RETURN as ERROR after CIE reauth-required",
    );
    return { reauthRequired: true };
  } else if (!isStatementTimeoutError(err) && !isTransientAdeError(err)) {
    // Fallimento non transitorio: l'AdE ha risposto e non ha registrato.
    // Sui transitori l'esito è ignoto e la riga resta PENDING per la
    // riconciliazione: marcarla ERROR la toglierebbe dall'indice di correzione
    // in volo e aprirebbe la strada a un secondo reso.
    await markDocumentErrorBestEffort(
      rowId,
      { returnDocumentId: rowId },
      "Failed to mark RETURN as ERROR after return failure",
    );
  }

  logAdeFailure(
    err,
    { returnDocumentId: rowId, saleDocumentId: ctx.sale.id, flow: FLOW },
    {
      transient: "returnReceiptForBusiness AdE transient failure",
      failure: "returnReceiptForBusiness failed",
    },
  );
  return formatReturnError(err, rowId);
}

/** Speculare a `formatVoidError`: solo il transitorio è ritentabile così com'è. */
function formatReturnError(err: unknown, rowId: string): ReturnReceiptResult {
  if (isStatementTimeoutError(err)) {
    return { ...dbTimeoutResult, returnDocumentId: rowId };
  }
  if (isTransientAdeError(err)) {
    return {
      error: getUserFacingAdeErrorMessage(
        err,
        "Agenzia delle Entrate non raggiungibile. Riprova tra qualche istante.",
      ).message,
      code: "ADE_UNAVAILABLE",
      returnDocumentId: rowId,
    };
  }
  const userFacing = getUserFacingAdeErrorMessage(
    err,
    "Errore durante il reso dello scontrino. Riprova più tardi.",
  );
  return {
    error: userFacing.message,
    ...(userFacing.passwordExpired
      ? { code: "ADE_PASSWORD_EXPIRED" as const }
      : {}),
  };
}
