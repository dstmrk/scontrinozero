-- Migration 0046: ultimo accesso dei collaboratori
--
-- PR 6b della issue #1099. Il titolare vede quando ciascun collaboratore è
-- entrato l'ultima volta, e lo sweep di inattività del titolare conta anche
-- gli accessi dei collaboratori (decisione 4): un'attività con collaboratori
-- attivi non si cancella perché il titolare non entra.
--
-- Stessa semantica di `profiles.last_seen_at`: lo aggiorna
-- `touchLastSeen` (`src/lib/server-auth.ts`) al più una volta ogni 24 ore.
-- Sulle righe del titolare resta NULL, perché il suo sta in `profiles`; si
-- azzera quando un collaboratore viene rimosso.

ALTER TABLE business_members
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
