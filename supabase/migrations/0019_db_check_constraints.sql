-- Migration 0019: defense-in-depth CHECK constraints + length limits
--
-- Motivo (REVIEW.md #22): finora la validazione di valori/lunghezze vive SOLO
-- nello Zod applicativo. Un import legacy, uno script admin o un refactor che
-- bypassa i refine potrebbe scrivere quantita'/prezzi negativi o stringhe
-- chilometriche. Questi vincoli sono la rete di sicurezza a livello DB.
--
-- Valori allineati alle single-source-of-truth Zod correnti:
--   - quantity / gross_unit_price  -> src/lib/receipts/receipt-schema.ts
--   - *.description (<= 200)        -> receipt-schema.ts / src/server/catalog-actions.ts
--   - default_price                 -> src/server/catalog-actions.ts
--   - business_name/address/...     -> BUSINESS_PROFILE_LIMITS in src/lib/validation.ts
--   - profiles.email (<= 254)       -> RFC 5321 max (nessun max Zod oggi)
--
-- Non-negativita' a >= 0 (non > 0): coerente con REVIEW.md, non blocca una
-- riga a prezzo zero eventualmente legittima.
--
-- Le tabelle sono piccole (hobby project) e il runner (scripts/migrate.ts)
-- wrappa l'intero file in UNA transazione: separare NOT VALID + VALIDATE in
-- due transazioni non darebbe alcun beneficio, quindi i CHECK sono validati
-- subito. Ogni ADD e' guardato da un DO block su pg_constraint -> idempotente
-- al re-run.
--
-- ⚠️ Pre-condizione: nessuna riga esistente deve violare i vincoli, altrimenti
-- l'ADD CONSTRAINT (validazione immediata) fallisce. Verificare prima con:
--   SELECT count(*) FROM commercial_document_lines
--     WHERE quantity < 0 OR gross_unit_price < 0 OR char_length(description) > 200;
--   SELECT count(*) FROM catalog_items
--     WHERE default_price < 0 OR char_length(description) > 200;
--   SELECT count(*) FROM businesses
--     WHERE char_length(business_name) > 120 OR char_length(address) > 150
--        OR char_length(street_number) > 20 OR char_length(city) > 80
--        OR char_length(province) > 3;
--   SELECT count(*) FROM profiles WHERE char_length(email) > 254;

-- commercial_document_lines -------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cd_lines_quantity_check') THEN
    ALTER TABLE commercial_document_lines
      ADD CONSTRAINT cd_lines_quantity_check CHECK (quantity >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cd_lines_gross_unit_price_check') THEN
    ALTER TABLE commercial_document_lines
      ADD CONSTRAINT cd_lines_gross_unit_price_check CHECK (gross_unit_price >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cd_lines_description_length_check') THEN
    ALTER TABLE commercial_document_lines
      ADD CONSTRAINT cd_lines_description_length_check CHECK (char_length(description) <= 200);
  END IF;
END $$;

-- catalog_items -------------------------------------------------------------
-- default_price e' nullable: il CHECK passa automaticamente su NULL.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_default_price_check') THEN
    ALTER TABLE catalog_items
      ADD CONSTRAINT catalog_items_default_price_check CHECK (default_price >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_description_length_check') THEN
    ALTER TABLE catalog_items
      ADD CONSTRAINT catalog_items_description_length_check CHECK (char_length(description) <= 200);
  END IF;
END $$;

-- businesses ----------------------------------------------------------------
-- Tutte le colonne sono nullable: il CHECK passa su NULL, vincola solo i valori.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_business_name_length_check') THEN
    ALTER TABLE businesses
      ADD CONSTRAINT businesses_business_name_length_check CHECK (char_length(business_name) <= 120);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_address_length_check') THEN
    ALTER TABLE businesses
      ADD CONSTRAINT businesses_address_length_check CHECK (char_length(address) <= 150);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_street_number_length_check') THEN
    ALTER TABLE businesses
      ADD CONSTRAINT businesses_street_number_length_check CHECK (char_length(street_number) <= 20);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_city_length_check') THEN
    ALTER TABLE businesses
      ADD CONSTRAINT businesses_city_length_check CHECK (char_length(city) <= 80);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_province_length_check') THEN
    ALTER TABLE businesses
      ADD CONSTRAINT businesses_province_length_check CHECK (char_length(province) <= 3);
  END IF;
END $$;

-- profiles ------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_email_length_check') THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_email_length_check CHECK (char_length(email) <= 254);
  END IF;
END $$;
