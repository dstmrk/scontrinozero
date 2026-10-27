import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/** Numero massimo di tentativi per la delete dell'auth user (admin API). */
const MAX_AUTH_DELETE_ATTEMPTS = 3;

/**
 * True se l'errore della admin API indica che l'auth user NON esiste
 * (già cancellato). Check difensivo su entrambi i campi che Supabase può
 * esporre: HTTP `status` 404 e `code` "user_not_found".
 */
function isUserNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { status, code } = error as { status?: unknown; code?: unknown };
  return status === 404 || code === "user_not_found";
}

/**
 * Cancella un auth user via admin API, con retry e backoff. True se l'utente
 * non esiste più, cancellato ora o già assente; false dopo tre tentativi
 * falliti, con un `error` critico.
 *
 * Un utente già assente è un successo: succede a chi ritenta una
 * cancellazione interrotta dopo la delete auth. Senza questo ramo lo sweep
 * GDPR ritenterebbe per sempre e i dati personali non verrebbero mai rimossi.
 * Condizione attesa, quindi `warn` (regola 20).
 *
 * Condiviso dal purge del titolare (`purge-user.ts`) e dalla rimozione dei
 * collaboratori (`collaborator-account.ts`).
 */
export async function deleteAuthUser(authUserId: string): Promise<boolean> {
  const adminClient = createAdminSupabaseClient();
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_AUTH_DELETE_ATTEMPTS; attempt++) {
    const { error } = await adminClient.auth.admin.deleteUser(authUserId);
    if (!error) return true;
    if (isUserNotFoundError(error)) {
      logger.warn(
        { userId: authUserId },
        "deleteAuthUser: auth user già assente, delete idempotente",
      );
      return true;
    }
    lastError = error;
    if (attempt < MAX_AUTH_DELETE_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500)); // NOSONAR — backoff tra retry, sequenziale per design
    }
  }
  logger.error(
    { userId: authUserId, err: lastError, critical: true },
    "deleteAuthUser: auth user deletion failed after retries",
  );
  return false;
}
