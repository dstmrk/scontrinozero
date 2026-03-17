-- Row Level Security policies (defense in depth)
--
-- Drizzle ORM uses the postgres superuser via DATABASE_URL (transaction pooler),
-- which bypasses RLS entirely. Application-layer ownership checks (checkBusinessOwnership)
-- remain the primary defense.
--
-- These policies protect against a secondary attack vector: direct access to the
-- Supabase REST API using the NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (anon key).
-- Since that key is embedded in the client bundle, these policies ensure that even
-- if someone calls the Supabase API directly, they can only access their own data.
--
-- All statements are idempotent: safe to run on both fresh and existing databases.

-- Enable RLS on all user-data tables (idempotent)
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "businesses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ade_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "commercial_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "catalog_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- profiles: each user can only access their own profile row
DROP POLICY IF EXISTS "profiles_own" ON "profiles";--> statement-breakpoint
CREATE POLICY "profiles_own" ON "profiles"
  FOR ALL
  USING (auth_user_id = auth.uid());--> statement-breakpoint

-- businesses: accessible only to the user who owns the linked profile
DROP POLICY IF EXISTS "businesses_own" ON "businesses";--> statement-breakpoint
CREATE POLICY "businesses_own" ON "businesses"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = businesses.profile_id
        AND profiles.auth_user_id = auth.uid()
    )
  );--> statement-breakpoint

-- ade_credentials: accessible only through the owning business
DROP POLICY IF EXISTS "ade_credentials_own" ON "ade_credentials";--> statement-breakpoint
CREATE POLICY "ade_credentials_own" ON "ade_credentials"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM businesses
      INNER JOIN profiles ON businesses.profile_id = profiles.id
      WHERE businesses.id = ade_credentials.business_id
        AND profiles.auth_user_id = auth.uid()
    )
  );--> statement-breakpoint

-- commercial_documents: accessible only through the owning business
DROP POLICY IF EXISTS "commercial_documents_own" ON "commercial_documents";--> statement-breakpoint
CREATE POLICY "commercial_documents_own" ON "commercial_documents"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM businesses
      INNER JOIN profiles ON businesses.profile_id = profiles.id
      WHERE businesses.id = commercial_documents.business_id
        AND profiles.auth_user_id = auth.uid()
    )
  );--> statement-breakpoint

-- commercial_document_lines: accessible only through the owning document → business
DROP POLICY IF EXISTS "commercial_document_lines_own" ON "commercial_document_lines";--> statement-breakpoint
CREATE POLICY "commercial_document_lines_own" ON "commercial_document_lines"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM commercial_documents
      INNER JOIN businesses ON commercial_documents.business_id = businesses.id
      INNER JOIN profiles ON businesses.profile_id = profiles.id
      WHERE commercial_documents.id = commercial_document_lines.document_id
        AND profiles.auth_user_id = auth.uid()
    )
  );--> statement-breakpoint

-- catalog_items: accessible only through the owning business
DROP POLICY IF EXISTS "catalog_items_own" ON "catalog_items";--> statement-breakpoint
CREATE POLICY "catalog_items_own" ON "catalog_items"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM businesses
      INNER JOIN profiles ON businesses.profile_id = profiles.id
      WHERE businesses.id = catalog_items.business_id
        AND profiles.auth_user_id = auth.uid()
    )
  );
