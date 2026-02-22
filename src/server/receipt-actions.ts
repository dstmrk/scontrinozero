"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  adeCredentials,
  commercialDocuments,
  commercialDocumentLines,
} from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { createAdeClient } from "@/lib/ade";
import { mapSaleToAdePayload } from "@/lib/ade/mapper";
import { logger } from "@/lib/logger";
import {
  getAuthenticatedUser,
  checkBusinessOwnership,
} from "@/lib/server-auth";
import type { SubmitReceiptInput, SubmitReceiptResult } from "@/types/cassa";
import type { PaymentType, SaleDocumentRequest } from "@/lib/ade/public-types";
import type { PaymentMethod } from "@/types/cassa";

const PAYMENT_METHOD_TO_ADE: Record<PaymentMethod, PaymentType> = {
  PC: "CASH",
  PE: "ELECTRONIC",
};

function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (hex?.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string");
  }
  return Buffer.from(hex, "hex");
}

export async function emitReceipt(
  input: SubmitReceiptInput,
): Promise<SubmitReceiptResult> {
  const user = await getAuthenticatedUser();

  if (!input.businessId) {
    return { error: "Business ID mancante." };
  }
  if (input.lines.length === 0) {
    return { error: "Lo scontrino deve contenere almeno un articolo." };
  }

  const ownershipError = await checkBusinessOwnership(
    user.id,
    input.businessId,
  );
  if (ownershipError) return ownershipError;

  const db = getDb();

  // Fetch and validate credentials
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

  // Decrypt credentials
  const key = getEncryptionKey();
  const keys = new Map<number, Buffer>([[cred.keyVersion, key]]);
  const codiceFiscale = decrypt(cred.encryptedCodiceFiscale, keys);
  const password = decrypt(cred.encryptedPassword, keys);
  const pin = decrypt(cred.encryptedPin, keys);

  // Insert commercial document (idempotent via unique idempotencyKey)
  const [document] = await db
    .insert(commercialDocuments)
    .values({
      businessId: input.businessId,
      kind: "SALE",
      idempotencyKey: input.idempotencyKey,
      status: "PENDING",
    })
    .onConflictDoNothing()
    .returning({ id: commercialDocuments.id });

  // Idempotency: document already exists for this key — return success
  if (!document) {
    return {};
  }

  const documentId = document.id;

  // Insert all document lines
  await db.insert(commercialDocumentLines).values(
    input.lines.map((line, index) => ({
      documentId,
      lineIndex: index,
      description: line.description,
      quantity: String(line.quantity),
      grossUnitPrice: String(line.grossUnitPrice),
      vatCode: line.vatCode,
    })),
  );

  // Build sale document request
  const totalAmount = input.lines.reduce(
    (sum, line) => sum + line.grossUnitPrice * line.quantity,
    0,
  );
  const saleDocRequest: SaleDocumentRequest = {
    date: new Date().toISOString().split("T")[0],
    customerTaxCode: null,
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
    const cedentePrestatore = await adeClient.getFiscalData();
    const payload = mapSaleToAdePayload(saleDocRequest, cedentePrestatore);
    const adeResponse = await adeClient.submitSale(payload);
    await adeClient.logout();

    await db
      .update(commercialDocuments)
      .set({
        status: "ACCEPTED",
        adeTransactionId: adeResponse.idtrx ?? null,
        adeProgressive: adeResponse.progressivo ?? null,
        adeResponse: adeResponse as unknown as Record<string, unknown>,
      })
      .where(eq(commercialDocuments.id, documentId));

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
