"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocuments, commercialDocumentLines } from "@/db/schema";
import { createAdeClient } from "@/lib/ade";
import { mapSaleToAdePayload } from "@/lib/ade/mapper";
import { logger } from "@/lib/logger";
import { RateLimiter } from "@/lib/rate-limit";
import {
  getAuthenticatedUser,
  checkBusinessOwnership,
  fetchAdePrerequisites,
} from "@/lib/server-auth";
import { isValidLotteryCode } from "@/lib/validation";
import type {
  SubmitReceiptInput,
  SubmitReceiptResult,
  PaymentMethod,
} from "@/types/cassa";
import type { PaymentType, SaleDocumentRequest } from "@/lib/ade/public-types";

// Rate limit: 30 receipts per hour per user (per-user key, not per-IP)
const receiptLimiter = new RateLimiter({
  maxRequests: 30,
  windowMs: 60 * 60 * 1000,
});

const PAYMENT_METHOD_TO_ADE: Record<PaymentMethod, PaymentType> = {
  PC: "CASH",
  PE: "ELECTRONIC",
};

export async function emitReceipt(
  input: SubmitReceiptInput,
): Promise<SubmitReceiptResult> {
  const user = await getAuthenticatedUser();

  const rateLimitResult = receiptLimiter.check(`emit:${user.id}`);
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "Receipt emit rate limit exceeded");
    return { error: "Troppi scontrini emessi. Riprova tra qualche minuto." };
  }

  if (!input.businessId) {
    return { error: "Business ID mancante." };
  }
  if (input.lines.length === 0) {
    return { error: "Lo scontrino deve contenere almeno un articolo." };
  }

  // Lottery code: only valid with electronic payment, must be 8 char [A-Z0-9]
  const rawLotteryCode = input.lotteryCode ?? null;
  const lotteryCode =
    rawLotteryCode && input.paymentMethod === "PE" ? rawLotteryCode : null;
  if (
    rawLotteryCode &&
    input.paymentMethod === "PE" &&
    !isValidLotteryCode(rawLotteryCode)
  ) {
    return {
      error: "Codice lotteria non valido. Deve essere di 8 caratteri [A-Z0-9].",
    };
  }

  const ownershipError = await checkBusinessOwnership(
    user.id,
    input.businessId,
  );
  if (ownershipError) return ownershipError;

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
      .where(eq(commercialDocuments.idempotencyKey, input.idempotencyKey))
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

  try {
    await adeClient.login({ codiceFiscale, password, pin });
    const payload = mapSaleToAdePayload(saleDocRequest, cedentePrestatore);
    const adeResponse = await adeClient.submitSale(payload);
    await adeClient.logout();

    // AdE can return HTTP 200 with esito:false when it rejects the document.
    if (!adeResponse.esito) {
      const errorDesc =
        adeResponse.errori
          ?.map((e) => `${e.codice}: ${e.descrizione}`)
          .join("; ") || "Errore sconosciuto";
      logger.error({ adeResponse, documentId }, "AdE rejected sale");
      await db
        .update(commercialDocuments)
        .set({
          status: "REJECTED",
          adeResponse: adeResponse as unknown as Record<string, unknown>,
        })
        .where(eq(commercialDocuments.id, documentId));
      return { error: `Scontrino rifiutato dall'AdE: ${errorDesc}` };
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
      "emitReceipt failed",
    );

    await db
      .update(commercialDocuments)
      .set({ status: "ERROR" })
      .where(eq(commercialDocuments.id, documentId));

    return {
      error: "Errore durante l'emissione dello scontrino. Riprova più tardi.",
    };
  }
}
