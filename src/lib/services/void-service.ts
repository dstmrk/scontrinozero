/**
 * Logica di business per l'annullamento di scontrini elettronici.
 *
 * Questo modulo NON gestisce autenticazione né autorizzazione: assume che il
 * chiamante (server action o API route) abbia già verificato identità e
 * ownership del business.
 *
 * Accetta un `apiKeyId` opzionale: se fornito, viene salvato su
 * commercial_documents per tracciare le emissioni via Developer API.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocuments } from "@/db/schema";
import { withAdeSession, isCieSessionMissing } from "@/lib/ade";
import { AdeReauthRequiredError } from "@/lib/ade/errors";
import type { AdeClient } from "@/lib/ade/client";
import {
  getUserFacingAdeErrorMessage,
  isTransientAdeError,
} from "@/lib/ade/error-messages";
import { logAdeFailure } from "@/lib/ade/log-failure";
import { mapVoidToAdePayload } from "@/lib/ade/mapper";
import { isStatementTimeoutError } from "@/lib/api-errors";
import {
  retryOnStatementTimeout,
  withStatementTimeout,
} from "@/lib/db-timeout";
import { logger } from "@/lib/logger";
import { getFiscalDate } from "@/lib/date-utils";
import {
  fetchAdePrerequisites,
  type AdePrerequisites,
} from "@/lib/server-auth";
import type { VoidReceiptInput, VoidReceiptResult } from "@/types/storico";
import type { VoidRequest } from "@/lib/ade/public-types";
import type { AdeResponse } from "@/lib/ade/types";
import {
  buildAdeSearchWindow,
  claimStaleDocument,
  findClaimedTransactionIds,
  getStalePendingThresholdMs,
  markDocumentErrorBestEffort,
  reconcileVoidDocument,
} from "./ade-recovery";

type ConflictOutcome =
  | { kind: "done"; result: VoidReceiptResult }
  | {
      kind: "recover";
      voidDocumentId: string;
      hasAdeTransaction: boolean;
      existingAdeTransactionId: string | null;
      existingAdeProgressive: string | null;
      existingUpdatedAt: Date;
      existingCreatedAt: Date | null;
    };

type ExistingVoidRow = {
  id: string;
  kind: string;
  status: string;
  adeTransactionId: string | null;
  adeProgressive: string | null;
  createdAt: Date;
  updatedAt: Date;
  voidedDocumentId: string | null;
};

/**
 * Classifica la riga trovata per `(business_id, idempotency_key)` (Case A del
 * conflitto). Estratta da `resolveVoidConflict` per tenerne la Cognitive
 * Complexity sotto 15 (SonarCloud S3776): i branch qui sono top-level, non
 * annidati sotto `if (existingByKey)`.
 */
