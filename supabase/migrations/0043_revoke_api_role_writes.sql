-- Migration: 0043_revoke_api_role_writes
--
-- Toglie a `anon` e `authenticated` ogni privilegio di SCRITTURA sulle tabelle
-- di `public`. Idempotente e no-op su un DB già in ordine.
--
-- Perché. Le policy `_own` (0001, 0005, riscritte in 0035) sono
-- `FOR ALL USING (proprietario)`: Postgres riusa USING come controllo di
-- scrittura, quindi garantiscono che la RIGA sia dell'utente, non quali COLONNE
-- possa scrivere. Con i grant di default di Supabase (anon e authenticated
-- hanno INSERT/UPDATE/DELETE su public — lo dice l'intestazione di 0035), chi
-- ha un account e la publishable key può fare PATCH /rest/v1/profiles sulla
-- propria riga e impostare `plan`, `plan_expires_at` o `referral_bonus_days`,
-- che `fetchPlan` legge come fonte di verità per ogni gate di piano; stesso per
-- `subscriptions` e `api_keys`. È un bypass del paywall a costo zero.
--
-- Perché si toglie qui e non nelle policy. RLS decide quali righe, non quali
-- colonne; limitarle con un WITH CHECK per colonna è fragile (ogni colonna
-- nuova nasce scrivibile) e le policy sono già state riscritte una volta. Il
-- privilegio di tabella è il livello giusto: l'app non scrive mai come questi
-- ruoli. Drizzle si collega come owner `postgres` (bypassa RLS e grant) e il
-- client service-role ha i propri privilegi; nessun codice del repo usa il
-- client Supabase con la publishable key per INSERT/UPDATE/DELETE.
--
-- Cosa NON tocca. La lettura: resta governata dalle policy `_own` e dal
-- deny-all delle tabelle server-only. I privilegi di `postgres` e `service_role`.
--
-- Il DO block è necessario perché i ruoli anon/authenticated non esistono su un
-- Postgres self-hosted: un'istruzione secca abortirebbe la migrazione lì (e
-- quindi il boot del container, `node migrate.js && node server.js`). Stesso
-- schema di 0035.
--
-- I default privileges valgono per le tabelle che il ruolo che esegue la
-- migrazione creerà DOPO: senza, la prossima tabella nasce di nuovo scrivibile.

DO $$
DECLARE
  target_role text;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM %I',
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM %I',
        target_role
      );
    END IF;
  END LOOP;
END $$;
