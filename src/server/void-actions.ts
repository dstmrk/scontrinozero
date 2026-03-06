"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocuments } from "@/db/schema";
import { createAdeClient } from "@/lib/ade";
import { mapVoidToAdePayload } from "@/lib/ade/mapper";
import { logger } from "@/lib/logger";
import { RateLimiter } from "@/lib/rate-limit";
import {
  checkBusinessOwnership,
  getAuthenticatedUser,
  fetchAdePrerequisites,
} from "@/lib/server-auth";
import type { VoidReceiptInput, VoidReceiptResult } from "@/types/storico";
import type { VoidRequest } from "@/lib/ade/public-types";

// Rate limit: 10 voids per hour per user (voiding should be rare and deliberate)
const voidLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
});

// ---------------------------------------------------------------------------
// voidReceipt
// ---------------------------------------------------------------------------

/**
 * Annulla uno scontrino precedentemente emesso.
 *
 * Flusso:
 *   1. Auth + verifica ownership
 *   2. Fetch documento SALE (verifica stato annullabile)
 *   3. Fetch e decripta credenziali AdE
 *   4. Insert documento VOID (idempotente)
 *   5. AdE: login → getFiscalData → getDocument → mapVoidToAdePayload → submitVoid → logout
 *   6. Update VOID doc: VOID_ACCEPTED
 *   7. Update SALE doc originale: VOID_ACCEPTED (segna come annullato)
 */
export async function voidReceipt(
  input: VoidReceiptInput,
): Promise<VoidReceiptResult> {
  const user = await getAuthenticatedUser();

  const rateLimitResult = voidLimiter.check(`void:${user.id}`);
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "Receipt void rate limit exceeded");
    return { error: "Troppi annulli effettuati. Riprova tra qualche minuto." };
  }

  const ownershipError = await checkBusinessOwnership(
    user.id,
    input.businessId,
  );
  if (ownershipError) return ownershipError;

  const db = getDb();

  // 1. Fetch the SALE document to void (businessId filter prevents IDOR)
  const [saleDoc] = await db
    .select()
    .from(commercialDocuments)
    .where(
      and(
        eq(commercialDocuments.id, input.documentId),
        eq(commercialDocuments.businessId, input.businessId),
      ),
    )
    .limit(1);

  if (!saleDoc) {
    return { error: "Scontrino non trovato." };
  }
  if (saleDoc.kind !== "SALE") {
    return { error: "Solo i documenti di vendita possono essere annullati." };
  }
  if (saleDoc.status !== "ACCEPTED") {
    return {
      error:
        "Il documento non è in uno stato annullabile (già annullato o in errore).",
    };
  }
  if (!saleDoc.adeTransactionId || !saleDoc.adeProgressive) {
    return { error: "Dati AdE mancanti per l'annullo." };
  }

  // 2. Fetch and decrypt AdE credentials + local business data
  const prerequisites = await fetchAdePrerequisites(input.businessId);
  if ("error" in prerequisites) return prerequisites;
  const { codiceFiscale, password, pin, cedentePrestatore } = prerequisites;

  // 3. Insert VOID document (idempotent via unique idempotencyKey)
  const [voidDoc] = await db
    .insert(commercialDocuments)
    .values({
      businessId: input.businessId,
      kind: "VOID",
      idempotencyKey: input.idempotencyKey,
      status: "PENDING",
    })
    .onConflictDoNothing()
    .returning({ id: commercialDocuments.id });

  // Idempotency: a VOID document with this key already exists
  if (!voidDoc) {
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

    if (existing?.status === "VOID_ACCEPTED") {
      // Already voided successfully — true idempotency return
      return {
        voidDocumentId: existing.id,
        adeTransactionId: existing.adeTransactionId ?? undefined,
        adeProgressive: existing.adeProgressive ?? undefined,
      };
    }
    // PENDING or ERROR: void was started but never completed
    return {
      error:
        "Annullo precedente in stato inconsistente. Riprova aprendo di nuovo il dialogo.",
    };
  }

  const voidDocumentId = voidDoc.id;
  const adeMode = (process.env.ADE_MODE as "mock" | "real") || "mock";
  const adeClient = createAdeClient(adeMode);

  try {
    await adeClient.login({ codiceFiscale, password, pin });

    // Fetch original document from AdE to get real idElementoContabile values
    const originalAdeDoc = await adeClient.getDocument(
      saleDoc.adeTransactionId,
    );

    const voidReq: VoidRequest = {
      idempotencyKey: input.idempotencyKey,
      originalDocument: {
        transactionId: saleDoc.adeTransactionId,
        documentProgressive: saleDoc.adeProgressive,
        date: saleDoc.createdAt.toISOString().split("T")[0],
      },
    };

    const payload = mapVoidToAdePayload(
      voidReq,
      cedentePrestatore,
      originalAdeDoc,
    );
    const adeResponse = await adeClient.submitVoid(payload);
    await adeClient.logout();

    // AdE can return HTTP 200 with esito:false when it rejects the void.
    if (!adeResponse.esito) {
      const errorDesc =
        adeResponse.errori
          ?.map((e) => `${e.codice}: ${e.descrizione}`)
          .join("; ") || "Errore sconosciuto";
      logger.error(
        { adeResponse, voidDocumentId, saleDocumentId: input.documentId },
        "AdE rejected void",
      );
      await db
        .update(commercialDocuments)
        .set({
          status: "REJECTED",
          adeResponse: adeResponse as unknown as Record<string, unknown>,
        })
        .where(eq(commercialDocuments.id, voidDocumentId));
      return { error: `Annullo rifiutato dall'AdE: ${errorDesc}` };
    }

    // 4. Update VOID document
    await db
      .update(commercialDocuments)
      .set({
        status: "VOID_ACCEPTED",
        adeTransactionId: adeResponse.idtrx ?? null,
        adeProgressive: adeResponse.progressivo ?? null,
        adeResponse: adeResponse as unknown as Record<string, unknown>,
      })
      .where(eq(commercialDocuments.id, voidDocumentId));

    // 5. Mark original SALE as VOID_ACCEPTED
    await db
      .update(commercialDocuments)
      .set({ status: "VOID_ACCEPTED" })
      .where(eq(commercialDocuments.id, input.documentId));

    logger.info(
      {
        voidDocumentId,
        saleDocumentId: input.documentId,
        businessId: input.businessId,
        adeTransactionId: adeResponse.idtrx,
      },
      "Receipt voided successfully",
    );

    return {
      voidDocumentId,
      adeTransactionId: adeResponse.idtrx ?? undefined,
      adeProgressive: adeResponse.progressivo ?? undefined,
    };
  } catch (err) {
    logger.error(
      { err, voidDocumentId, saleDocumentId: input.documentId },
      "voidReceipt failed",
    );

    await db
      .update(commercialDocuments)
      .set({ status: "ERROR" })
      .where(eq(commercialDocuments.id, voidDocumentId));

    return {
      error: "Errore durante l'annullo dello scontrino. Riprova più tardi.",
    };
  }
}
