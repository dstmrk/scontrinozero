-- Migration: 0026_profiles_inactivity_warning
-- Timestamp preavviso cancellazione GDPR utenti inattivi (PLAN.md v1.x → v1.4.2).
--
-- La cancellazione automatica degli account inattivi >12 mesi (minimizzazione
-- dati GDPR, base legale: art. 5(1)(e) GDPR) richiede una fase di PREAVVISO:
-- l'utente riceve un'email di avviso ≥30 giorni prima della cancellazione.
-- `inactivity_warning_sent_at` traccia QUANDO il preavviso è stato inviato, così
-- lo sweep periodico (src/lib/services/inactive-user-prune.ts) può:
--   - cancellare solo se il preavviso è partito ≥30 giorni fa (grace period);
--   - azzerare il flag se l'utente torna attivo (nuovo scontrino o login),
--     garantendo un nuovo preavviso completo prima di una futura cancellazione.
--
-- NULL = nessun preavviso pendente. Nessun backfill: i profili esistenti
-- nascono a NULL e verranno preavvisati solo se/quando diventano inattivi.
--
-- Solo ADD COLUMN IF NOT EXISTS → idempotente al re-run.

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "inactivity_warning_sent_at" timestamptz;
