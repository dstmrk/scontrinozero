"use server";

import { and, asc, desc, eq, gte, ilike, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import {
  adeCredentials,
  commercialDocumentLines,
  commercialDocuments,
} from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { createAdeClient } from "@/lib/ade";
import { mapVoidToAdePayload } from "@/lib/ade/mapper";
import { logger } from "@/lib/logger";
import {
  checkBusinessOwnership,
  getAuthenticatedUser,
} from "@/lib/server-auth";
import type {
  ReceiptListItem,
  SearchReceiptsParams,
  VoidReceiptInput,
  VoidReceiptResult,
} from "@/types/storico";
import type { VoidRequest } from "@/lib/ade/public-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (hex?.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string");
  }
  return Buffer.from(hex, "hex");
}

// ---------------------------------------------------------------------------
// searchReceipts
// ---------------------------------------------------------------------------

/**
 * Restituisce la lista degli scontrini (SALE) del business, con filtri opzionali.
 *
 * Ordine: DESC createdAt (più recenti prima).
 * Source: DB locale (nessuna chiamata AdE).
 */
export async function searchReceipts(
  businessId: string,
  params: SearchReceiptsParams = {},
): Promise<ReceiptListItem[]> {
  const user = await getAuthenticatedUser();
  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) {
    throw new Error("Non autorizzato.");
  }

  const db = getDb();

  // Build conditions
  const conditions = [
    eq(commercialDocuments.businessId, businessId),
    // Show only SALE documents (VOID docs are internal bookkeeping)
    eq(commercialDocuments.kind, "SALE"),
  ];

  if (params.dateFrom) {
    conditions.push(
      gte(commercialDocuments.createdAt, new Date(params.dateFrom)),
    );
  }
  if (params.dateTo) {
    // Include the entire day by adding 1 day
    const dateTo = new Date(params.dateTo);
    dateTo.setDate(dateTo.getDate() + 1);
    conditions.push(lt(commercialDocuments.createdAt, dateTo));
  }
  if (params.progressivo) {
    conditions.push(
      ilike(commercialDocuments.adeProgressive, `%${params.progressivo}%`),
    );
  }

  const docs = await db
    .select()
    .from(commercialDocuments)
    .where(and(...conditions))
    .orderBy(desc(commercialDocuments.createdAt));

  if (docs.length === 0) return [];

  // Fetch all lines in a single query
  const docIds = docs.map((d) => d.id);
  const lines = await db
    .select()
    .from(commercialDocumentLines)
    .where(inArray(commercialDocumentLines.documentId, docIds))
    .orderBy(asc(commercialDocumentLines.lineIndex));

  // Group lines by documentId
  const linesByDocId = new Map<string, typeof lines>();
  for (const line of lines) {
    const existing = linesByDocId.get(line.documentId) ?? [];
    existing.push(line);
    linesByDocId.set(line.documentId, existing);
  }

  return docs.map((doc) => {
    const docLines = linesByDocId.get(doc.id) ?? [];
    const total = docLines.reduce(
      (sum, l) => sum + parseFloat(l.grossUnitPrice) * parseFloat(l.quantity),
      0,
    );

    return {
      id: doc.id,
      kind: doc.kind as "SALE" | "VOID",
      status: doc.status as ReceiptListItem["status"],
      adeProgressive: doc.adeProgressive,
      adeTransactionId: doc.adeTransactionId,
      createdAt: doc.createdAt,
      total: total.toFixed(2),
      lines: docLines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        grossUnitPrice: l.grossUnitPrice,
        vatCode: l.vatCode,
      })),
    };
  });
}

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

  // 1. Fetch the SALE document to void
  const [saleDoc] = await db
    .select()
    .from(commercialDocuments)
    .where(eq(commercialDocuments.id, input.documentId))
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

  // Idempotency: document already inserted for this key
  if (!voidDoc) {
    return {};
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
