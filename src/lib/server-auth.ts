import { cache } from "react";
import * as Sentry from "@sentry/nextjs";
import { and, eq, sql } from "drizzle-orm";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import {
  adeCredentials,
  businesses,
  businessMembers,
  type MemberRole,
} from "@/db/schema";
import { decrypt, getEncryptionKeys } from "@/lib/crypto";
import { buildCedenteFromBusiness } from "@/lib/ade/mapper";
import { UnauthenticatedError } from "@/lib/auth-errors";
import { logger } from "@/lib/logger";
import { notifyOwnerOfAdeRejection } from "@/lib/services/ade-rejection-notice";
import type { User } from "@supabase/supabase-js";
import type { AdeCedentePrestatore, InteractiveMethod } from "@/lib/ade/types";
import type { WithAdeSessionParams } from "@/lib/ade";
import type { LoginRejectionOutcome } from "@/lib/ade/verify-outcome";
import {
  CREDENTIALS_NOT_FOUND_MESSAGE,
  CREDENTIALS_NOT_VERIFIED_MESSAGE,
  PASSWORD_EXPIRED_MESSAGE,
} from "@/lib/ade/error-messages";
export type { User } from "@supabase/supabase-js";

export type BusinessAccessError = { error: string };

/**
 * L'appartenenza dell'utente all'attività richiesta (issue #1099). `memberId`
 * firma i documenti che emette (`commercial_documents.created_by`); `role`
 * decide cosa può vedere e fare.
 */
export type BusinessMembership = { memberId: string; role: MemberRole };

export type AdePrerequisites =
  | {
      method: "fisconline";
      codiceFiscale: string;
      password: string;
      pin: string;
      /**
       * Utenza di lavoro scelta al primo collegamento (migrazione 0037).
       * Assente = la P.IVA è intestata a chi accede, il caso storico.
       */
      utenzaPiva?: string;
      /**
       * `updated_at` della riga credenziali letta qui (issue #1099). Lega un
       * eventuale rifiuto dell'AdE a *queste* credenziali: se nel frattempo
       * vengono risalvate, il rifiuto non le tocca.
       */
      credentialVersion: Date;
      cedentePrestatore: AdeCedentePrestatore;
    }
  | {
      // CIE e SPID: nessuna credenziale ri-loggabile; la sessione è quella
      // interattiva depositata nello store (push CIE, o cookie SPID adottati
      // dall'app nativa). Emit/void non passano credenziali.
      method: InteractiveMethod;
      cedentePrestatore: AdeCedentePrestatore;
    };

/**
 * Prerequisiti AdE mancanti. `code` e `passwordExpired` ci sono solo per la
 * password Fisconline scaduta, con gli stessi valori che emissione, annullo e
 * reso restituiscono quando la scoprono al login.
 */
export type AdePrerequisitesError = {
  error: string;
  code?: "ADE_PASSWORD_EXPIRED";
  passwordExpired?: true;
};

/**
 * Mappa `AdePrerequisites` → `WithAdeSessionParams` (PR #752).
 *
 * Fisconline porta le credenziali ri-loggabili **e** l'utenza di lavoro scelta,
 * perché ogni sua sessione nasce da un login che il server rifà da solo. CIE no:
 * la sessione è quella interattiva depositata nello store dal login umano, che
 * la scelta l'ha già applicata sul client. Estratta qui — accanto al tipo
 * `AdePrerequisites` — per non far dipendere `lib/ade` dai tipi di server-auth
 * e per avere un solo punto da aggiornare al prossimo login method (es. SPID).
 * Prima era duplicata verbatim in receipt-service e void-service.
 */
export function toAdeSessionParams(
  businessId: string,
  prerequisites: AdePrerequisites,
): WithAdeSessionParams {
  if (prerequisites.method !== "fisconline") {
    return { businessId, method: prerequisites.method };
  }
  return {
    businessId,
    method: "fisconline",
    credentials: {
      codiceFiscale: prerequisites.codiceFiscale,
      password: prerequisites.password,
      pin: prerequisites.pin,
    },
    utenzaPiva: prerequisites.utenzaPiva,
    credentialVersion: prerequisites.credentialVersion,
    onLoginRejected: (outcome) =>
      markFisconlineCredentialsRejected(
        businessId,
        prerequisites.credentialVersion,
        outcome,
      ),
  };
}