function resolveExistingVoidByKey(
  existing: ExistingVoidRow,
  voidedDocumentId: string,
  businessId: string,
): ConflictOutcome {
  // REVIEW.md #56: NON filtriamo la SELECT per kind (romperebbe il Case B in
  // resolveVoidConflict: un conflitto su `voided_document_id` non ha riga con
  // QUESTA key). La SELECT per key trova al più una riga (UNIQUE incondizionato
  // su business_id+idempotency_key). Se è un SALE, il client ha riusato per un
  // annullo la key di un'emissione: senza questo guard il ramo stale
  // marcherebbe il SALE VOID_ACCEPTED senza mai chiamare AdE (falso annullo).
  if (existing.kind === "SALE") {
    logger.warn(
      { businessId, saleDocumentId: existing.id },
      "Void idempotency key already used for a SALE",
    );
    return {
      kind: "done",
      result: {
        error:
          "La chiave di idempotenza è già stata usata per un'emissione. Usa una nuova chiave per annullare.",
        code: "IDEMPOTENCY_PAYLOAD_MISMATCH",
      },
    };
  }

  // P1.4: stessa idempotencyKey ma SALE annullato diverso → 409. Evita di
  // ritornare il risultato di un annullo che non corrisponde alla richiesta.
  if (
    existing.voidedDocumentId != null &&
    existing.voidedDocumentId !== voidedDocumentId
  ) {
    logger.warn(
      { businessId, voidDocumentId: existing.id },
      "Idempotency key reused to void a different document",
    );
    return {
      kind: "done",
      result: {
        error:
          "La chiave di idempotenza è già stata usata per annullare un altro documento. Usa una nuova chiave.",
        code: "IDEMPOTENCY_PAYLOAD_MISMATCH",
      },
    };
  }

  if (existing.status === "VOID_ACCEPTED") {
    // Already voided successfully — true idempotency return
    return {
      kind: "done",
      result: {
        voidDocumentId: existing.id,
        adeTransactionId: existing.adeTransactionId ?? undefined,
        adeProgressive: existing.adeProgressive ?? undefined,
      },
    };
  }

  if (existing.status === "REJECTED") {
    return {
      kind: "done",
      result: {
        error:
          "Annullo precedente rifiutato dall'AdE. Riapri il dialogo con una nuova chiave.",
      },
    };
  }

  // PENDING or ERROR: void was started but never completed.
  // If the row is "stale", enter recovery instead of blocking the client.
  //
  // Staleness is gated on updatedAt, NOT the immutable createdAt: claimStaleDocument
  // bumps updated_at when a retry wins the claim, so a void whose recovery is
  // already in flight (submitVoid in progress, status still PENDING) looks
  // "recent" and an overlapping retry gets VOID_PENDING_IN_PROGRESS instead of
  // winning a second claim against the bumped snapshot — which would re-submit
  // and create a duplicate VOID on AdE (irreversible). createdAt is kept only
  // for age logging.
  const createdAtMs = existing.createdAt
    ? new Date(existing.createdAt).getTime()
    : Number.NaN;
  const updatedAtMs = existing.updatedAt
    ? new Date(existing.updatedAt).getTime()
    : Number.NaN;
  const isStale =
    Number.isFinite(updatedAtMs) &&
    Date.now() - updatedAtMs > getStalePendingThresholdMs();

  if (isStale) {
    logger.warn(
      {
        voidDocumentId: existing.id,
        businessId,
        status: existing.status,
        ageMs: Date.now() - createdAtMs,
      },
      "Recovering stale PENDING/ERROR void",
    );
    return {
      kind: "recover",
      voidDocumentId: existing.id,
      hasAdeTransaction: existing.adeTransactionId != null,
      existingAdeTransactionId: existing.adeTransactionId,
      existingAdeProgressive: existing.adeProgressive,
      existingUpdatedAt: existing.updatedAt,
      existingCreatedAt: existing.createdAt,
    };
  }

  return {
    kind: "done",
    result: {
      error:
        "Annullo precedente ancora in elaborazione. Riprova tra qualche secondo.",
      code: "VOID_PENDING_IN_PROGRESS",
    },
  };
}

/**
 * Called when the VOID document INSERT was skipped by ON CONFLICT DO NOTHING.
 * Determines whether the conflict is due to the same idempotency key (retry-safe)
 * or a different key targeting the same SALE (race condition).
 *
 * When the existing PENDING/ERROR is stale, returns `{ kind: "recover" }`
 * so the caller can re-execute the submitVoid flow with the existing row.
 */
async function resolveVoidConflict(
  db: ReturnType<typeof getDb>,
  idempotencyKey: string,
  businessId: string,
  voidedDocumentId: string,
): Promise<ConflictOutcome> {
  // Case A: same idempotencyKey → same-request retry (true idempotency path)
  const [existingByKey] = await db
    .select({
      id: commercialDocuments.id,
      kind: commercialDocuments.kind,
      status: commercialDocuments.status,
      adeTransactionId: commercialDocuments.adeTransactionId,
      adeProgressive: commercialDocuments.adeProgressive,
      createdAt: commercialDocuments.createdAt,
      updatedAt: commercialDocuments.updatedAt,
      voidedDocumentId: commercialDocuments.voidedDocumentId,
    })
    .from(commercialDocuments)
    .where(
      and(
        eq(commercialDocuments.idempotencyKey, idempotencyKey),
        eq(commercialDocuments.businessId, businessId),
      ),
    )
    .limit(1);

  if (existingByKey) {
    return resolveExistingVoidByKey(
      existingByKey,
      voidedDocumentId,
      businessId,
    );
  }

  // Case B: different idempotencyKey, same voidedDocumentId → race condition blocked.
  return {
    kind: "done",
    result: {
      error:
        "Questo scontrino è già stato annullato o è in fase di annullo da un'altra richiesta.",
      code: "VOID_ALREADY_TARGETED",
    },
  };
}

