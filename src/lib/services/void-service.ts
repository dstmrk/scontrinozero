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
import { logger } from "@/lib/logger";
import { fetchAdePrerequisites } from "@/lib/server-auth";
import type { VoidReceiptInput, VoidReceiptResult } from "@/types/storico";
import type { VoidRequest } from "@/lib/ade/public-types";

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
export async function voidReceiptForBusiness(
  input: VoidReceiptInput,
  apiKeyId?: string | null,
): Promise<VoidReceiptResult> {
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
      apiKeyId: apiKeyId ?? null,
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
        apiKeyId: apiKeyId ?? undefined,
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
      "voidReceiptForBusiness failed",
    );

    await db
      .update(commercialDocuments)
      .set({ status: "ERROR" })
      .where(eq(commercialDocuments.id, voidDocumentId));

    return {
      error: "Errore durante l'annullo dello scontrino. Riprova più tardi.",
    };
  } finally {
    await adeClient
      .logout()
      .catch((err) => logger.warn({ err }, "AdE logout failed"));
  }
}
