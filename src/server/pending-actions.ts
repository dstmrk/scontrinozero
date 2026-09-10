"use server";

import { logger } from "@/lib/logger";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import {
  getAuthenticatedUser,
  checkBusinessOwnership,
} from "@/lib/server-auth";
import { authErrorResult } from "@/lib/auth-errors";
import {
  confirmPendingSaleCandidate,
  verifyPendingSale,
  type VerifyPendingSaleResult,
} from "@/lib/services/pending-verification";
import { isValidUuid } from "@/lib/uuid";

/**
 * Server action della verifica manuale di uno scontrino rimasto `PENDING`
 * (REVIEW.md #103, slice 2).
 *
 * Il servizio sotto non conosce né sessione né ownership: qui si autentica
 * l'utente, si verifica che il business sia suo e si limita la frequenza —
 * ogni verifica costa un login AdE più una `searchDocuments` (2-5s).
 */

/**
 * 20 verifiche/ora per utente. Molto sotto il tetto delle emissioni (120)
 * perché una verifica è un'operazione eccezionale: un esercente con più di
 * venti scontrini orfani in un'ora ha un problema che non si risolve
 * cliccando. La soglia è una guardia anti-loop, non throttling di business.
 */
const verifyLimiter = new RateLimiter({
  maxRequests: 20,
  windowMs: RATE_LIMIT_WINDOWS.HOURLY,
});

const RATE_LIMITED: VerifyPendingSaleResult = {
  error: "Troppe verifiche ravvicinate. Riprova tra qualche minuto.",
};
const INVALID_INPUT: VerifyPendingSaleResult = {
  error: "Richiesta non valida.",
};

/**
 * Guardie comuni alle due action: sessione, ownership, rate limit, formato
 * degli id. Ritorna il businessId da usare, o l'esito già deciso.
 */
async function authorize(
  businessId: string,
  documentId: string,
): Promise<{ userId: string } | { done: VerifyPendingSaleResult }> {
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    // Sessione scaduta con la pagina aperta → `{ error }` inline invece del
    // boundary di Next (regola 19) e fuori da Sentry (regola 20).
    return { done: authErrorResult(err, "verifyPendingDocument") };
  }

  // regola 9: formato prima del service, così un id malformato non arriva mai
  // a una query.
  if (!isValidUuid(businessId) || !isValidUuid(documentId)) {
    return { done: INVALID_INPUT };
  }

  const rate = verifyLimiter.check(`verifyPending:${user.id}`);
  if (!rate.success) {
    logger.warn({ userId: user.id }, "Verifica PENDING: rate limit superato");
    return { done: RATE_LIMITED };
  }

  const ownership = await checkBusinessOwnership(user.id, businessId);
  if (ownership) return { done: { error: ownership.error } };

  return { userId: user.id };
}

/** Verifica su AdE una vendita in sospeso. */
export async function verifyPendingDocument(
  businessId: string,
  documentId: string,
): Promise<VerifyPendingSaleResult> {
  const authorized = await authorize(businessId, documentId);
  if ("done" in authorized) return authorized.done;

  return verifyPendingSale({ businessId, documentId });
}

/** Finalizza sul documento AdE che l'esercente ha riconosciuto. */
export async function confirmPendingDocument(
  businessId: string,
  documentId: string,
  idtrx: string,
): Promise<VerifyPendingSaleResult> {
  const authorized = await authorize(businessId, documentId);
  if ("done" in authorized) return authorized.done;

  // `idtrx` non è un UUID: è un identificativo opaco del portale. Il controllo
  // che conta è che sia fra i candidati, e lo fa il service ri-cercando su AdE.
  if (typeof idtrx !== "string" || idtrx.length === 0 || idtrx.length > 128) {
    return INVALID_INPUT;
  }

  return confirmPendingSaleCandidate({ businessId, documentId, idtrx });
}