/**
 * Esegue solo le UPDATE finali del flusso void senza chiamare submitVoid.
 *
 * Usato nel recovery quando submitVoid era già andato a buon fine su AdE
 * ma la transazione finale di UPDATE era fallita: il VOID resta PENDING con
 * adeTransactionId valorizzato e la SALE resta ACCEPTED. Re-chiamare
 * submitVoid produrrebbe un doppio annullo su AdE (irreversibile).
 *
 * Le due UPDATE sono naturalmente idempotenti (impostano stato finale).
 */
async function finalizeVoidOnly(
  voidDocumentId: string,
  saleDocumentId: string,
  adeTransactionId: string,
  adeProgressive: string,
): Promise<VoidReceiptResult> {
  try {
    // Retry on statement timeout + SET LOCAL statement_timeout (3s).
    // submitVoid è già andato a buon fine, dobbiamo riuscire a finalizzare
    // prima di rinunciare (3 tentativi: 200ms → 500ms → 1s).
    await retryOnStatementTimeout("void-finalize-only", () =>
      withStatementTimeout(3000, async (tx) => {
        // REVIEW.md #56 (defense in depth): guard `kind` su entrambe le UPDATE.
        // Se una key riusata avesse fatto puntare gli ID a una riga del kind
        // sbagliato, il guard impedisce di flippare un SALE a VOID_ACCEPTED (o
        // viceversa). `kind` è immutabile → non rompe i retry legittimi.
        await tx
          .update(commercialDocuments)
          .set({
            status: "VOID_ACCEPTED",
            adeTransactionId,
            adeProgressive,
          })
          .where(
            and(
              eq(commercialDocuments.id, voidDocumentId),
              eq(commercialDocuments.kind, "VOID"),
            ),
          );

        await tx
          .update(commercialDocuments)
          .set({ status: "VOID_ACCEPTED" })
          .where(
            and(
              eq(commercialDocuments.id, saleDocumentId),
              eq(commercialDocuments.kind, "SALE"),
            ),
          );
      }),
    );

    logger.info(
      { voidDocumentId, saleDocumentId, adeTransactionId, recovery: true },
      "Void finalized from stale PENDING (recovery)",
    );

    return {
      voidDocumentId,
      adeTransactionId,
      adeProgressive,
    };
  } catch (err) {
    // Don't mark ERROR: the partial unique index excludes ERROR, so flipping
    // status here would let a fresh idempotency key insert a SECOND VOID for
    // an already-voided SALE on AdE (irreversible duplicate). Leave the row
    // PENDING so the next retry re-enters this same finalization path.
    logger.error(
      {
        err,
        critical: true,
        voidDocumentId,
        saleDocumentId,
        adeTransactionId,
      },
      "Void finalization failed after submitVoid succeeded — MANUAL CLEANUP NEEDED",
    );
    return {
      error:
        "Annullo registrato su AdE ma sincronizzazione DB in errore. Contatta il supporto.",
      code: "VOID_SYNC_FAILED",
    };
  }
}

/**
 * Gestisce la risposta AdE a submitVoid: rifiuto → REJECTED + return error;
 * accettazione → finalize transazionale + return successo. Su finalize fallita
 * dopo submitVoid riuscita, return VOID_SYNC_FAILED senza marcare ERROR
 * (vedi finalizeVoidOnly).
 *
 * Estratto da `voidReceiptForBusiness` per ridurre cognitive complexity.
 */
