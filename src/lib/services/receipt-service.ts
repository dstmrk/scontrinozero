/**
 * Logica di business per l'emissione di scontrini elettronici.
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
import { commercialDocuments, commercialDocumentLines } from "@/db/schema";
import { createAdeClient } from "@/lib/ade";
import { AdePasswordExpiredError } from "@/lib/ade/errors";
import { mapSaleToAdePayload } from "@/lib/ade/mapper";
import { isStatementTimeoutError } from "@/lib/api-errors";
import {
  retryOnStatementTimeout,
  withStatementTimeout,
} from "@/lib/db-timeout";
import { logger } from "@/lib/logger";
import { fetchAdePrerequisites } from "@/lib/server-auth";
import { getFiscalDate } from "@/lib/date-utils";
import { isValidLotteryCode } from "@/lib/validation";
import type {
  SubmitReceiptInput,
  SubmitReceiptResult,
  PaymentMethod,
} from "@/types/cassa";
import type { PaymentType, SaleDocumentRequest } from "@/lib/ade/public-types";
import type { AdeCedentePrestatore } from "@/lib/ade/types";

const PAYMENT_METHOD_TO_ADE: Record<PaymentMethod, PaymentType> = {
  PC: "CASH",
  PE: "ELECTRONIC",
};

/**
 * Soglia oltre la quale un documento PENDING/ERROR è considerato "stale" (B7).
 * Sopra questa soglia, un retry con la stessa idempotencyKey entra nel
 * recovery path invece di ricevere "stato inconsistente".
 *
 * Default: 30 minuti. Override via env STALE_PENDING_THRESHOLD_MINUTES.
 *
 * Rischio residuo (P1-03, quick fix): AdE non supporta una chiave d'idempotenza
 * nel payload submitSale. Se il primo submit è arrivato ad AdE ma la risposta
 * è andata persa (timeout / connessione interrotta), un retry sotto la soglia
 * ritorna PENDING_IN_PROGRESS e l'utente lo riproverà più tardi. Sopra la
 * soglia si rientra in recovery e potenzialmente si fa un SECONDO submit ad
 * AdE — scontrino duplicato. La soglia alzata da 5 → 30 min riduce
 * drasticamente la collision window (la sessione AdE è quasi sempre scaduta
 * dopo 30 min, e un nuovo submit fallisce a monte). Soluzione corretta:
 * lookup AdE pre-retry via searchDocuments — rinviata a v1.11.0 quando il
 * client AdE avrà l'endpoint di ricerca (vedi ricerca_documento.har in roadmap).
 */
function getStalePendingThresholdMs(): number {
  const raw = process.env.STALE_PENDING_THRESHOLD_MINUTES;
  const minutes = raw ? Number.parseFloat(raw) : Number.NaN;
  const effective = Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
  return effective * 60 * 1000;
}

/** Validates and resolves the effective lottery code from the input. */
function resolveLotteryCode(input: SubmitReceiptInput): {
  lotteryCode: string | null;
  error?: string;
} {
  const raw = input.lotteryCode ?? null;
  const code = raw && input.paymentMethod === "PE" ? raw : null;

  if (raw && input.paymentMethod === "PE" && !isValidLotteryCode(raw)) {
    return {
      lotteryCode: null,
      error: "Codice lotteria non valido. Deve essere di 8 caratteri [A-Z0-9].",
    };
  }

  if (code) {
    // Use Math.round(...* 100) to avoid IEEE-754 false negatives at €1.00.
    // e.g. 0.1 * 10 = 0.9999...98 in float; Math.round(0.9999...98 * 100) = 100 ✓
    const totalCents = Math.round(
      input.lines.reduce((sum, l) => sum + l.grossUnitPrice * l.quantity, 0) *
        100,
    );
    if (totalCents < 100) {
      return {
        lotteryCode: null,
        error: "Il codice lotteria richiede un importo minimo di €1,00.",
      };
    }
  }

  return { lotteryCode: code };
}

