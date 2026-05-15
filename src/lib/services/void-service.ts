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
import { createAdeClient } from "@/lib/ade";
import { mapVoidToAdePayload } from "@/lib/ade/mapper";
import { isStatementTimeoutError } from "@/lib/api-errors";
import {
  retryOnStatementTimeout,
  withStatementTimeout,
} from "@/lib/db-timeout";
import { logger } from "@/lib/logger";
import { getFiscalDate } from "@/lib/date-utils";
import { fetchAdePrerequisites } from "@/lib/server-auth";
import type { VoidReceiptInput, VoidReceiptResult } from "@/types/storico";
import type { VoidRequest } from "@/lib/ade/public-types";
import type { AdeResponse } from "@/lib/ade/types";

/**
 * Soglia oltre la quale un VOID PENDING/ERROR è considerato "stale" (B7).
 * Sopra questa soglia, un retry con la stessa idempotencyKey entra nel
 * recovery path. Default: 30 min. Override via STALE_PENDING_THRESHOLD_MINUTES.
 *
 * Rischio residuo (P1-03, quick fix): vedi receipt-service.ts per il commento
 * esteso. AdE non accetta una idempotency-key nel payload submitVoid: se la
 * risposta del primo submit si è persa in volo, un retry crea un VOID
 * duplicato IRREVERSIBILE. La soglia alzata da 5 → 30 min riduce la finestra
 * ma non la elimina. Soluzione corretta (lookup AdE pre-retry) rinviata a
 * v1.11.0.
 */
function getStalePendingThresholdMs(): number {
  const raw = process.env.STALE_PENDING_THRESHOLD_MINUTES;
  const minutes = raw ? Number.parseFloat(raw) : Number.NaN;
  const effective = Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
  return effective * 60 * 1000;
}

type ConflictOutcome =
  | { kind: "done"; result: VoidReceiptResult }
  | {
      kind: "recover";
      voidDocumentId: string;
      hasAdeTransaction: boolean;
      existingAdeTransactionId: string | null;
      existingAdeProgressive: string | null;
    };

/**
 * Called when the VOID document INSERT was skipped by ON CONFLICT DO NOTHING.
 * Determines whether the conflict is due to the same idempotency key (retry-safe)
 * or a different key targeting the same SALE (race condition).
 *
 * B7: when the existing PENDING/ERROR is stale, returns `{ kind: "recover" }`
 * so the caller can re-execute the submitVoid flow with the existing row.
 */