async function processVoidAdeResponse(args: {
  adeResponse: AdeResponse;
  voidDocumentId: string;
  saleDocumentId: string;
  businessId: string;
  apiKeyId: string | null | undefined;
}): Promise<VoidReceiptResult> {
  const { adeResponse, voidDocumentId, saleDocumentId, businessId, apiKeyId } =
    args;
  const db = getDb();

  // AdE can return HTTP 200 with esito:false when it rejects the void.
  if (!adeResponse.esito) {
    const errorCodes = adeResponse.errori?.map((e) => e.codice) ?? [];
    const errorDescriptions =
      adeResponse.errori?.map((e) => e.descrizione) ?? [];
    // warn (level 40) — sotto la soglia Sentry: un rifiuto business AdE
    // (esito:false) non è un errore applicativo, quindi non apre issue
    // Sentry. Resta nei log Docker per indagine.
    logger.warn(
      {
        voidDocumentId,
        saleDocumentId,
        adeIdtrx: adeResponse.idtrx,
        adeProgressivo: adeResponse.progressivo,
        adeErrorCodes: errorCodes,
        adeErrorDescriptions: errorDescriptions,
      },
      "AdE rejected void",
    );
    // Retry on statement timeout. AdE ha rifiutato → la submitVoid è
    // ininfluente, ma il DB deve riflettere REJECTED altrimenti la riga
    // resta PENDING e bloccherebbe retry con nuova key (partial index).
    await retryOnStatementTimeout("void-update-rejected", () =>
      db
        .update(commercialDocuments)
        .set({
          status: "REJECTED",
          adeResponse,
        })
        .where(eq(commercialDocuments.id, voidDocumentId)),
    );
    return {
      error:
        "Il portale Agenzia delle Entrate Fatture e Corrispettivi ha rifiutato l'annullamento dello scontrino. Non dipende da te né da ScontrinoZero. Riprova tra qualche minuto.",
    };
  }

  // 4+5. Update VOID document and mark original SALE atomically.
  // Retry on timeout + SET LOCAL statement_timeout (3s). submitVoid
  // è già successa: se la finalizzazione fallisce in modo definitivo NON
  // marcare ERROR (vedi finalizeVoidOnly).
  try {
    await retryOnStatementTimeout("void-finalize-main", () =>
      withStatementTimeout(3000, async (tx) => {
        await tx
          .update(commercialDocuments)
          .set({
            status: "VOID_ACCEPTED",
            adeTransactionId: adeResponse.idtrx ?? null,
            adeProgressive: adeResponse.progressivo ?? null,
            adeResponse,
          })
          .where(eq(commercialDocuments.id, voidDocumentId));

        await tx
          .update(commercialDocuments)
          .set({ status: "VOID_ACCEPTED" })
          .where(eq(commercialDocuments.id, saleDocumentId));
      }),
    );
  } catch (finalizeErr) {
    logger.error(
      {
        err: finalizeErr,
        critical: true,
        voidDocumentId,
        saleDocumentId,
        adeTransactionId: adeResponse.idtrx,
      },
      "Void finalization failed after submitVoid succeeded — MANUAL CLEANUP NEEDED",
    );
    return {
      error:
        "Annullo registrato su AdE ma sincronizzazione DB in errore. Contatta il supporto.",
      code: "VOID_SYNC_FAILED",
    };
  }

  logger.info(
    {
      voidDocumentId,
      saleDocumentId,
      businessId,
      adeTransactionId: adeResponse.idtrx,
      apiKeyId: apiKeyId ?? undefined,
    },
    "Receipt voided successfully",
  );

  return {
    voidDocumentId,
    adeTransactionId: adeResponse.idtrx ?? undefined,
    adeProgressive: adeResponse.progressivo ?? undefined,
  };
}

