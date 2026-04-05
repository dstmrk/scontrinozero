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
import { mapSaleToAdePayload } from "@/lib/ade/mapper";
import { logger } from "@/lib/logger";
import { fetchAdePrerequisites } from "@/lib/server-auth";
import { isValidLotteryCode } from "@/lib/validation";
import type {
  SubmitReceiptInput,
  SubmitReceiptResult,
  PaymentMethod,
} from "@/types/cassa";
import type { PaymentType, SaleDocumentRequest } from "@/lib/ade/public-types";

const PAYMENT_METHOD_TO_ADE: Record<PaymentMethod, PaymentType> = {
  PC: "CASH",
  PE: "ELECTRONIC",
};

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
    const total = input.lines.reduce(
      (sum, l) => sum + l.grossUnitPrice * l.quantity,
      0,
    );
    if (total < 1) {
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

  const db = getDb();

  // Insert document + lines atomically: if either fails, nothing is persisted
  const txResult = await db.transaction(async (tx) => {
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
      return { alreadyExists: true };
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

    return { alreadyExists: false, id: document.id };
  });

  if (txResult.alreadyExists) {
    const [existing] = await db
      .select({
        id: commercialDocuments.id,
        status: commercialDocuments.status,
        adeTransactionId: commercialDocuments.adeTransactionId,
        adeProgressive: commercialDocuments.adeProgressive,
      })
      .from(commercialDocuments)
      .where(
        and(
          eq(commercialDocuments.idempotencyKey, input.idempotencyKey),
          eq(commercialDocuments.businessId, input.businessId),
        ),
      )
      .limit(1);

    if (existing?.status === "ACCEPTED") {
      // Already submitted successfully — true idempotency return
      return {
        documentId: existing.id,
        adeTransactionId: existing.adeTransactionId ?? undefined,
        adeProgressive: existing.adeProgressive ?? undefined,
      };
    }
    // PENDING or ERROR: document exists but submission never completed
    return {
      error:
        "Scontrino precedente in stato inconsistente. Svuota il carrello e riprova.",
    };
  }

  const documentId = txResult.id;
  if (!documentId) {
    logger.error({}, "Transaction returned no document ID");
    return { error: "Errore interno: impossibile creare il documento." };
  }

  // Build sale document request (round to 2 decimal places to avoid float imprecision)
  const totalAmount =
    Math.round(
      input.lines.reduce(
        (sum, line) => sum + line.grossUnitPrice * line.quantity,
        0,
      ) * 100,
    ) / 100;
  const saleDocRequest: SaleDocumentRequest = {
    date: new Date().toISOString().split("T")[0],
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

    // AdE can return HTTP 200 with esito:false when it rejects the document.
    if (!adeResponse.esito) {
      const errorCodes = adeResponse.errori?.map((e) => e.codice) ?? [];
      logger.error(
        {
          documentId,
          adeIdtrx: adeResponse.idtrx,
          adeProgressivo: adeResponse.progressivo,
          // Full descriptions are kept in adeResponse (persisted to DB below)
          // but are NOT forwarded to the client to avoid leaking fiscal details.
          adeErrorCodes: errorCodes,
        },
        "AdE rejected sale",
      );
      await db
        .update(commercialDocuments)
        .set({
          status: "REJECTED",
          adeResponse: adeResponse as unknown as Record<string, unknown>,
        })
        .where(eq(commercialDocuments.id, documentId));
      const codeList =
        errorCodes.length > 0 ? ` (${errorCodes.join(", ")})` : "";
      return {
        error: `Scontrino rifiutato dall'AdE${codeList}. Verifica i dati e riprova.`,
      };
    }

    await db
      .update(commercialDocuments)
      .set({
        status: "ACCEPTED",
        adeTransactionId: adeResponse.idtrx ?? null,
        adeProgressive: adeResponse.progressivo ?? null,
        adeResponse: adeResponse as unknown as Record<string, unknown>,
      })
      .where(eq(commercialDocuments.id, documentId));

    logger.info(
      {
        documentId,
        businessId: input.businessId,
        adeTransactionId: adeResponse.idtrx,
        apiKeyId: apiKeyId ?? undefined,
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
      { err, documentId, businessId: input.businessId },
      "emitReceiptForBusiness failed",
    );

    await db
      .update(commercialDocuments)
      .set({ status: "ERROR" })
      .where(eq(commercialDocuments.id, documentId));

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
