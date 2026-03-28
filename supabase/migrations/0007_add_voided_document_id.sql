-- Migration: 0007_add_voided_document_id
-- Aggiunge voided_document_id a commercial_documents per linkare ogni VOID al SALE originale.
--
-- Scopo: prevenire doppi annulli concorrenti (race condition) sullo stesso scontrino.
-- Il vincolo UNIQUE (parziale, solo su NOT NULL) garantisce che ogni SALE possa avere
-- al massimo un documento VOID, indipendentemente da quanti thread tentino l'annullo.
--
-- ON DELETE SET NULL: se il SALE venisse mai eliminato, il riferimento nel VOID diventa NULL
-- senza bloccare la cascade di eliminazione business.

ALTER TABLE "commercial_documents"
  ADD COLUMN "voided_document_id" uuid REFERENCES "commercial_documents"("id") ON DELETE SET NULL;--> statement-breakpoint

CREATE UNIQUE INDEX "idx_commercial_documents_voided_document_id"
  ON "commercial_documents" ("voided_document_id")
  WHERE "voided_document_id" IS NOT NULL;