async function resolveVoidConflict(
  db: ReturnType<typeof getDb>,
  idempotencyKey: string,
  businessId: string,
): Promise<ConflictOutcome> {
  // Case A: same idempotencyKey → same-request retry (true idempotency path)
  const [existingByKey] = await db
    .select({
      id: commercialDocuments.id,
      status: commercialDocuments.status,
      adeTransactionId: commercialDocuments.adeTransactionId,
      adeProgressive: commercialDocuments.adeProgressive,
      createdAt: commercialDocuments.createdAt,
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
    if (existingByKey.status === "VOID_ACCEPTED") {
      // Already voided successfully — true idempotency return
      return {
        kind: "done",
        result: {
          voidDocumentId: existingByKey.id,
          adeTransactionId: existingByKey.adeTransactionId ?? undefined,
          adeProgressive: existingByKey.adeProgressive ?? undefined,
        },
      };
    }

    if (existingByKey.status === "REJECTED") {
      return {
        kind: "done",
        result: {
          error:
            "Annullo precedente rifiutato dall'AdE. Riapri il dialogo con una nuova chiave.",
        },
      };
    }

    // PENDING or ERROR: void was started but never completed.
    // B7: if the row is "stale", enter recovery instead of blocking the client.
    const createdAtMs = existingByKey.createdAt
      ? new Date(existingByKey.createdAt).getTime()
      : Number.NaN;
    const isStale =
      Number.isFinite(createdAtMs) &&
      Date.now() - createdAtMs > getStalePendingThresholdMs();

    if (isStale) {
      logger.warn(
        {
          voidDocumentId: existingByKey.id,
          businessId,
          status: existingByKey.status,
          ageMs: Date.now() - createdAtMs,
        },
        "Recovering stale PENDING/ERROR void",
      );
      return {
        kind: "recover",
        voidDocumentId: existingByKey.id,
        hasAdeTransaction: existingByKey.adeTransactionId != null,
        existingAdeTransactionId: existingByKey.adeTransactionId,
        existingAdeProgressive: existingByKey.adeProgressive,
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
 * Usato nel recovery (B7) quando submitVoid era già andato a buon fine su AdE
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
    // B20: retry on statement timeout + SET LOCAL statement_timeout (3s).
    // submitVoid è già andato a buon fine, dobbiamo riuscire a finalizzare
    // prima di rinunciare (3 tentativi: 200ms → 500ms → 1s).
    await retryOnStatementTimeout("void-finalize-only", () =>
      withStatementTimeout(3000, async (tx) => {
        await tx
          .update(commercialDocuments)
          .set({
            status: "VOID_ACCEPTED",
            adeTransactionId,
            adeProgressive,
          })
          .where(eq(commercialDocuments.id, voidDocumentId));

        await tx
          .update(commercialDocuments)
          .set({ status: "VOID_ACCEPTED" })
          .where(eq(commercialDocuments.id, saleDocumentId));
      }),
    );

    logger.info(
      { voidDocumentId, saleDocumentId, adeTransactionId, recovery: true },
      "Void finalized from stale PENDING (B7 recovery)",
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
    logger.error(
      {
        voidDocumentId,
        saleDocumentId,
        adeIdtrx: adeResponse.idtrx,
        adeProgressivo: adeResponse.progressivo,
        adeErrorCodes: errorCodes,
      },
      "AdE rejected void",
    );
    // B20: retry on statement timeout. AdE ha rifiutato → la submitVoid è
    // ininfluente, ma il DB deve riflettere REJECTED altrimenti la riga
    // resta PENDING e bloccherebbe retry con nuova key (partial index).
    await retryOnStatementTimeout("void-update-rejected", () =>
      db
        .update(commercialDocuments)
        .set({
          status: "REJECTED",
          adeResponse: adeResponse as unknown as Record<string, unknown>,
        })
        .where(eq(commercialDocuments.id, voidDocumentId)),
    );
    const codeList = errorCodes.length > 0 ? ` (${errorCodes.join(", ")})` : "";
    return {
      error: `Annullo rifiutato dall'AdE${codeList}. Verifica i dati e riprova.`,
    };
  }

  // 4+5. Update VOID document and mark original SALE atomically.
  // B20: retry on timeout + SET LOCAL statement_timeout (3s). submitVoid
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
            adeResponse: adeResponse as unknown as Record<string, unknown>,
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
      prerequisites: {
        codiceFiscale: string;
        password: string;
        pin: string;
        cedentePrestatore: NonNullable<
          Awaited<ReturnType<typeof fetchAdePrerequisites>> extends infer T
            ? T extends { cedentePrestatore: infer C }
              ? C
              : never
            : never
        >;
      };
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
 * idempotency hit o finalize-only B7), `ready` se tutto è pronto per la
 * submitVoid AdE.
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
        "voidReceipt SELECT SALE timed out (B20)",
      );
      return { kind: "done", result: dbTimeoutResult };
    }
    throw err;
  }

  if (!saleDoc) {
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

  const insertOutcome = await insertOrResolveVoid(input, apiKeyId);
  if (insertOutcome.kind === "done") return insertOutcome;

  return {
    kind: "ready",
    saleAdeTransactionId: adeTransactionId,
    saleAdeProgressive: adeProgressive,
    saleCreatedAt: createdAt,
    voidDocumentId: insertOutcome.voidDocumentId,
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
  | { kind: "inserted"; voidDocumentId: string }
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
      return { kind: "inserted", voidDocumentId: voidDoc.id };
    }

    // INSERT skipped due to a constraint conflict — delegate.
    const conflict = await resolveVoidConflict(
      db,
      input.idempotencyKey,
      input.businessId,
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

    // Recovery path SENZA adeTransactionId noto: il retry rieseguirà submitVoid.
    // Rischio P1-03: se il primo attempt era arrivato ad AdE ma la response si è
    // persa, qui creiamo un VOID duplicato. Logging esplicito per audit.
    logger.warn(
      {
        voidDocumentId: conflict.voidDocumentId,
        saleDocumentId: input.documentId,
        businessId: input.businessId,
      },
      "Void recovery: re-submitting submitVoid without AdE idempotency check (P1-03 residual risk)",
    );
    return { kind: "inserted", voidDocumentId: conflict.voidDocumentId };
  } catch (err) {
    if (isStatementTimeoutError(err)) {
      logger.warn(
        { businessId: input.businessId, saleDocumentId: input.documentId },
        "voidReceipt INSERT VOID timed out (B20)",
      );
      return { kind: "done", result: dbTimeoutResult };
    }
    throw err;
  }
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
  } = prep;
  const { codiceFiscale, password, pin, cedentePrestatore } =
    prep.prerequisites;

  const adeMode = (process.env.ADE_MODE as "mock" | "real") || "mock";
  const adeClient = createAdeClient(adeMode);
  let loggedIn = false;

  try {
    await adeClient.login({ codiceFiscale, password, pin });
    loggedIn = true;

    // Fetch original document from AdE to get real idElementoContabile values
    const originalAdeDoc = await adeClient.getDocument(saleAdeTransactionId);

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
  } catch (err) {
    logger.error(
      { err, voidDocumentId, saleDocumentId: input.documentId },
      "voidReceiptForBusiness failed",
    );

    // B20: don't mark ERROR on timeout. Leave the row PENDING so:
    // - B7 recovery can re-attempt (submitVoid not yet called → safe)
    // - OR if submitVoid already succeeded, the partial unique index still
    //   blocks duplicate VOIDs (which would NOT be the case if status=ERROR).
    if (!isStatementTimeoutError(err)) {
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

    return {
      error: "Errore durante l'annullo dello scontrino. Riprova più tardi.",
    };
  } finally {
    if (loggedIn) {
      await adeClient
        .logout()
        .catch((err) => logger.warn({ err }, "AdE logout failed"));
    }
  }
}
