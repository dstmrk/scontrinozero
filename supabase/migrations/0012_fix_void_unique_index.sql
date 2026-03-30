-- Migration: 0012_fix_void_unique_index
-- Corregge il predicato dell'indice unique su voided_document_id per consentire
-- il retry dell'annullo dopo un tentativo fallito (ERROR o REJECTED).
--
-- Problema: l'indice originale (WHERE voided_document_id IS NOT NULL) copre TUTTI
-- i record inclusi quelli in ERROR/REJECTED. Un secondo tentativo con una nuova
-- idempotency key viene quindi bloccato da ON CONFLICT DO NOTHING, rendendo
-- irrecuperabile un annullo con errore transitorio senza intervento manuale DB.
--
-- Fix: restringere il predicato ai soli stati attivi/riusciti (PENDING,VOID_ACCEPTED).
-- REJECTED e ERROR sono esclusi: il SALE rimane in stato ACCEPTED dopo un void fallito,
-- quindi un retry è sicuro. La guardia anti-race-condition sui void concorrenti
-- rimane efficace perché PENDING è ancora coperto dall'indice.

DROP INDEX IF EXISTS "idx_commercial_documents_voided_document_id";

CREATE UNIQUE INDEX "idx_commercial_documents_voided_document_id"
  ON "commercial_documents" ("voided_document_id")
  WHERE "voided_document_id" IS NOT NULL
    AND "status" IN ('PENDING', 'VOID_ACCEPTED');
