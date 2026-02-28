"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adeCredentials, commercialDocuments } from "@/db/schema";
import { decrypt, getEncryptionKey } from "@/lib/crypto";
import { createAdeClient } from "@/lib/ade";
import { mapVoidToAdePayload } from "@/lib/ade/mapper";
import { logger } from "@/lib/logger";
import {
  checkBusinessOwnership,
  getAuthenticatedUser,
} from "@/lib/server-auth";
import type { VoidReceiptInput, VoidReceiptResult } from "@/types/storico";
import type { VoidRequest } from "@/lib/ade/public-types";

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

  // 2. Fetch AdE credentials
  const [cred] = await db
    .select()
    .from(adeCredentials)
    .where(eq(adeCredentials.businessId, input.businessId))
    .limit(1);

  if (!cred) {
    return {
      error: "Credenziali AdE non trovate. Completa la configurazione.",
    };
  }
  if (!cred.verifiedAt) {
    return {
      error:
        "Credenziali AdE non verificate. Verifica le credenziali nelle impostazioni.",
    };
  }

  // 3. Decrypt credentials
  const key = getEncryptionKey();
  const keys = new Map<number, Buffer>([[cred.keyVersion, key]]);
  const codiceFiscale = decrypt(cred.encryptedCodiceFiscale, keys);
  const password = decrypt(cred.encryptedPassword, keys);
  const pin = decrypt(cred.encryptedPin, keys);

  // 4. Insert VOID document (idempotent via unique idempotencyKey)
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
    const cedentePrestatore = await adeClient.getFiscalData();

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

    // 6. Update VOID document
    await db
      .update(commercialDocuments)
      .set({
        status: "VOID_ACCEPTED",
        adeTransactionId: adeResponse.idtrx ?? null,
        adeProgressive: adeResponse.progressivo ?? null,
        adeResponse: adeResponse as unknown as Record<string, unknown>,
      })
      .where(eq(commercialDocuments.id, voidDocumentId));

    // 7. Mark original SALE as VOID_ACCEPTED
    await db
      .update(commercialDocuments)
      .set({ status: "VOID_ACCEPTED" })
      .where(eq(commercialDocuments.id, input.documentId));

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
