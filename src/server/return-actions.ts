"use server";

import { z } from "zod/v4";
import { logger } from "@/lib/logger";
import { getPlanSafe, canEmit, TRIAL_EXPIRED_MESSAGE } from "@/lib/plans";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import {
  checkBusinessOwnership,
  getAuthenticatedUser,
} from "@/lib/server-auth";
import { authErrorResult } from "@/lib/auth-errors";
import { SALE_LINES_MAX } from "@/lib/receipts/receipt-schema";
import { returnReceiptForBusiness } from "@/lib/services/return-service";
import type { ReturnReceiptInput, ReturnReceiptResult } from "@/types/storico";

// 20 resi/ora per utente: irreversibili come l'annullo, ma in un negozio di
// abbigliamento più frequenti (un reso per pezzo, più clienti al giorno).
// Stessa soglia di `api:void`: la guardia è anti-loop, non di business.
const returnLimiter = new RateLimiter({
  maxRequests: 20,
  windowMs: RATE_LIMIT_WINDOWS.HOURLY,
});

// UUID verso colonne Postgres uuid (regola 9) e forma delle quantità. Il
// residuo per riga e i due decimali li valida il servizio sul dettaglio AdE
// (`validateReturnQuantities`): è l'unico che conosce il già-reso vero.
const returnReceiptSchema = z.object({
  businessId: z.string().uuid("Business ID non valido."),
  documentId: z.string().uuid("Documento non valido."),
  idempotencyKey: z.string().uuid("Chiave di idempotenza non valida."),
  quantities: z
    .array(z.number().finite().nonnegative().max(9999))
    .min(1, "Indica almeno una riga da rendere.")
    .max(SALE_LINES_MAX),
});

/**
 * Reso merce dalla cassa: tutti i piani, con lo stesso gate dell'emissione
 * (piano attivo o prova in corso). Il reso è un obbligo fiscale
 * dell'esercente, non una feature Pro.
 */
export async function returnReceipt(
  input: ReturnReceiptInput,
): Promise<ReturnReceiptResult> {
  // Sessione scaduta con lo storico aperto → { error } inline (regole 19/20).
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, "returnReceipt");
  }

  const rateLimitResult = returnLimiter.check(`return:${user.id}`);
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "Receipt return rate limit exceeded");
    return { error: "Troppi resi effettuati. Riprova tra qualche minuto." };
  }

  const planResult = await getPlanSafe(user.id, "returnReceipt");
  if (!planResult.ok) return { error: planResult.error };
  const planInfo = planResult.info;
  if (
    !canEmit(planInfo.plan, planInfo.trialStartedAt, planInfo.planExpiresAt)
  ) {
    return { error: TRIAL_EXPIRED_MESSAGE };
  }

  const validation = returnReceiptSchema.safeParse(input);
  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Input non valido.",
    };
  }

  const ownershipError = await checkBusinessOwnership(
    user.id,
    input.businessId,
  );
  if (ownershipError) return ownershipError;

  return returnReceiptForBusiness(input);
}
