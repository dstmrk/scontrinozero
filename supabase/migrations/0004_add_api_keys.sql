-- Migration: 0004_add_api_keys
-- Aggiunge la tabella api_keys per l'accesso programmatico alla Developer API.
--
-- Due tipi di chiave:
--   'business'   — associata a un business_id, emette scontrini per quell'esercente
--   'management' — business_id NULL, gestisce esercenti via Partner Management API (Fase B)
--
-- La raw key non viene mai persistita: si salva solo il SHA-256 hash (hex).

CREATE TABLE "api_keys" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id"   uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "business_id"  uuid REFERENCES "businesses"("id") ON DELETE CASCADE,
  "type"         text NOT NULL DEFAULT 'business',
  "name"         text NOT NULL,
  "key_hash"     text NOT NULL UNIQUE,
  "key_prefix"   text NOT NULL,
  "last_used_at" timestamp with time zone,
  "expires_at"   timestamp with time zone,
  "revoked_at"   timestamp with time zone,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_api_keys_key_hash"    ON "api_keys" ("key_hash");
CREATE INDEX "idx_api_keys_profile_id"  ON "api_keys" ("profile_id");
CREATE INDEX "idx_api_keys_business_id" ON "api_keys" ("business_id");
