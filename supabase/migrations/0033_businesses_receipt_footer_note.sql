-- Migration 0033: messaggio di cortesia personalizzato in coda allo scontrino
-- Feature: personalizzazione scontrino (piano Pro), ex PLAN.md nice-to-have.
--
-- Il testo che l'esercente vuole in fondo al documento commerciale — il posto
-- dove il layout standard AdE scrive "Arrivederci e grazie!".
--
-- Perche' su `businesses` e non su `commercial_documents`: NON e' un dato
-- fiscale. Il payload DCW10 non ha alcun campo libero (`AdePayload` in
-- src/lib/ade/types.ts), quindi il messaggio non esiste per l'AdE e non
-- concorre a nessun totale. E' un attributo dell'esercente esattamente come
-- ragione sociale e indirizzo, che le tre superfici di resa (PDF, termica,
-- pagina pubblica /r) leggono gia' live dalla riga `businesses` al momento
-- della stampa. Una copia per documento avrebbe congelato un messaggio
-- promozionale e reso incoerente il trattamento dell'intestazione, che live
-- lo e' gia'.
--
-- Conseguenza accettata: ristampare uno scontrino vecchio riporta il messaggio
-- corrente, non quello in vigore all'emissione. Su un testo di cortesia e'
-- irrilevante; su un dato fiscale non lo sarebbe.
--
-- CHECK <= 64: difesa in profondita' allineata a RECEIPT_FOOTER_NOTE_MAX_CHARS
-- (src/lib/receipt-format.ts) = 2 righe x 32 colonne, la larghezza della
-- termica 58mm, che e' la superficie piu' stretta. Stesso pattern dei limiti
-- introdotti dalla 0019: la validazione applicativa resta la prima linea, il
-- vincolo DB e' la rete di sicurezza per import/script che la bypassano.
--
-- Colonna nullable senza default: nessuna nota = nessuna riga stampata.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS receipt_footer_note text;

-- Il CHECK passa automaticamente su NULL: vincola solo i valori presenti.
-- DO block su pg_constraint -> idempotente al re-run del runner.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_receipt_footer_note_length_check') THEN
    ALTER TABLE businesses
      ADD CONSTRAINT businesses_receipt_footer_note_length_check CHECK (char_length(receipt_footer_note) <= 64);
  END IF;
END $$;
