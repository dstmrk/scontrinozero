import { cache } from "react";
import * as Sentry from "@sentry/nextjs";
import { and, eq, sql } from "drizzle-orm";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import { adeCredentials, businesses, profiles } from "@/db/schema";
import { decrypt, getEncryptionKey } from "@/lib/crypto";
import { buildCedenteFromBusiness } from "@/lib/ade/mapper";
import { UnauthenticatedError } from "@/lib/auth-errors";
import { logger } from "@/lib/logger";
import type { User } from "@supabase/supabase-js";
import type { AdeCedentePrestatore } from "@/lib/ade/types";
export type { User } from "@supabase/supabase-js";

export type BusinessOwnershipError = { error: string };

export type AdePrerequisites = {
  codiceFiscale: string;
  password: string;
  pin: string;
  cedentePrestatore: AdeCedentePrestatore;
};

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
 */
export async function touchLastSeen(authUserId: string): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    UPDATE profiles
    SET last_seen_at = now()
    WHERE auth_user_id = ${authUserId}
      AND (last_seen_at IS NULL OR last_seen_at < now() - interval '24 hours')
  `);
}

/**
 * Checks that businessId belongs to the authenticated user's profile.
 * Returns an error object if the check fails, or null if ownership is confirmed.
 *
 * Uses a single JOIN query instead of two sequential queries to reduce DB roundtrips.
 */
export async function checkBusinessOwnership(
  userId: string,
  businessId: string,
): Promise<BusinessOwnershipError | null> {
  const db = getDb();

  const [result] = await db
    .select({ id: businesses.id })
    .from(profiles)
    .innerJoin(
      businesses,
      and(eq(businesses.profileId, profiles.id), eq(businesses.id, businessId)),
    )
    .where(eq(profiles.authUserId, userId))
    .limit(1);

  if (!result) {
    return { error: "Business non trovato o non autorizzato." };
  }

  return null;
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
): Promise<AdePrerequisites | { error: string }> {
  const db = getDb();

  const [row] = await db
    .select({ cred: adeCredentials, business: businesses })
    .from(adeCredentials)
    .innerJoin(businesses, eq(businesses.id, adeCredentials.businessId))
    .where(eq(adeCredentials.businessId, businessId))
    .limit(1);

  if (!row) {
    return {
      error: "Credenziali AdE non trovate. Completa la configurazione.",
    };
  }
  if (!row.cred.verifiedAt) {
    return {
      error:
        "Credenziali AdE non verificate. Verifica le credenziali nelle impostazioni.",
    };
  }

  const key = getEncryptionKey();
  const keys = new Map<number, Buffer>([[row.cred.keyVersion, key]]);
  const codiceFiscale = decrypt(row.cred.encryptedCodiceFiscale, keys);
  const password = decrypt(row.cred.encryptedPassword, keys);
  const pin = decrypt(row.cred.encryptedPin, keys);

  const cedentePrestatore = buildCedenteFromBusiness(row.business);
  return { codiceFiscale, password, pin, cedentePrestatore };
}