/**
 * Annulla uno scontrino per il business indicato.
 *
 * Il chiamante deve aver già verificato:
 * - autenticità dell'utente/API key
 * - che `input.businessId` è non vuoto
 * - che l'utente/key è autorizzato ad operare su questo business
 *
 * @param input    Dati dell'annullo (documentId + idempotencyKey + businessId)
 * @param apiKeyId UUID della API key usata, o null/undefined per UI session
 */
type SaleDoc = typeof commercialDocuments.$inferSelect;

type PrepareVoidOutcome =
  | { kind: "done"; result: VoidReceiptResult }
  | {
      kind: "ready";
      saleAdeTransactionId: string;
      saleAdeProgressive: string;
      saleCreatedAt: Date;
      voidDocumentId: string;
      recovery: boolean;
      voidCreatedAt?: Date | null;
      prerequisites: AdePrerequisites;
    };

const dbTimeoutResult: VoidReceiptResult = {
  error: "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
  code: "DB_TIMEOUT",
};

/**
 * Risolve tutta la fase pre-AdE del void: fetch SALE, validation, fetch
 * prerequisites, INSERT VOID, conflict resolution.
 *
 * Estratto da `voidReceiptForBusiness` per ridurre la cognitive complexity
 * sotto 15 (SonarCloud). Ritorna `done` se il flusso può fermarsi (errore o
 * idempotency hit o finalize-only nel recovery), `ready` se tutto è pronto
 * per la submitVoid AdE.
 */
async function prepareVoidDocument(
  input: VoidReceiptInput,
  apiKeyId: string | null | undefined,
): Promise<PrepareVoidOutcome> {
  const db = getDb();

  let saleDoc: SaleDoc | undefined;
  try {
    saleDoc = (
      await db
        .select()
        .from(commercialDocuments)
        .where(
          and(
            eq(commercialDocuments.id, input.documentId),
            eq(commercialDocuments.businessId, input.businessId),
          ),
        )
        .limit(1)
    )[0];
  } catch (err) {
    if (isStatementTimeoutError(err)) {
      logger.warn(
        { businessId: input.businessId, saleDocumentId: input.documentId },
        "voidReceipt SELECT SALE timed out",
      );
      return { kind: "done", result: dbTimeoutResult };
    }
    throw err;
  }

  if (!saleDoc) {
    // Solo per il path API v1 (apiKeyId presente): loggare un warn unico sul
    // not-found cross-tenant (REVIEW #15) per dare visibilità sull'enumerazione
    // di UUID altrui — il rate per apiKeyId è il segnale. Gate su apiKeyId: la
    // stessa funzione serve le UI session (apiKeyId null), dove l'errorClass v1
    // sarebbe fuorviante e l'enumerazione non è applicabile. warn, non error
    // (input prevedibile, regola 20): niente issue Sentry.
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
    return { kind: "done", result: { error: "Scontrino non trovato." } };
  }
  if (saleDoc.kind !== "SALE") {
    return {
      kind: "done",
      result: {
        error: "Solo i documenti di vendita possono essere annullati.",
      },
    };
  }
  if (saleDoc.status !== "ACCEPTED") {
    return {
      kind: "done",
      result: {
        error:
          "Il documento non è in uno stato annullabile (già annullato o in errore).",
      },
    };
  }
  // Destructure: const-narrowing su questi campi sopravvive agli await
  // successivi, evitando un cast `as` sul saleDoc (Sonar S4325).
  const { adeTransactionId, adeProgressive, createdAt } = saleDoc;
  if (!adeTransactionId || !adeProgressive) {
    return {
      kind: "done",
      result: { error: "Dati AdE mancanti per l'annullo." },
    };
  }

  const prerequisites = await fetchAdePrerequisites(input.businessId);
  if ("error" in prerequisites) {
    return { kind: "done", result: prerequisites };
  }

  // CIE: sessione interattiva assente/scaduta → chiedi il rinnovo PRIMA di
  // inserire la riga VOID PENDING (evita un annullo bloccato dallo stale-gate).
  if (prerequisites.method === "cie" && isCieSessionMissing(input.businessId)) {
    return { kind: "done", result: { reauthRequired: true } };
  }

  const insertOutcome = await insertOrResolveVoid(input, apiKeyId);
  if (insertOutcome.kind === "done") return insertOutcome;

  return {
    kind: "ready",
    saleAdeTransactionId: adeTransactionId,
    saleAdeProgressive: adeProgressive,
    saleCreatedAt: createdAt,
    voidDocumentId: insertOutcome.voidDocumentId,
    recovery: insertOutcome.recovery,
    voidCreatedAt: insertOutcome.voidCreatedAt,
    prerequisites,
  };
}

