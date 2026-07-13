import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles, subscriptions } from "@/db/schema";
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

export type PurgeUserResult = {
  /** true se l'auth user è stato rimosso (dopo eventuali retry). */
  authDeleted: boolean;
  /** true se la riga `profiles` (e la sua cascata FK) è stata rimossa. */
  profileDeleted: boolean;
};

/**
 * Cancella in modo permanente un auth user e tutta la cascata dati collegata,
 * dato il suo `authUserId`.
 *
 * Cascata (via FK in 0000_initial.sql):
 *   profiles → businesses → ade_credentials
 *                         → commercial_documents → commercial_document_lines
 *                         → catalog_items
 *
 * La riga `subscriptions` NON è nella cascata (nessuna FK verso auth.users né
 * verso profiles), quindi va cancellata esplicitamente qui: senza questa DELETE
 * resterebbe orfana e i webhook Stripe continuerebbero a sincronizzarla con un
 * UPDATE su 0 righe, in silenzio (REVIEW.md #63). L'annullamento della
 * subscription su Stripe è invece responsabilità del chiamante self-service
 * (deleteAccount): lo sweep GDPR agisce solo su account non paganti.
 *
 * Ordine auth-first: l'auth user è cancellato PRIMA della riga applicativa, con
 * retry + backoff. Se la delete auth fallisce dopo i retry, `profiles` resta
 * intatto e si ritorna `{ authDeleted: false }` — il chiamante può ripresentare
 * un errore all'utente o ritentare più tardi. Se la delete auth riesce ma la
 * delete di `profiles` fallisce, si logga un `error` critico (profilo orfano →
 * cleanup manuale) e si ritorna `{ authDeleted: true, profileDeleted: false }`:
 * il chiamante NON deve trattarlo come hard failure, perché l'utente non può
 * più autenticarsi comunque.
 *
 * Condiviso tra `deleteAccount` (self-service, src/server/account-actions.ts) e
 * lo sweep GDPR di cancellazione inattivi (src/lib/services/inactive-user-prune.ts).
 * Non emette email né gestisce sessione/redirect: quelle sono responsabilità
 * del chiamante, che differisce per contesto.
 */
export async function purgeUserById(
  authUserId: string,
): Promise<PurgeUserResult> {
  // 1. Delete auth user via admin API (service role). Retry con backoff.
  const adminClient = createAdminSupabaseClient();
  let deleteAuthError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_AUTH_DELETE_ATTEMPTS; attempt++) {
    const { error } = await adminClient.auth.admin.deleteUser(authUserId);
    if (!error) {
      deleteAuthError = null;
      break;
    }
    if (isUserNotFoundError(error)) {
      // Auth user già assente (es. profilo orfano di un run precedente in cui
      // la delete di `profiles` era fallita): l'obiettivo — nessun auth user —
      // è già raggiunto, quindi delete idempotente. Senza questo ramo lo sweep
      // GDPR ritenterebbe per sempre (3 retry/giorno, error critical in Sentry)
      // e la riga `profiles` (dati personali) non verrebbe MAI rimossa.
      // Condizione attesa, non bug nostro → warn (regola 20), non error.
      logger.warn(
        { userId: authUserId },
        "purgeUserById: auth user già assente — delete idempotente, procedo col profilo",
      );
      deleteAuthError = null;
      break;
    }
    deleteAuthError = error;
    if (attempt < MAX_AUTH_DELETE_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  if (deleteAuthError) {
    logger.error(
      { userId: authUserId, err: deleteAuthError, critical: true },
      "purgeUserById: auth user deletion failed after retries — account not deleted",
    );
    return { authDeleted: false, profileDeleted: false };
  }

  // 2. Delete subscription (leaf, nessuna cascata) + profile (FK cascade rimuove
  //    tutto il collegato). L'auth entry è già andata: un fallimento qui lascia
  //    dati orfani da pulire a mano. La subscription è cancellata PRIMA così che
  //    `profileDeleted` rifletta esattamente l'esito della delete del profilo.
  const db = getDb();
  try {
    await db.delete(subscriptions).where(eq(subscriptions.userId, authUserId));

    const deleted = await db
      .delete(profiles)
      .where(eq(profiles.authUserId, authUserId))
      .returning({ id: profiles.id });

    if (deleted.length === 0) {
      logger.error(
        { userId: authUserId },
        "purgeUserById: auth user deleted but profile not found",
      );
      return { authDeleted: true, profileDeleted: false };
    }
    return { authDeleted: true, profileDeleted: true };
  } catch (err) {
    logger.error(
      { userId: authUserId, err, critical: true },
      "purgeUserById: profile deletion failed after auth user removed — manual cleanup required",
    );
    return { authDeleted: true, profileDeleted: false };
  }
}
