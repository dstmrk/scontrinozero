import { logger } from "@/lib/logger";

/**
 * Errore atteso lanciato da `getAuthenticatedUser` quando la sessione manca.
 * Distinto da un errore generico (DB/Supabase down, SDK auth che throwa in modo
 * inatteso) così che i caller possano degradare correttamente: sessione assente
 * → "Non autenticato."; qualunque altro errore → 503-like + log (regola 19/20).
 *
 * Il message resta `"Not authenticated"` per retrocompatibilità con i caller e i
 * test che lo asseriscono.
 */
export class UnauthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthenticatedError";
  }
}

/**
 * Classifica un fallimento di `getAuthenticatedUser` in un envelope UI.
 *
 * - Sessione assente (`UnauthenticatedError`) → `{ error: "Non autenticato." }`,
 *   **senza log**: è una condizione attesa e `getAuthenticatedUser` logga già
 *   `warn` sul session-invalid (no doppio log, regola 20).
 * - Qualunque altro errore → degrada con messaggio 503-like e logga `error`
 *   (regola 19: degradare, non lanciare; regola 20: l'inatteso sale a Sentry via
 *   il hook `level >= 50` del logger).
 *
 * Ritorna `{ error: string }`, compatibile con `CatalogActionResult`,
 * `ExportUserDataResult` e gli altri envelope `{ error }` delle server action.
 */
export function authErrorResult(
  err: unknown,
  action: string,
): { error: string } {
  if (err instanceof UnauthenticatedError) {
    return { error: "Non autenticato." };
  }
  logger.error({ err, action }, "authentication check failed unexpectedly");
  return { error: "Servizio temporaneamente non disponibile. Riprova." };
}
