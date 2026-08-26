-- Migration: 0035_rls_hardening
--
-- Tre cose, tutte idempotenti e tutte no-op su un DB già in ordine (prod).
--
-- 1. RI-ASSERISCE RLS + policy sulle 7 tabelle di 0001 e su api_keys (0005).
--    Il progetto Supabase che serve sandbox/dev le aveva con RLS SPENTA e zero
--    policy, pur avendo 0001 e 0005 registrate come applicate in
--    __applied_migrations: le tabelle sono state ricreate dopo (restore o push),
--    il registro è rimasto indietro. Con i grant di default di Supabase (anon e
--    authenticated hanno SELECT/INSERT/UPDATE/DELETE su public) quel DB era
--    leggibile e scrivibile da chiunque avesse la publishable key. Le migrazioni
--    applicate sono immutabili (regola 11), quindi la riparazione è qui.
--
-- 2. Sostituisce `auth.uid()` con `(select auth.uid())` in ogni policy.
--    Postgres valuta il subquery UNA volta per statement invece che per riga
--    (initPlan): è il lint auth_rls_initplan dell'advisor performance. Le policy
--    andavano riscritte comunque per il punto 1, quindi il fix costa zero.
--
-- 3. Revoca EXECUTE su public.rls_auto_enable() da PUBLIC/anon/authenticated.
--    È la funzione dell'event trigger `ensure_rls` (installato dalla dashboard
--    Supabase, non da questo repo), che l'advisor segnala come SECURITY DEFINER
--    invocabile via /rest/v1/rpc/. Non è sfruttabile — Postgres rifiuta la
--    chiamata diretta di una funzione che ritorna `event_trigger` con
--    "0A000: trigger functions can only be called as triggers" — ma togliere il
--    grant chiude il warning e riduce la superficie. L'event trigger continua a
--    scattare: il privilegio EXECUTE si verifica alla CREATE EVENT TRIGGER, non
--    a ogni DDL.
--
-- Nessuna di queste righe tocca il path dell'app: Drizzle si collega come owner
-- `postgres` via DATABASE_URL e bypassa RLS comunque. Le policy difendono solo
-- l'accesso diretto alla REST API di Supabase con la publishable key.

-- ---------------------------------------------------------------------------
-- 1. RLS abilitata ovunque
-- ---------------------------------------------------------------------------

-- Tabelle con dati di un utente: RLS + policy `_own` (sotto).
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "businesses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ade_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "commercial_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "catalog_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Tabelle server-only: RLS SENZA policy = deny-all per anon/authenticated.
-- Sono già così dalle rispettive migrazioni (0013, 0018, 0021, 0022); qui solo
-- ri-asserite perché un DB ricreato le perderebbe allo stesso modo delle altre.
ALTER TABLE "stripe_webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trial_vat_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "referral_redemptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "partners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Registro delle migrazioni: creato da scripts/migrate.ts, non dallo schema
-- Drizzle. Senza questa riga è l'unica tabella di public che anon può leggere
-- (e da cui può dedurre lo stato di deploy del DB).
ALTER TABLE "__applied_migrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Policy `_own` — stesse di 0001/0005 con auth.uid() dentro un subquery
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_own" ON "profiles";--> statement-breakpoint
CREATE POLICY "profiles_own" ON "profiles"
  FOR ALL
  USING (auth_user_id = (SELECT auth.uid()));--> statement-breakpoint

DROP POLICY IF EXISTS "businesses_own" ON "businesses";--> statement-breakpoint
CREATE POLICY "businesses_own" ON "businesses"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = businesses.profile_id
        AND profiles.auth_user_id = (SELECT auth.uid())
    )
  );--> statement-breakpoint

DROP POLICY IF EXISTS "ade_credentials_own" ON "ade_credentials";--> statement-breakpoint
CREATE POLICY "ade_credentials_own" ON "ade_credentials"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM businesses
      INNER JOIN profiles ON businesses.profile_id = profiles.id
      WHERE businesses.id = ade_credentials.business_id
        AND profiles.auth_user_id = (SELECT auth.uid())
    )
  );--> statement-breakpoint

DROP POLICY IF EXISTS "commercial_documents_own" ON "commercial_documents";--> statement-breakpoint
CREATE POLICY "commercial_documents_own" ON "commercial_documents"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM businesses
      INNER JOIN profiles ON businesses.profile_id = profiles.id
      WHERE businesses.id = commercial_documents.business_id
        AND profiles.auth_user_id = (SELECT auth.uid())
    )
  );--> statement-breakpoint

DROP POLICY IF EXISTS "commercial_document_lines_own" ON "commercial_document_lines";--> statement-breakpoint
CREATE POLICY "commercial_document_lines_own" ON "commercial_document_lines"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM commercial_documents
      INNER JOIN businesses ON commercial_documents.business_id = businesses.id
      INNER JOIN profiles ON businesses.profile_id = profiles.id
      WHERE commercial_documents.id = commercial_document_lines.document_id
        AND profiles.auth_user_id = (SELECT auth.uid())
    )
  );--> statement-breakpoint

DROP POLICY IF EXISTS "catalog_items_own" ON "catalog_items";--> statement-breakpoint
CREATE POLICY "catalog_items_own" ON "catalog_items"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM businesses
      INNER JOIN profiles ON businesses.profile_id = profiles.id
      WHERE businesses.id = catalog_items.business_id
        AND profiles.auth_user_id = (SELECT auth.uid())
    )
  );--> statement-breakpoint

DROP POLICY IF EXISTS "subscriptions_own" ON "subscriptions";--> statement-breakpoint
CREATE POLICY "subscriptions_own" ON "subscriptions"
  FOR ALL
  USING (user_id = (SELECT auth.uid()));--> statement-breakpoint

DROP POLICY IF EXISTS "api_keys_own" ON "api_keys";--> statement-breakpoint
CREATE POLICY "api_keys_own" ON "api_keys"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = api_keys.profile_id
        AND profiles.auth_user_id = (SELECT auth.uid())
    )
  );--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. REVOKE su rls_auto_enable(), solo dove funzione e ruoli esistono
-- ---------------------------------------------------------------------------

-- Il DO block è necessario perché né la funzione né i ruoli anon/authenticated
-- esistono su un Postgres self-hosted: una REVOKE secca abortirebbe la
-- migrazione lì (e quindi il boot del container, `node migrate.js && node
-- server.js`).
DO $$
DECLARE
  target_role text;
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC';

  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM %I',
        target_role
      );
    END IF;
  END LOOP;
END $$;
