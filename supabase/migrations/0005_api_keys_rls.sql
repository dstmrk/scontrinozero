-- Migration: 0005_api_keys_rls
-- Abilita RLS sulla tabella api_keys.
--
-- Le chiavi API sono accessibili solo al proprietario del profilo tramite la
-- Supabase REST API (anon key). Le route /api/v1/* usano Drizzle con service
-- role (bypass RLS) per il lookup tramite key_hash.

ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- api_keys: accessibili solo al profilo proprietario
DROP POLICY IF EXISTS "api_keys_own" ON "api_keys";--> statement-breakpoint
CREATE POLICY "api_keys_own" ON "api_keys"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = api_keys.profile_id
        AND profiles.auth_user_id = auth.uid()
    )
  );