/**
 * Emette uno scontrino per il business indicato.
 *
 * Il chiamante deve aver già verificato:
 * - autenticità dell'utente/API key
 * - che `input.businessId` è non vuoto
 * - che `input.lines` non è vuoto
 * - che l'utente/key è autorizzato ad operare su questo business
 *
 * @param input   Dati dello scontrino (businessId incluso)
 * @param apiKeyId UUID della API key usata, o null/undefined per UI session
 */
export async function emitReceiptForBusiness(
  input: SubmitReceiptInput,
  apiKeyId?: string | null,
): Promise<SubmitReceiptResult> {
  const { lotteryCode, error: lotteryCodeError } = resolveLotteryCode(input);
  if (lotteryCodeError) return { error: lotteryCodeError };

  const prerequisites = await fetchAdePrerequisites(input.businessId);
  if ("error" in prerequisites) return prerequisites;
  const { codiceFiscale, password, pin, cedentePrestatore } = prerequisites;

  // Insert document + lines atomically, with statement_timeout (B20): if the
  // DB is overloaded we surface 503 invece di un 500 senza contesto.
  let txResult: { alreadyExists: true } | { alreadyExists: false; id: string };
  try {
    txResult = await withStatementTimeout(5000, async (tx) => {
      const publicRequest: Record<string, unknown> = {
        paymentMethod: input.paymentMethod,
      };
      if (lotteryCode) publicRequest.lotteryCode = lotteryCode;

      const [document] = await tx
        .insert(commercialDocuments)
        .values({
          businessId: input.businessId,
          kind: "SALE",
          idempotencyKey: input.idempotencyKey,
          publicRequest,
          lotteryCode,
          apiKeyId: apiKeyId ?? null,
          status: "PENDING",
        })
        .onConflictDoNothing()
        .returning({ id: commercialDocuments.id });

      // Idempotency: a document with this key already exists
      if (!document) {
        return { alreadyExists: true as const };
      }

      await tx.insert(commercialDocumentLines).values(
        input.lines.map((line, index) => ({
          documentId: document.id,
          lineIndex: index,
          description: line.description,
          quantity: String(line.quantity),
          grossUnitPrice: String(line.grossUnitPrice),
          vatCode: line.vatCode,
        })),
      );

      return { alreadyExists: false as const, id: document.id };
    });
  } catch (err) {
    if (isStatementTimeoutError(err)) {
      logger.warn(
        { businessId: input.businessId },
        "emitReceipt INSERT timed out (B20)",
      );
      return {
        error:
          "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
        code: "DB_TIMEOUT",
      };
    }
    throw err;
  }

  if (txResult.alreadyExists) {
    return handleExistingReceipt({
      input,
      lotteryCode,
      prerequisites: { codiceFiscale, password, pin, cedentePrestatore },
      apiKeyId,
    });
  }

  const documentId = txResult.id;
  if (!documentId) {
    logger.error({}, "Transaction returned no document ID");
    return { error: "Errore interno: impossibile creare il documento." };
  }

  return submitSaleToAde(
    documentId,
    input,
    lotteryCode,
    { codiceFiscale, password, pin, cedentePrestatore },
    apiKeyId,
    { recovery: false },
  );
}

/**
 * Risolve il branch "documento già esistente" dell'emit (idempotency).
 *
 * Estratto da `emitReceiptForBusiness` per ridurre la cognitive complexity
 * sotto 15 (SonarCloud). Branch:
 *  - ACCEPTED → return idempotente OK.
 *  - REJECTED → return ALREADY_REJECTED.
 *  - PENDING/ERROR fresh → return PENDING_IN_PROGRESS.
 *  - PENDING/ERROR stale → delega a `recoverStaleReceipt`.
 *  - Row non trovata (caso patologico) → PENDING_IN_PROGRESS.
 */
