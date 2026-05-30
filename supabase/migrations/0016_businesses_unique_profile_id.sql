-- Migration: 0016_businesses_unique_profile_id
-- P1.2: l'onboarding poteva creare più righe `businesses` per lo stesso
-- profilo. `profile_id` aveva solo un indice semplice (non UNIQUE) e
-- `saveBusiness` faceva SELECT-then-INSERT senza lock: due submit concorrenti
-- superavano entrambi il check "nessun business esistente" e inserivano due
-- righe. L'app assume 1 business per profilo. Aggiunge il vincolo UNIQUE come
-- backstop a livello DB (la serializzazione applicativa via SELECT ... FOR
-- UPDATE è nel codice).
--
-- Fail-fast sui dati di produzione (decisione 2026-05-30): se esistono già
-- `profile_id` duplicati la migration ABORTISCE senza toccare i dati — la
-- deduplica va fatta MANUALMENTE prima di riapplicare (più sicuro di un dedup
-- automatico su dati fiscali).
--
-- Idempotente: il guard su pg_constraint evita errori al re-run.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM businesses GROUP BY profile_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'businesses.profile_id duplicati: deduplica manuale richiesta prima di applicare UNIQUE (profile_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'businesses_profile_id_unique'
  ) THEN
    ALTER TABLE businesses
      ADD CONSTRAINT businesses_profile_id_unique UNIQUE (profile_id);
  END IF;
END $$;

-- Il vincolo UNIQUE crea già il proprio indice univoco: l'indice semplice
-- preesistente è ridondante.
DROP INDEX IF EXISTS "idx_businesses_profile_id";
