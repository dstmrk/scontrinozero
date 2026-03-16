-- v0.9.1: Indici mancanti su colonne FK
--
-- Postgres non crea automaticamente indici sulle colonne che referenziano (FK).
-- Questi indici sono necessari per:
--   1. idx_businesses_profile_id: query di ownership check e onboarding status
--   2. idx_commercial_document_lines_document_id: inArray queries in searchReceipts/exportUserData

CREATE INDEX "idx_businesses_profile_id"
  ON "businesses" USING btree ("profile_id");

CREATE INDEX "idx_commercial_document_lines_document_id"
  ON "commercial_document_lines" USING btree ("document_id");