async function handleExistingReceipt(args: {
  input: SubmitReceiptInput;
  lotteryCode: string | null;
  prerequisites: {
    codiceFiscale: string;
    password: string;
    pin: string;
    cedentePrestatore: AdeCedentePrestatore;
  };
  apiKeyId: string | null | undefined;
}): Promise<SubmitReceiptResult> {
  const { input, lotteryCode, prerequisites, apiKeyId } = args;
  const db = getDb();

  const [existing] = await db
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
        eq(commercialDocuments.idempotencyKey, input.idempotencyKey),
        eq(commercialDocuments.businessId, input.businessId),
      ),
    )
    .limit(1);

  if (!existing) {
    // Shouldn't happen: conflict but no row visible. Treat as transient.
    logger.warn(
      { businessId: input.businessId },
      "Idempotency conflict without matching row",
    );
    return {
      error: "Errore interno: ritenta l'emissione.",
      code: "PENDING_IN_PROGRESS",
    };
  }

  if (existing.status === "ACCEPTED") {
    return {
      documentId: existing.id,
      adeTransactionId: existing.adeTransactionId ?? undefined,
      adeProgressive: existing.adeProgressive ?? undefined,
    };
  }

  if (existing.status === "REJECTED") {
    return {
      error:
        "Scontrino precedente già rifiutato dall'AdE. Usa una nuova chiave di idempotenza.",
      code: "ALREADY_REJECTED",
    };
  }

  // PENDING or ERROR: B7 stale recovery decision.
  const createdAtMs = existing.createdAt
    ? new Date(existing.createdAt).getTime()
    : Number.NaN;
  const isStale =
    Number.isFinite(createdAtMs) &&
    Date.now() - createdAtMs > getStalePendingThresholdMs();
  if (isStale) {
    return recoverStaleReceipt({
      existing,
      input,
      lotteryCode,
      prerequisites,
      apiKeyId,
      createdAtMs,
    });
  }
  return {
    error:
      "Scontrino precedente ancora in elaborazione. Riprova tra qualche secondo.",
    code: "PENDING_IN_PROGRESS",
  };
}

/** Recovery path for stale PENDING/ERROR receipts (B7). Extracted to keep
 *  `emitReceiptForBusiness` cognitive complexity below 15 (SonarCloud). */
async function recoverStaleReceipt(args: {
  existing: {
    id: string;
    status: string;
    adeTransactionId: string | null;
    adeProgressive: string | null;
  };
  input: SubmitReceiptInput;
  lotteryCode: string | null;
  prerequisites: {
    codiceFiscale: string;
    password: string;
    pin: string;
    cedentePrestatore: AdeCedentePrestatore;
  };
  apiKeyId: string | null | undefined;
  createdAtMs: number;
}): Promise<SubmitReceiptResult> {
  const { existing, input, lotteryCode, prerequisites, apiKeyId, createdAtMs } =
    args;
  logger.warn(
    {
      documentId: existing.id,
      businessId: input.businessId,
      status: existing.status,
      hasAdeTransaction: existing.adeTransactionId != null,
      ageMs: Date.now() - createdAtMs,
    },
    "Recovering stale PENDING/ERROR receipt",
  );

  // P1 (Codex review #475): if submitSale already succeeded on AdE
  // (adeTransactionId set), do NOT resubmit — submitSale is irreversible
  // and a second call would create a duplicate fiscal document on AdE.
  // Just retry the final UPDATE using the existing AdE IDs.
  if (existing.adeTransactionId && existing.adeProgressive) {
    return finalizeSaleOnly(
      existing.id,
      existing.adeTransactionId,
      existing.adeProgressive,
    );
  }

  // P1-03 residual risk: re-eseguiamo submitSale senza poter verificare lato
  // AdE se il primo attempt era già arrivato (no idempotency-key supportato).
  // Se la response del primo era andata persa in volo, qui creiamo uno
  // scontrino fiscale duplicato. Risk-mitigation: soglia stale a 30 min.
  logger.warn(
    {
      documentId: existing.id,
      businessId: input.businessId,
    },
    "Sale recovery: re-submitting submitSale without AdE idempotency check (P1-03 residual risk)",
  );

  return submitSaleToAde(
    existing.id,
    input,
    lotteryCode,
    prerequisites,
    apiKeyId,
    {
      recovery: true,
    },
  );
}

