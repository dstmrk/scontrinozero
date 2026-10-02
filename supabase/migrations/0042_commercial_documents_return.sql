-- Migration 0042: documento commerciale di reso merce
--
-- Il reso (HAR.md voce #19) e' un documento fiscale a se', collegato alla
-- vendita che rende: una vendita puo' averne piu' d'uno (resi parziali), e la
-- vendita resta ACCEPTED — il "quanto e' stato reso" si ricava dalla somma dei
-- resi, non da uno stato. Per questo il reso NON riusa `voided_document_id`
-- (che ha un indice unique: un annullo per vendita) e non aggiunge stati:
-- un RETURN va PENDING -> ACCEPTED | REJECTED | ERROR come una vendita.
--
-- `ALTER TYPE ... ADD VALUE` gira dentro la transazione del runner (PG >= 12):
-- il valore nuovo pero' non e' usabile nella stessa transazione, quindi qui
-- sotto nessun predicato lo nomina.
ALTER TYPE document_kind ADD VALUE IF NOT EXISTS 'RETURN';

ALTER TABLE commercial_documents
  ADD COLUMN IF NOT EXISTS returned_document_id uuid;

-- Nome corto esplicito come `fk_comm_docs_voided_doc` (limite di 63 caratteri).
-- ON DELETE SET NULL come per l'annullo: il reso resta un documento trasmesso
-- anche se la riga della vendita sparisse.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_comm_docs_returned_doc'
  ) THEN
    ALTER TABLE commercial_documents
      ADD CONSTRAINT fk_comm_docs_returned_doc
      FOREIGN KEY (returned_document_id)
      REFERENCES commercial_documents (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Lettura "i resi di questa vendita": quantita' gia' rese, guardia sull'annullo.
CREATE INDEX IF NOT EXISTS idx_commercial_documents_returned_document_id
  ON commercial_documents (returned_document_id)
  WHERE returned_document_id IS NOT NULL;

-- Una sola correzione in volo per vendita, annullo O reso. Due resi
-- concorrenti leggerebbero dall'AdE lo stesso residuo e trasmetterebbero
-- entrambi; un annullo e un reso concorrenti stornerebbero la vendita due
-- volte. L'AdE non impedisce nessuno dei due (non impedisce nemmeno l'annullo
-- di una vendita gia' resa, voce #19f), e sono documenti irreversibili.
--
-- Un indice solo sulla vendita "corretta", qualunque sia la colonna che la
-- punta, invece di un lock: l'INSERT della riga PENDING fallisce sul conflitto
-- e il chiamante sa gia' gestirlo (ON CONFLICT DO NOTHING). Copre solo
-- PENDING: una correzione conclusa, rifiutata o in errore non blocca la
-- successiva — che rilegge lo stato dall'AdE e dal DB (vendita annullata,
-- resi gia' registrati).
CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_documents_correction_in_flight
  ON commercial_documents ((COALESCE(voided_document_id, returned_document_id)))
  WHERE status = 'PENDING'
    AND (voided_document_id IS NOT NULL OR returned_document_id IS NOT NULL);
