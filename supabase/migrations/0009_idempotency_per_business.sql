-- Migration: 0009_idempotency_per_business
-- Ridefinisce lo scope dell'idempotency_key da globale a per-business.
--
-- Prima: UNIQUE(idempotency_key) → globale tra tutti i business
-- Dopo:  UNIQUE(business_id, idempotency_key) → scoped al singolo business
--
-- Motivazioni:
-- 1. Con constraint globale, due business che usano accidentalmente la stessa UUID
--    (generata lato client) si bloccano a vicenda — denial-of-service involontario.
-- 2. In caso di conflitto, il codice applicativo potrebbe restituire dati di un
--    documento di un altro business (data leak di metadati cross-tenant).
-- 3. Lo scope corretto per l'idempotency è il tenant (business), non il sistema intero.

-- Rimuove il vecchio vincolo globale (nome generato da Drizzle)
ALTER TABLE "commercial_documents"
  DROP CONSTRAINT IF EXISTS "commercial_documents_idempotency_key_unique";--> statement-breakpoint

-- Nuovo vincolo composito: unico per (business_id, idempotency_key)
CREATE UNIQUE INDEX "idx_commercial_documents_business_idempotency"
  ON "commercial_documents" ("business_id", "idempotency_key");
