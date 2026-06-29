-- Migration: 0023_businesses_email_idempotency_flags
-- Durabilità idempotency welcome/operator email (PLAN.md v1.4.x).
--
-- Finora verifyAdeCredentials (src/server/onboarding-actions.ts) gatava sia la
-- welcome email sia la notifica operatore su `Boolean(fiscalCode)`: un proxy
-- di "onboarding completato", non un record di "email inviata". Niente audit
-- trail (quando), fragile a un reset manuale di fiscal_code (re-invio), e
-- impossibile tracciare welcome vs operator separatamente.
--
-- `welcome_email_sent_at` / `operator_notified_at`: timestamp del momento in cui
-- l'email è stata reclamata via claim atomico (UPDATE ... WHERE ... IS NULL
-- RETURNING) nella server action — race-safe e idempotente come il pattern del
-- referral reward (migration 0021, rewarded_at).
--
-- Backfill: i business già onboardati (fiscal_code valorizzato) hanno già
-- ricevuto le email sotto il vecchio gating; segnarli con created_at così il
-- nuovo claim non li re-invia. Solo righe ancora NULL → idempotente al re-run.

ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "welcome_email_sent_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "operator_notified_at" timestamptz;

UPDATE "businesses"
  SET "welcome_email_sent_at" = "created_at",
      "operator_notified_at" = "created_at"
  WHERE "fiscal_code" IS NOT NULL
    AND "welcome_email_sent_at" IS NULL
    AND "operator_notified_at" IS NULL;
