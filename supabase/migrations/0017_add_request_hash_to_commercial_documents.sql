-- Migration: 0017_add_request_hash_to_commercial_documents
-- P1.4: una idempotencyKey riusata con un payload diverso ritornava il
-- risultato precedente (per SALE handleExistingReceipt non confrontava
-- righe/importi/payment/lottery). Aggiunge `request_hash`: un fingerprint
-- SHA-256 canonico del payload SALE salvato all'emissione; su conflitto
-- idempotency con hash diverso il servizio risponde 409
-- IDEMPOTENCY_PAYLOAD_MISMATCH.
--
-- Nullable: le righe storiche restano NULL e vengono saltate dal confronto
-- (fallback al comportamento precedente). I VOID non usano la colonna: la loro
-- verifica di coerenza è il confronto diretto di voided_document_id.

ALTER TABLE commercial_documents
  ADD COLUMN IF NOT EXISTS request_hash text;