/**
 * Ferma i login automatici di un business dopo che l'AdE ha rifiutato le sue
 * credenziali Fisconline (issue #1099): `verified_at = NULL`, così
 * `fetchAdePrerequisites` blocca emissione, annullo, reso e ricerca **prima**
 * del login, finché il titolare non risalva o riverifica dalle impostazioni.
 * Senza, ogni operazione rifaceva il login con la stessa password sbagliata, e
 * con più persone alla cassa l'utenza finiva bloccata dall'AdE.
 *
 * Scrittura in SQL raw per non far scattare `$onUpdate` su `updated_at`: è la
 * versione delle credenziali salvate per la pagina impostazioni e per il lock
 * ottimistico della verifica, e qui le credenziali non cambiano. Lo stesso
 * `updated_at` fa da guardia: credenziali risalvate dopo la lettura non
 * vengono invalidate. `verified_at IS NOT NULL` rende la scrittura idempotente
 * per le operazioni accodate che riportano lo stesso rifiuto.
 *
 * Registra l'esito su `last_verify_outcome` ma non incrementa
 * `verify_attempts`, che conta i tentativi fatti dall'esercente.
 *
 * Sulla stessa transizione avvisa il titolare per email, se l'attività ha
 * collaboratori (`notifyOwnerOfAdeRejection`). Senza attenderla: la risposta
 * a chi sta alla cassa non aspetta Resend.
 *
 * Non lancia: un errore qui sostituirebbe il rifiuto dell'AdE, che è
 * l'informazione utile per chi sta alla cassa.
 */
async function markFisconlineCredentialsRejected(
  businessId: string,
  credentialVersion: Date,
  outcome: LoginRejectionOutcome,
): Promise<void> {
  try {
    const db = getDb();
    const rows = (await db.execute(sql`
      UPDATE ade_credentials
         SET verified_at = NULL,
             last_verify_outcome = ${outcome},
             last_verify_at = now()
       WHERE business_id = ${businessId}::uuid
         AND login_method = 'fisconline'
         AND verified_at IS NOT NULL
         AND date_trunc('milliseconds', updated_at) = ${credentialVersion.toISOString()}::timestamptz
      RETURNING id
    `)) as unknown as { id: string }[];
    if (rows.length > 0) {
      logger.warn(
        { businessId, outcome, event: "ade_auto_login_stopped" },
        "AdE ha rifiutato le credenziali Fisconline: login automatici fermati fino a nuova verifica",
      );
      void notifyOwnerOfAdeRejection({
        businessId,
        outcome,
        credentialVersion,
      });
    }
  } catch (err) {
    logger.warn(
      {
        err,
        businessId,
        outcome,
        errorClass: "ade_credentials_rejected_write",
      },
      "markFisconlineCredentialsRejected: rifiuto non registrato",
    );
  }
}

/**
 * Returns the authenticated Supabase user or throws if not authenticated.
 *
 * Wrapped in React `cache()` per deduplicare le chiamate nello stesso render
 * tree RSC: `supabase.auth.getUser()` è una chiamata di rete verso Supabase Auth
 * e nel render di `/dashboard` veniva eseguita 3 volte (page + getOnboardingStatus
 * + getCatalogItems). `cache()` è no-op fuori dal render RSC, quindi resta sicuro
 * per i route handler che la chiamano (stesso pattern di `getOnboardingStatus`,
 * skill `testing-patterns` voce "react/cache deduplication across RSC and Route
 * Handlers"). Il bind `Sentry.setUser({ id })` interno (regola 22) viene così
 * eseguito una sola volta per richiesta — comportamento desiderato.
 */
