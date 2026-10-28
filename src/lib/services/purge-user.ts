import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { apiKeys, businesses, profiles, subscriptions } from "@/db/schema";
import { adeInteractiveSessionStore } from "@/lib/ade/interactive-session-store";
import { adeSessionCache } from "@/lib/ade/session-cache";
import { logger } from "@/lib/logger";
import { deleteAuthUser } from "@/lib/services/auth-user-delete";
import {
  listCollaboratorAccounts,
  notifyCollaboratorsAccessEnded,
  type CollaboratorAccount,
} from "@/lib/services/collaborator-account";

/** Chiude le due sessioni AdE in memoria di un business. Mai propaga. */
async function evictAdeSessions(
  authUserId: string,
  businessId: string,
): Promise<void> {
  try {
    await adeSessionCache.invalidate(businessId);
    await adeInteractiveSessionStore.invalidate(businessId);
  } catch (err) {
    logger.warn(
      { userId: authUserId, err },
      "purgeUserById: chiusura delle sessioni AdE fallita — scadranno da sole",
    );
  }
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
 * Più `api_keys` (0004), `referral_redemptions` e `partners` (0047). Una FK
 * verso `profiles` senza cascata fa fallire la DELETE del profilo dopo quella
 * dell'auth user: il gate è `src/db/schema/profile-foreign-keys.test.ts`.
 *
 * La riga `subscriptions` NON è nella cascata (nessuna FK verso auth.users né
 * verso profiles), quindi va cancellata esplicitamente qui: senza questa DELETE
 * resterebbe orfana e i webhook Stripe continuerebbero a sincronizzarla con un
 * UPDATE su 0 righe, in silenzio (PR #731). L'annullamento della
 * subscription su Stripe è invece responsabilità del chiamante self-service
 * (deleteAccount): lo sweep GDPR agisce solo su account non paganti.
 *
 * Ordine: prima si revocano le chiavi API (nessun dato cancellato se fallisce),
 * poi auth-first: l'auth user è cancellato PRIMA della riga applicativa, con
 * retry + backoff. Se la delete auth fallisce dopo i retry, `profiles` resta
 * intatto e si ritorna `{ authDeleted: false }` — il chiamante può ripresentare
 * un errore all'utente o ritentare più tardi. Se la delete auth riesce ma la
 * delete di `profiles` fallisce, si logga un `error` critico (profilo orfano →
 * cleanup manuale) e si ritorna `{ authDeleted: true, profileDeleted: false }`:
 * il chiamante NON deve trattarlo come hard failure, perché l'utente non può
 * più autenticarsi comunque.
 *
 * Collaboratori (issue #1099): non hanno un profilo, quindi la cascata porta
 * via le loro righe di `business_members` ma non i loro account auth. Si
 * cancellano qui, prima del titolare: se uno non si cancella ci si ferma con
 * il titolare intatto, perché un login valido senza attività è peggio di una
 * cancellazione da ritentare (il ritentativo li trova già assenti). A
 * titolare cancellato ricevono l'email "owner-deleted".
 *
 * Solo per chi ha un profilo: un collaboratore che lascia l'attività passa da
 * `removeCollaboratorAccount` (`collaborator-account.ts`).
 *
 * Condiviso tra `deleteAccount` (self-service, src/server/account-actions.ts) e
 * lo sweep GDPR di cancellazione inattivi (src/lib/services/inactive-user-prune.ts).
 * L'email al titolare, la sessione e il redirect restano del chiamante, che
 * differisce per contesto; quella ai collaboratori è la stessa nei due
 * contesti e parte da qui.
 */
export async function purgeUserById(
  authUserId: string,
): Promise<PurgeUserResult> {
  const db = getDb();

  // 0. Revoca le chiavi API dell'utente PRIMA di qualunque passo distruttivo.
  //    L'autenticazione API legge solo `api_keys` + `profiles`, mai
  //    `auth.users`: se la delete del profilo fallisse DOPO quella dell'auth
  //    user (caso previsto, vedi sotto), le chiavi di un piano a pagamento o
  //    developer resterebbero valide fino al retry dello sweep. Revocate per
  //    prime, quella finestra non esiste. Se la revoca stessa fallisce non è
  //    stato cancellato nulla: si ritorna come per un fallimento dell'auth
  //    delete, e il chiamante può ritentare con tutto intatto. Un profilo già
  //    assente (retry di un purge parziale) non ha chiavi da revocare.
  let businessId: string | undefined;
  try {
    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.authUserId, authUserId))
      .limit(1);
    if (profile) {
      await db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(apiKeys.profileId, profile.id), isNull(apiKeys.revokedAt)),
        );
      // L'id del business si legge ORA: la cascata della delete del profilo lo
      // porta via, e le cache AdE sono chiavi per businessId.
      const [business] = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.profileId, profile.id))
        .limit(1);
      businessId = business?.id;
    }
  } catch (err) {
    logger.error(
      { userId: authUserId, err, critical: true },
      "purgeUserById: revoca delle chiavi API fallita — nessun dato cancellato, da ritentare",
    );
    return { authDeleted: false, profileDeleted: false };
  }

  // 0b. Gli account dei collaboratori, prima di quello del titolare.
  let collaborators: CollaboratorAccount[] = [];
  try {
    if (businessId) collaborators = await listCollaboratorAccounts(businessId);
  } catch (err) {
    logger.error(
      { userId: authUserId, err, critical: true },
      "purgeUserById: lettura dei collaboratori fallita — nessun dato cancellato, da ritentare",
    );
    return { authDeleted: false, profileDeleted: false };
  }
  const deleted = await Promise.all(
    collaborators.map((collaborator) =>
      deleteAuthUser(collaborator.authUserId),
    ),
  );
  if (deleted.includes(false)) {
    logger.error(
      { userId: authUserId, critical: true },
      "purgeUserById: account di un collaboratore non cancellato — titolare intatto, da ritentare",
    );
    return { authDeleted: false, profileDeleted: false };
  }

  // 1. Delete auth user via admin API (service role), con retry. Un utente
  //    già assente (profilo orfano di un run precedente in cui la delete di
  //    `profiles` era fallita) conta come cancellato: senza, lo sweep GDPR
  //    ritenterebbe per sempre e la riga `profiles` non sparirebbe mai.
  if (!(await deleteAuthUser(authUserId))) {
    return { authDeleted: false, profileDeleted: false };
  }
  notifyCollaboratorsAccessEnded(collaborators, "owner-deleted");

  // 1b. L'auth user non esiste più: si chiudono le sessioni AdE in memoria del
  //     suo business (Fisconline 10 minuti, CIE/SPID 6 ore), con il logout sul
  //     portale. Nessun lettore le raggiungerebbe — ogni consumatore rilegge
  //     prima la riga credenziali, che sta per sparire — ma resterebbero in
  //     memoria e aperte sul portale fino al TTL. Best-effort e prima della
  //     delete del profilo, così vale anche se quella fallisce.
  if (businessId) await evictAdeSessions(authUserId, businessId);

  // 2. Delete subscription (leaf, nessuna cascata) + profile (FK cascade rimuove
  //    tutto il collegato). L'auth entry è già andata: un fallimento qui lascia
  //    dati orfani da pulire a mano. La subscription è cancellata PRIMA così che
  //    `profileDeleted` rifletta esattamente l'esito della delete del profilo.
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
