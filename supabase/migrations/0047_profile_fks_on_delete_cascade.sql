-- Migration 0047: le FK verso `profiles` si cancellano con il profilo
--
-- `referral_redemptions` (0021) e `partners` (0022) referenziano `profiles`
-- senza `ON DELETE`, cioè NO ACTION. Cancellare un account vuol dire
-- cancellare la sua riga `profiles` (`purgeUserById`, chiamato da
-- `deleteAccount` e dallo sweep di inattività): se il profilo ha presentato
-- qualcuno, è stato presentato o è un partner, quella DELETE fallisce sul
-- vincolo. Ma l'utente auth a quel punto è già cancellato, quindi il profilo
-- resta orfano con il log "manual cleanup required", e il diritto alla
-- cancellazione (art. 17 GDPR) non viene rispettato.
--
-- Con la cascata la riga di collegamento sparisce con uno qualunque dei due
-- profili. I giorni di bonus già riconosciuti stanno su
-- `profiles.referral_bonus_days`, quindi a chi resta non si toglie nulla; il
-- conteggio degli utenti portati da un partner scende quando uno di loro
-- cancella l'account, che è il comportamento corretto. Un partner che
-- cancella il proprio account porta via la riga `partners`, e il suo
-- sottodominio smette di attribuire le iscrizioni.
--
-- Nomi dei vincoli: quelli di default di Postgres per le REFERENCES inline,
-- verificati sui due progetti Supabase (dev/sandbox e produzione) il
-- 28/10/2026. Idempotente: DROP IF EXISTS e ADD rifanno lo stesso vincolo.
-- Le due tabelle erano vuote in entrambi i progetti, quindi la validazione
-- delle FK ricreate non costa nulla.

ALTER TABLE referral_redemptions
  DROP CONSTRAINT IF EXISTS referral_redemptions_referrer_id_fkey,
  DROP CONSTRAINT IF EXISTS referral_redemptions_referee_id_fkey;

ALTER TABLE referral_redemptions
  ADD CONSTRAINT referral_redemptions_referrer_id_fkey
    FOREIGN KEY (referrer_id) REFERENCES profiles (id) ON DELETE CASCADE,
  ADD CONSTRAINT referral_redemptions_referee_id_fkey
    FOREIGN KEY (referee_id) REFERENCES profiles (id) ON DELETE CASCADE;

ALTER TABLE partners
  DROP CONSTRAINT IF EXISTS partners_referrer_profile_id_fkey;

ALTER TABLE partners
  ADD CONSTRAINT partners_referrer_profile_id_fkey
    FOREIGN KEY (referrer_profile_id) REFERENCES profiles (id)
    ON DELETE CASCADE;