/**
 * Inserisce la riga VOID PENDING e, su conflitto, delega a resolveVoidConflict
 * + finalizeVoidOnly. Estratto per ridurre la complexity di prepareVoidDocument.
 */
async function insertOrResolveVoid(
  input: VoidReceiptInput,
  apiKeyId: string | null | undefined,
): Promise<
  | { kind: "done"; result: VoidReceiptResult }
  | {
      kind: "inserted";
      voidDocumentId: string;
      recovery: boolean;
      voidCreatedAt?: Date | null;
    }
> {
  const db = getDb();
  try {
    const [voidDoc] = await db
      .insert(commercialDocuments)
      .values({
        businessId: input.businessId,
        kind: "VOID",
        idempotencyKey: input.idempotencyKey,
        voidedDocumentId: input.documentId,
        apiKeyId: apiKeyId ?? null,
        status: "PENDING",
      })
      .onConflictDoNothing()
      .returning({ id: commercialDocuments.id });

    if (voidDoc) {
      // Fresh insert: AdE non ha ancora nulla → nessun lookup pre-retry.
      return { kind: "inserted", voidDocumentId: voidDoc.id, recovery: false };
    }

    // INSERT skipped due to a constraint conflict — delegate.
    const conflict = await resolveVoidConflict(
      db,
      input.idempotencyKey,
      input.businessId,
      input.documentId,
    );
    if (conflict.kind === "done")
      return { kind: "done", result: conflict.result };

    // Recovery: submitVoid già successo → finalize-only.
    if (
      conflict.hasAdeTransaction &&
      conflict.existingAdeTransactionId &&
      conflict.existingAdeProgressive
    ) {
      const finalize = await finalizeVoidOnly(
        conflict.voidDocumentId,
        input.documentId,
        conflict.existingAdeTransactionId,
        conflict.existingAdeProgressive,
      );
      return { kind: "done", result: finalize };
    }

    // P1.3: claim CAS su updated_at per serializzare due recovery concorrenti.
    // Solo il primo retry vince e riesegue submitVoid; gli altri ricevono
    // VOID_PENDING_IN_PROGRESS senza ri-sottomettere (evita il doppio annullo
    // su AdE da retry concorrenti oltre la soglia stale).
    const claimed = await claimStaleDocument(
      db,
      conflict.voidDocumentId,
      conflict.existingUpdatedAt,
    );
    if (!claimed) {
      return {
        kind: "done",
        result: {
          error:
            "Annullo precedente ancora in elaborazione. Riprova tra qualche secondo.",
          code: "VOID_PENDING_IN_PROGRESS",
        },
      };
    }

    // Recovery path SENZA adeTransactionId noto: il caller (voidReceiptForBusiness)
    // esegue il lookup AdE pre-retry via searchDocuments nella stessa sessione,
    // prima di ri-sottomettere submitVoid (REVIEW.md #4): se AdE aveva già
    // registrato l'annullo → finalize-only, altrimenti re-submit.
    return {
      kind: "inserted",
      voidDocumentId: conflict.voidDocumentId,
      recovery: true,
      voidCreatedAt: conflict.existingCreatedAt,
    };
  } catch (err) {
    if (isStatementTimeoutError(err)) {
      logger.warn(
        { businessId: input.businessId, saleDocumentId: input.documentId },
        "voidReceipt INSERT VOID timed out",
      );
      return { kind: "done", result: dbTimeoutResult };
    }
    throw err;
  }
}

