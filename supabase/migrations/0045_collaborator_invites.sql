-- Migration 0045: inviti dei collaboratori e condizioni accettate
--
-- PR 6a della issue #1099: il titolare invita, il collaboratore accetta e
-- crea il suo accesso. Tre cose, tutte idempotenti e additive (il codice della
-- release precedente continua a girare sullo schema nuovo).
--
-- 1. `business_members`: nome, email e condizioni accettate del collaboratore.
--    Il collaboratore non ha un profilo (decisione 1 sulla issue), quindi
--    queste informazioni vivono qui. Sulle righe del titolare restano NULL: le
--    sue stanno in `profiles`. Il nome resta anche quando il collaboratore
--    viene rimosso e `auth_user_id` torna NULL: è ciò che attribuisce i suoi
--    documenti.
--
-- 2. `profiles.collaborator_terms_*`: il titolare accetta le Condizioni per i
--    collaboratori, con una versione propria, prima del primo invito
--    (decisione 5). I Termini generali restano quelli di `terms_version`.
--
-- 3. `collaborator_invites`: un invito in attesa. Nel DB solo lo SHA-256 del
--    token, mai il token. Niente colonne di stato: revoca e accettazione
--    cancellano la riga, così l'email di chi non è mai entrato non resta nel
--    DB; un invito scaduto resta finché il titolare non lo reinvia o lo
--    elimina. Una sola riga per email e attività: reinviare sostituisce
--    token e scadenza.

ALTER TABLE business_members
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS collaborator_terms_version text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS collaborator_terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS collaborator_terms_version text;

CREATE TABLE IF NOT EXISTS collaborator_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Lookup dell'invito dal link.
CREATE UNIQUE INDEX IF NOT EXISTS idx_collaborator_invites_token_hash
  ON collaborator_invites (token_hash);

-- Un invito per email e attività; copre anche l'elenco e la cascata
-- dall'attività, perché `business_id` è la prima colonna.
CREATE UNIQUE INDEX IF NOT EXISTS idx_collaborator_invites_business_email
  ON collaborator_invites (business_id, email);

-- Server-only, come business_members (0044): RLS senza policy vuol dire
-- nessuna riga per anon e authenticated. La revoca delle scritture la fanno
-- già i default privileges di 0043; ripetuta qui per un DB ricreato senza.
ALTER TABLE collaborator_invites ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_role text;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON collaborator_invites FROM %I',
        target_role
      );
    END IF;
  END LOOP;
END $$;