export const getAuthenticatedUser = cache(async (): Promise<User> => {
  const supabase = await createServerSupabaseClient();
  let user: User | null = null;
  try {
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch (err) {
    // getUser() refreshes the access token under the hood. A stale refresh
    // token (rotated/expired/revoked, or sign-out elsewhere) makes @supabase/ssr
    // throw an AuthApiError (code: refresh_token_not_found). Without this catch
    // the raw AuthApiError bubbles up as an unhandled stack trace, bypassing
    // pino + sanitizeForTelemetry. An expired session is expected, not an
    // error — log it structured at warn (no Sentry capture below level 50) and
    // fall through to the standard "Not authenticated" so callers redirect.
    const errorClass =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code)
        : "auth_error";
    logger.warn(
      { action: "getAuthenticatedUser", errorClass },
      "auth session invalid",
    );
  }
  if (!user) {
    throw new UnauthenticatedError();
  }
  // Bind l'auth user id allo scope Sentry per la richiesta corrente. Senza
  // questo `Users Impacted` resta a 0 su ogni issue (ogni issue analizzata
  // nelle 10 di SCONTRINOZERO aveva 0 utenti tracciati, vanificando il
  // triage per impatto). Passiamo SOLO `id` (UUID opaco di Supabase Auth):
  // niente email/username/ip per coerenza col denylist `SAFE_KEYS` di
  // `src/lib/logger.ts` e con la policy GDPR del progetto. Regola 22 di
  // CLAUDE.md.
  Sentry.setUser({ id: user.id });
  // Touch fire-and-forget di profiles.last_seen_at: segnale "visita
  // autenticata" per il GDPR pruning (inactive-user-prune.ts).
  // auth.users.last_sign_in_at NON si aggiorna sul refresh token, quindi un
  // utente PWA con sessione persistente che usa l'app in sola lettura
  // risulterebbe inattivo e rischierebbe la cancellazione. Non awaited: non
  // deve costare latenza sul hot path (priorità #1 performance percepita) né
  // far fallire l'auth se il DB è degradato.
  void touchLastSeen(user.id).catch((err) =>
    logger.warn(
      { action: "touchLastSeen", err },
      "last_seen_at touch failed (non-blocking)",
    ),
  );
  return user;
});

/**
 * Registra la visita autenticata aggiornando `profiles.last_seen_at`.
 * Scrittura CONDIZIONALE per evitare write-amplification (stesso pattern del
 * conditional `last_used_at` delle API key, skill `testing-patterns`): la
 * UPDATE tocca la riga solo se il valore è NULL o più vecchio di 24h
 * (throttle — su soglie GDPR in mesi la granularità giornaliera basta) — per
 * ogni altra richiesta è un no-op senza write. `getAuthenticatedUser` è già
 * dedupata per-request via React cache(), quindi al più un tentativo per
 * richiesta.
 *
 * Raw SQL via `db.execute` (non il builder `db.update`) per due motivi:
 * clock server-side (`now()`, niente skew dell'app) e nessun bump collaterale
 * di `updated_at` (`$onUpdate` del builder) su una visita passiva.
 *
 * Il collaboratore non ha un profilo (issue #1099): il suo ultimo accesso sta
 * su `business_members`, che il titolare vede e lo sweep del titolare conta.
 * Le due UPDATE stanno in un solo statement (la prima in una CTE), così il
 * touch resta un round trip; per ognuno dei due ruoli una delle due tocca
 * zero righe.
 */