/**
 * Lookup AdE pre-retry per il recovery di un ANNULLO stale (REVIEW.md #4).
 *
 * Gira dentro `withAdeSession`, prima di getDocument/submitVoid, nella stessa
 * sessione. Interroga `searchDocuments` (tipoOperazione "A") nella finestra del
 * VOID e riconcilia con la chiave forte `annulli === saleProgressivo`:
 *  - match → finalize-only con gli ID AdE recuperati (nessun submit, nessun
 *    doppio annullo): ritorna il risultato finale.
 *  - ambiguous → non finalizza: ritorna VOID_PENDING_IN_PROGRESS (conservativo).
 *  - lookup fallito (rete/AdE down) → fail-safe: VOID_PENDING_IN_PROGRESS,
 *    niente submit.
 *  - none → ritorna `null`: il chiamante procede col re-submit come prima.
 */
async function reconcileVoidBeforeResubmit(
  adeClient: AdeClient,
  ctx: {
    voidDocumentId: string;
    saleDocumentId: string;
    businessId: string;
    saleProgressivo: string;
    voidCreatedAt: Date;
  },
): Promise<VoidReceiptResult | null> {
  const { voidDocumentId, saleDocumentId, businessId, saleProgressivo } = ctx;
  let documents;
  let claimedIdtrx: ReadonlySet<string>;
  try {
    const window = buildAdeSearchWindow(ctx.voidCreatedAt);
    const list = await adeClient.searchDocuments({
      ...window,
      tipoOperazione: "A",
    });
    documents = list.elencoRisultati;
    // Escludi gli annulli AdE già collegati ad altre righe del business
    // (simmetrico alla vendita): un idtrx già rivendicato non è il nostro orfano.
    claimedIdtrx = await findClaimedTransactionIds(getDb(), {
      businessId,
      excludeDocumentId: voidDocumentId,
      idtrxs: documents.map((doc) => doc.idtrx),
    });
  } catch (err) {
    // Fail-safe: non sappiamo se AdE aveva registrato l'annullo → NON ri-sottomettiamo.
    logAdeFailure(
      err,
      { voidDocumentId, saleDocumentId, businessId, flow: "void-receipt" },
      {
        transient: "Void recovery: searchDocuments lookup failed (transient)",
        failure: "Void recovery: searchDocuments lookup failed",
      },
    );
    return {
      error:
        "Annullo precedente ancora in elaborazione. Riprova tra qualche secondo.",
      code: "VOID_PENDING_IN_PROGRESS",
    };
  }

  const result = reconcileVoidDocument({
    documents,
    saleProgressivo,
    claimedIdtrx,
  });

  if (result.kind === "match") {
    logger.warn(
      { voidDocumentId, saleDocumentId, idtrx: result.idtrx },
      "Void recovery: AdE già registrato (match) → finalize-only, niente re-submit",
    );
    return finalizeVoidOnly(
      voidDocumentId,
      saleDocumentId,
      result.idtrx,
      result.numeroProgressivo,
    );
  }

  if (result.kind === "ambiguous") {
    logger.warn(
      { voidDocumentId, saleDocumentId },
      "Void recovery: match AdE ambiguo → niente finalize, resta PENDING (conservativo)",
    );
    return {
      error:
        "Annullo precedente ancora in elaborazione. Riprova tra qualche secondo.",
      code: "VOID_PENDING_IN_PROGRESS",
    };
  }

  return null;
}

