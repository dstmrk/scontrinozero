import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/** Numero massimo di tentativi per la delete dell'auth user (admin API). */
const MAX_AUTH_DELETE_ATTEMPTS = 3;

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

  // 2. Delete profile — FK cascade rimuove tutto il collegato. L'auth entry è
  //    già andata: un fallimento qui lascia un profilo orfano da pulire a mano.
  const db = getDb();
  try {
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
