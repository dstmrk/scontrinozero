-- Migration: 0027_ade_credentials_login_method
-- Onboarding AdE multi-metodo: Fisconline (default) + CIE + SPID.
--
-- Finora `ade_credentials` modellava solo Fisconline (CF + password + PIN, tutti
-- NOT NULL). Aggiungiamo il metodo di accesso e rilassiamo i vincoli perché i
-- nuovi metodi memorizzano insiemi di campi diversi (validati a livello
-- applicativo, non dallo schema):
--   - Fisconline: encrypted_codice_fiscale + encrypted_password + encrypted_pin
--   - CIE:        encrypted_username (email CIE ID) + encrypted_password
--   - SPID:       NESSUN segreto memorizzato (solo login_method + spid_provider);
--                 username/password reinseriti a ogni rinnovo (regole AgID:
--                 la password SPID non va conservata da terzi).
--
-- Per questo `encrypted_codice_fiscale`, `encrypted_password` e `encrypted_pin`
-- diventano NULLABLE. I record Fisconline esistenti restano validi (login_method
-- default 'fisconline', tutti i campi già valorizzati).
--
-- Solo ADD COLUMN IF NOT EXISTS / DROP NOT NULL / CHECK idempotente → re-run safe.

ALTER TABLE "ade_credentials"
  ADD COLUMN IF NOT EXISTS "login_method" text NOT NULL DEFAULT 'fisconline';

ALTER TABLE "ade_credentials"
  ADD COLUMN IF NOT EXISTS "encrypted_username" text;

ALTER TABLE "ade_credentials"
  ADD COLUMN IF NOT EXISTS "spid_provider" text;

ALTER TABLE "ade_credentials" ALTER COLUMN "encrypted_codice_fiscale" DROP NOT NULL;
ALTER TABLE "ade_credentials" ALTER COLUMN "encrypted_password" DROP NOT NULL;
ALTER TABLE "ade_credentials" ALTER COLUMN "encrypted_pin" DROP NOT NULL;

-- Vincolo sui valori ammessi di login_method (idempotente via guard su pg_constraint).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ade_credentials_login_method_check'
  ) THEN
    ALTER TABLE "ade_credentials"
      ADD CONSTRAINT "ade_credentials_login_method_check"
      CHECK ("login_method" IN ('fisconline', 'cie', 'spid'));
  END IF;
END $$;
