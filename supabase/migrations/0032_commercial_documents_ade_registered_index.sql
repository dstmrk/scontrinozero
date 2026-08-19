-- Migration: indice (business_id, ade_registered_at) su commercial_documents
-- Feature: export CSV e storico filtrati sulla data fiscale (REVIEW #90/#92)
--
-- Con la 0031 `ade_registered_at` e' diventata la data mostrata su ogni
-- superficie di resa. Export CSV ed elenco storico continuavano pero' a
-- FILTRARE il periodo su `created_at`: la riga mostrava una data e ne
-- selezionava un'altra, e a cavallo della mezzanotte di fine mese i due valori
-- cadono in periodi diversi. Spostato il predicato su `ade_registered_at`,
-- l'indice composito su `(business_id, created_at)` non copre piu' le
-- condizioni di range: senza questo indice l'export di un anno di documenti
-- degrada a sequential scan sull'intera tabella.
--
-- Non sostituisce `idx_commercial_documents_business_created`: quell'indice
-- resta l'unico a coprire le letture per data d'inserimento (recovery delle
-- righe stale, che ragiona sul NOSTRO orologio e non su quello dell'AdE).
--
-- IF NOT EXISTS: la migrazione e' rieseguibile su un DB gia' allineato
-- (bootstrap via __applied_migrations su ambienti pre-esistenti).

CREATE INDEX IF NOT EXISTS idx_commercial_documents_business_registered
  ON commercial_documents (business_id, ade_registered_at);
