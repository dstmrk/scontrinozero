-- Migration: 0006_add_api_key_id_to_documents
-- Aggiunge api_key_id a commercial_documents per tracciare le emissioni via API.
--
-- NULL  = scontrino emesso via UI dashboard (sessione Supabase)
-- UUID  = scontrino emesso via Developer API (traccia quale chiave ha chiamato)
--
-- Usato per:
-- - Distinguere chiamate UI vs API nelle query di storico
-- - Calcolare il consumo mensile per i piani developer (Fase B)

ALTER TABLE "commercial_documents"
  ADD COLUMN "api_key_id" uuid REFERENCES "api_keys"("id") ON DELETE SET NULL;--> statement-breakpoint

CREATE INDEX "idx_commercial_documents_api_key"
  ON "commercial_documents" ("api_key_id");
