-- Migration: 0027_profiles_last_seen
-- Segnale "visita autenticata" per il GDPR pruning utenti inattivi (audit 2026-07-07).
--
-- Lo sweep di cancellazione (src/lib/services/inactive-user-prune.ts) misurava
-- l'attività come MAX(created_at, auth.users.last_sign_in_at, ultimo scontrino),
-- ma Supabase aggiorna `last_sign_in_at` SOLO su un grant di credenziali
-- (password/OTP), NON sul refresh token: un utente PWA con sessione persistente
-- che consulta l'app in sola lettura (storico/analytics, nessuna emissione)
-- risultava "inattivo" e rischiava la cancellazione pur usando il servizio.
-- La CTA dell'email di preavviso (/login) non chiudeva il buco: un utente già
-- loggato viene redirectato a /dashboard senza nuovo sign-in event.
--
-- `last_seen_at` registra l'ultima richiesta autenticata (touch throttled a
-- 1/24h in getAuthenticatedUser, src/lib/server-auth.ts) ed entra nel GREATEST
-- dell'attività dello sweep. NULL = nessuna visita registrata dal deploy di
-- questa colonna: il GREATEST ha già il floor a created_at, nessun backfill.
--
-- Solo ADD COLUMN IF NOT EXISTS → idempotente al re-run.

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "last_seen_at" timestamptz;