/**
 * Esegue solo la UPDATE finale del flusso sale senza chiamare submitSale.
 *
 * Usato nel recovery B7 quando submitSale era già andato a buon fine su AdE
 * ma la UPDATE finale a ACCEPTED era fallita: il documento resta PENDING con
 * adeTransactionId valorizzato. Re-chiamare submitSale produrrebbe un doppio
 * documento fiscale su AdE (irreversibile). La UPDATE è naturalmente
 * idempotente (imposta uno stato finale).
 *
 * Pattern simmetrico a finalizeVoidOnly in void-service.ts.
 */
async function finalizeSaleOnly(
  documentId: string,
  adeTransactionId: string,
  adeProgressive: string,
): Promise<SubmitReceiptResult> {
  const db = getDb();
  try {
    await retryOnStatementTimeout("emit-finalize-only", () =>
      db
        .update(commercialDocuments)
        .set({
          status: "ACCEPTED",
          adeTransactionId,
          adeProgressive,
        })
        .where(eq(commercialDocuments.id, documentId)),
    );
    logger.info(
      { documentId, adeTransactionId, recovery: true },
      "Sale finalized from stale PENDING (B7 recovery)",
    );
    return {
      documentId,
      adeTransactionId,
      adeProgressive,
    };
  } catch (err) {
    logger.error(
      { err, critical: true, documentId, adeTransactionId },
      "Sale finalization failed after submitSale succeeded — MANUAL CLEANUP NEEDED",
    );
    if (isStatementTimeoutError(err)) {
      return {
        error:
          "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
        code: "DB_TIMEOUT",
      };
    }
    return {
      error:
        "Errore durante la finalizzazione dello scontrino. Riprova più tardi.",
    };
  }
}

/**
 * Esegue la submitSale AdE e aggiorna il documento esistente con il risultato.
 * Usato sia per la prima emissione sia per la recovery di un PENDING/ERROR stale (B7).
 */