export async function voidReceiptForBusiness(
  input: VoidReceiptInput,
  apiKeyId?: string | null,
): Promise<VoidReceiptResult> {
  const db = getDb();

  const prep = await prepareVoidDocument(input, apiKeyId);
  if (prep.kind === "done") return prep.result;
  const {
    saleAdeTransactionId,
    saleAdeProgressive,
    saleCreatedAt,
    voidDocumentId,
    recovery,
    voidCreatedAt,
  } = prep;
  const { prerequisites } = prep;
  const { cedentePrestatore } = prerequisites;

  try {
    return await withAdeSession(
      prerequisites.method === "cie"
        ? { businessId: input.businessId, method: "cie" }
        : {
            businessId: input.businessId,
            method: "fisconline",
            credentials: {
              codiceFiscale: prerequisites.codiceFiscale,
              password: prerequisites.password,
              pin: prerequisites.pin,
            },
          },
      async (adeClient) => {
        // Lookup AdE pre-retry (REVIEW.md #4): solo in recovery, prima di
        // ri-sottomettere, riconcilia l'annullo con AdE nella stessa sessione.
        if (recovery && voidCreatedAt) {
          const reconciled = await reconcileVoidBeforeResubmit(adeClient, {
            voidDocumentId,
            saleDocumentId: input.documentId,
            businessId: input.businessId,
            saleProgressivo: saleAdeProgressive,
            voidCreatedAt,
          });
          if (reconciled) return reconciled;
        }

        // Fetch original document from AdE to get real idElementoContabile values
        const originalAdeDoc =
          await adeClient.getDocument(saleAdeTransactionId);

        const voidReq: VoidRequest = {
          idempotencyKey: input.idempotencyKey,
          originalDocument: {
            transactionId: saleAdeTransactionId,
            documentProgressive: saleAdeProgressive,
            date: getFiscalDate(saleCreatedAt),
          },
        };

        const payload = mapVoidToAdePayload(
          voidReq,
          cedentePrestatore,
          originalAdeDoc,
        );
        const adeResponse = await adeClient.submitVoid(payload);
        return await processVoidAdeResponse({
          adeResponse,
          voidDocumentId,
          saleDocumentId: input.documentId,
          businessId: input.businessId,
          apiKeyId,
        });
      },
    );
  } catch (err) {
    // Sessione CIE scaduta in-flight: 401 AdE = annullo NON registrato → nessun
    // duplicato. A differenza dei transient (esito ignoto → PENDING obbligatorio,
    // sotto), qui il 401 garantisce che submitVoid non è passato: marchiamo ERROR
    // best-effort (REVIEW.md #48). L'index unique parziale su voided_document_id
    // esclude ERROR (migration 0012) e il SALE resta ACCEPTED, quindi un retry
    // re-inserisce una nuova riga VOID e ri-sottomette da zero — senza il ghost
    // PENDING perpetuo. Non è un failure nostro: niente logAdeFailure/Sentry (r.20).
    if (err instanceof AdeReauthRequiredError) {
      await markDocumentErrorBestEffort(
        voidDocumentId,
        { voidDocumentId },
        "Failed to mark VOID as ERROR after CIE reauth-required",
      );
      return { reauthRequired: true };
    }

    logAdeFailure(
      err,
      {
        voidDocumentId,
        saleDocumentId: input.documentId,
        flow: "void-receipt",
      },
      {
        transient: "voidReceiptForBusiness AdE transient failure",
        failure: "voidReceiptForBusiness failed",
      },
    );

    // Don't mark ERROR on a statement timeout OR an AdE transient failure
    // (network / 5xx / SPID timeout — REVIEW.md #35). Leave the row PENDING so:
    // - Stale recovery can re-attempt (submitVoid not yet called → safe)
    // - OR if submitVoid already succeeded, the partial unique index still
    //   blocks duplicate VOIDs (which would NOT be the case if status=ERROR).
    if (!isStatementTimeoutError(err) && !isTransientAdeError(err)) {
      try {
        await db
          .update(commercialDocuments)
          .set({ status: "ERROR" })
          .where(eq(commercialDocuments.id, voidDocumentId));
      } catch (updateErr) {
        logger.warn(
          { err: updateErr, voidDocumentId },
          "Failed to mark VOID as ERROR after void failure",
        );
      }
    }

    if (isStatementTimeoutError(err)) {
      return {
        error:
          "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
        code: "DB_TIMEOUT",
      };
    }

    const userFacing = getUserFacingAdeErrorMessage(
      err,
      "Errore durante l'annullo dello scontrino. Riprova più tardi.",
    );
    return { error: userFacing.message };
  }
}