export async function touchLastSeen(authUserId: string): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    WITH owner_touch AS (
      UPDATE profiles
      SET last_seen_at = now()
      WHERE auth_user_id = ${authUserId}
        AND (last_seen_at IS NULL OR last_seen_at < now() - interval '24 hours')
      RETURNING 1
    )
    UPDATE business_members
    SET last_seen_at = now()
    WHERE auth_user_id = ${authUserId}
      AND role = 'collaborator'
      AND (last_seen_at IS NULL OR last_seen_at < now() - interval '24 hours')
  `);
}

/**
 * Verifica che l'utente appartenga all'attività e restituisce con che ruolo,
 * o l'errore da rimandare al client.
 *
 * L'accesso passa da `business_members`, non dalla proprietà del profilo
 * (issue #1099): così lo stesso controllo vale per il titolare e, quando ci
 * saranno, per i collaboratori. Una query sola, indicizzata su
 * `(auth_user_id)`, e dedupata per richiesta con `react/cache`.
 */
export const checkBusinessMembership = cache(
  async (
    userId: string,
    businessId: string,
  ): Promise<BusinessMembership | BusinessAccessError> => {
    const db = getDb();

    const [membership] = await db
      .select({ memberId: businessMembers.id, role: businessMembers.role })
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.authUserId, userId),
          eq(businessMembers.businessId, businessId),
        ),
      )
      .limit(1);

    if (!membership) {
      return { error: "Business non trovato o non autorizzato." };
    }

    return membership;
  },
);

/**
 * True se l'ultimo esito registrato è una password scaduta **e** descrive le
 * credenziali salvate ora. Il salvataggio non azzera `last_verify_outcome`
 * (resta per le metriche di onboarding), quindi un esito più vecchio
 * dell'ultimo `updated_at` parla di una password già sostituita: stesso
 * criterio con cui `AdeCredentialsSection` scarta un errore di verifica vecchio.
 */
function isPasswordExpiredOnStoredCredentials(cred: {
  lastVerifyOutcome: string | null;
  lastVerifyAt: Date | null;
  updatedAt: Date;
}): boolean {
  return (
    cred.lastVerifyOutcome === "password_expired" &&
    cred.lastVerifyAt !== null &&
    cred.lastVerifyAt.getTime() >= cred.updatedAt.getTime()
  );
}

/**
 * Fetches, validates, and decrypts AdE credentials for a business,
 * and builds the cedente/prestatore from local business data.
 * Returns an error object if any prerequisite is missing or invalid.
 *
 * Uses a single JOIN query instead of two sequential queries to reduce DB roundtrips.
 */
export async function fetchAdePrerequisites(
  businessId: string,
): Promise<AdePrerequisites | AdePrerequisitesError> {
  const db = getDb();

  const [row] = await db
    .select({ cred: adeCredentials, business: businesses })
    .from(adeCredentials)
    .innerJoin(businesses, eq(businesses.id, adeCredentials.businessId))
    .where(eq(adeCredentials.businessId, businessId))
    .limit(1);

  if (!row) {
    return {
      error: CREDENTIALS_NOT_FOUND_MESSAGE,
    };
  }
  if (!row.cred.verifiedAt) {
    // Login fermati per password scaduta (issue #1099), o verifica rimasta
    // ferma lì: stesso codice del login che l'ha scoperta. È contratto
    // pubblico (`409 ADE_PASSWORD_EXPIRED`, DEVELOPER.md) e in cassa apre il
    // cambio password.
    if (isPasswordExpiredOnStoredCredentials(row.cred)) {
      return {
        error: PASSWORD_EXPIRED_MESSAGE,
        code: "ADE_PASSWORD_EXPIRED",
        passwordExpired: true,
      };
    }
    return {
      error: CREDENTIALS_NOT_VERIFIED_MESSAGE,
    };
  }

  const cedentePrestatore = buildCedenteFromBusiness(row.business);

  // CIE e SPID: nessuna credenziale da decifrare — la sessione è quella
  // interattiva depositata dallo store. emit/void la riusano (o chiedono il
  // rinnovo).
  if (row.cred.loginMethod === "cie" || row.cred.loginMethod === "spid") {
    return { method: row.cred.loginMethod, cedentePrestatore };
  }

  // Fisconline: CF+password+PIN. I campi encrypted* sono nullable (migrazione
  // 0027): se mancano su una riga Fisconline, non è utilizzabile qui.
  if (
    row.cred.encryptedCodiceFiscale === null ||
    row.cred.encryptedPassword === null ||
    row.cred.encryptedPin === null
  ) {
    return {
      error:
        "Credenziali AdE incomplete. Riverifica le credenziali nelle impostazioni.",
    };
  }

  // Key map per VERSIONE reale (PR #785): la riga può essere ancora alla
  // chiave precedente durante una rotazione.
  const keys = getEncryptionKeys();
  const codiceFiscale = decrypt(row.cred.encryptedCodiceFiscale, keys);
  const password = decrypt(row.cred.encryptedPassword, keys);
  const pin = decrypt(row.cred.encryptedPin, keys);

  return {
    method: "fisconline",
    codiceFiscale,
    password,
    pin,
    utenzaPiva: row.cred.utenzaPiva ?? undefined,
    credentialVersion: row.cred.updatedAt,
    cedentePrestatore,
  };
}