async function submitSaleToAde(
  documentId: string,
  input: SubmitReceiptInput,
  lotteryCode: string | null,
  prerequisites: {
    codiceFiscale: string;
    password: string;
    pin: string;
    cedentePrestatore: AdeCedentePrestatore;
  },
  apiKeyId: string | null | undefined,
  options: { recovery: boolean },
): Promise<SubmitReceiptResult> {
  const db = getDb();
  const { codiceFiscale, password, pin, cedentePrestatore } = prerequisites;

  const totalAmount =
    Math.round(
      input.lines.reduce(
        (sum, line) => sum + line.grossUnitPrice * line.quantity,
        0,
      ) * 100,
    ) / 100;
  const saleDocRequest: SaleDocumentRequest = {
    date: getFiscalDate(),
    lotteryCode,
    isGiftDocument: false,
    lines: input.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPriceGross: line.grossUnitPrice,
      unitDiscount: 0,
      vatCode: line.vatCode,
      isGift: false,
    })),
    payments: [
      {
        type: PAYMENT_METHOD_TO_ADE[input.paymentMethod],
        amount: totalAmount,
      },
    ],
    globalDiscount: 0,
    deductibleAmount: 0,
  };

  const adeMode = (process.env.ADE_MODE as "mock" | "real") || "mock";
  const adeClient = createAdeClient(adeMode);
  let loggedIn = false;

  try {
    await adeClient.login({ codiceFiscale, password, pin });
    loggedIn = true;
    const payload = mapSaleToAdePayload(saleDocRequest, cedentePrestatore);
    const adeResponse = await adeClient.submitSale(payload);

    if (!adeResponse.esito) {
      const errorCodes = adeResponse.errori?.map((e) => e.codice) ?? [];
      logger.error(
        {
          documentId,
          adeIdtrx: adeResponse.idtrx,
          adeProgressivo: adeResponse.progressivo,
          adeErrorCodes: errorCodes,
          recovery: options.recovery,
        },
        "AdE rejected sale",
      );
      // B20: retry on timeout. La submitSale è già successa (esito:false è una
      // risposta valida AdE, non un errore di rete) — il DB deve riflettere
      // REJECTED altrimenti B7 ritenterà invano una sale già rifiutata.
      await retryOnStatementTimeout("emit-update-rejected", () =>
        db
          .update(commercialDocuments)
          .set({
            status: "REJECTED",
            adeResponse: adeResponse as unknown as Record<string, unknown>,
          })
          .where(eq(commercialDocuments.id, documentId)),
      );
      const codeList =
        errorCodes.length > 0 ? ` (${errorCodes.join(", ")})` : "";
      return {
        error: `Scontrino rifiutato dall'AdE${codeList}. Verifica i dati e riprova.`,
      };
    }

    // B20: retry su timeout. La submitSale ha avuto esito true: AdE ha
    // accettato lo scontrino. Se la UPDATE finale fallisce, la riga resta
    // PENDING e B7 la recupera; ma il retry qui evita la maggior parte dei
    // casi di disallineamento DB↔AdE.
    await retryOnStatementTimeout("emit-update-accepted", () =>
      db
        .update(commercialDocuments)
        .set({
          status: "ACCEPTED",
          adeTransactionId: adeResponse.idtrx ?? null,
          adeProgressive: adeResponse.progressivo ?? null,
          adeResponse: adeResponse as unknown as Record<string, unknown>,
        })
        .where(eq(commercialDocuments.id, documentId)),
    );

    logger.info(
      {
        documentId,
        businessId: input.businessId,
        adeTransactionId: adeResponse.idtrx,
        apiKeyId: apiKeyId ?? undefined,
        recovery: options.recovery,
      },
      "Receipt emitted successfully",
    );

    return {
      documentId,
      adeTransactionId: adeResponse.idtrx ?? undefined,
      adeProgressive: adeResponse.progressivo ?? undefined,
    };
  } catch (err) {
    logger.error(
      {
        err,
        documentId,
        businessId: input.businessId,
        recovery: options.recovery,
      },
      "emitReceiptForBusiness failed",
    );

    // B20: don't mark ERROR if the failure is a statement timeout — the row
    // stays PENDING and B7 will recover. Marking ERROR here would be wrong
    // because we don't know whether submitSale succeeded on AdE.
    if (!isStatementTimeoutError(err)) {
      // Best-effort UPDATE to ERROR; if it also times out we swallow it
      // (the row stays PENDING — B7 recovery applies on next retry).
      try {
        await db
          .update(commercialDocuments)
          .set({ status: "ERROR" })
          .where(eq(commercialDocuments.id, documentId));
      } catch (updateErr) {
        logger.warn(
          { err: updateErr, documentId },
          "Failed to mark document as ERROR after emit failure",
        );
      }
    }

    if (err instanceof AdePasswordExpiredError) {
      return {
        error:
          "La password Fisconline è scaduta. Aggiornala per continuare a emettere scontrini.",
        passwordExpired: true,
      };
    }

    if (isStatementTimeoutError(err)) {
      return {
        error:
          "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
        code: "DB_TIMEOUT",
      };
    }

    return {
      error: "Errore durante l'emissione dello scontrino. Riprova più tardi.",
    };
  } finally {
    if (loggedIn) {
      await adeClient
        .logout()
        .catch((err) => logger.warn({ err }, "AdE logout failed"));
    }
  }
}
