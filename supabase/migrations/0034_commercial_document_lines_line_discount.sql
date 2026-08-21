-- Migration 0034: sconto di riga sulle righe contabili
-- Feature: sconti sullo scontrino (piano Pro), v1.7.4.
--
-- Lo sconto applicato alla singola voce venduta. A differenza dello sconto a
-- pagare — che vive in `commercial_documents.public_request` (jsonb) perche'
-- non e' un dato fiscale — questo lo e' eccome: **riduce la base imponibile e
-- quindi l'IVA dovuta** (HAR.md voce #3a), concorre a `scontoTotale` /
-- `scontoTotaleLordo` e abbassa `ammontareComplessivo`. Deve quindi stare
-- nella colonna normalizzata della riga a cui si riferisce, come il prezzo.
--
-- Perche' "di RIGA" e non "per unita'": e' la grandezza nativa del tracciato
-- AdE. `scontoLordo` e' lo sconto dell'intera riga, gia' comprensivo della
-- quantita' (HAR.md voce #12, misurata su una riga con qta 2). Tenerlo per
-- unita' avrebbe imposto una divisione all'inserimento — "20 euro su 3 pezzi"
-- = 6,666... per pezzo — che non e' rappresentabile in centesimi esatti e
-- avrebbe fatto divergere di un centesimo il totale trasmesso da quello che
-- l'esercente aveva in mente (regola 17).
--
-- NOT NULL DEFAULT 0 e' sicuro anche su tabella popolata: da Postgres 11 un
-- default non volatile non riscrive la tabella (fast default), e 0 e'
-- esattamente il valore che ogni riga storica ha oggi implicitamente.
--
-- CHECK >= 0: difesa in profondita' allineata allo Zod, stesso pattern dei
-- vincoli della 0019. Il tetto superiore (sconto <= totale della riga) NON e'
-- qui: dipende da due altre colonne e vive in `saleLineSchema`, dove il
-- messaggio d'errore puo' spiegare quale riga e' sbagliata.

ALTER TABLE commercial_document_lines
  ADD COLUMN IF NOT EXISTS line_discount numeric(10, 2) NOT NULL DEFAULT 0;

-- DO block su pg_constraint -> idempotente al re-run del runner.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cd_lines_line_discount_check') THEN
    ALTER TABLE commercial_document_lines
      ADD CONSTRAINT cd_lines_line_discount_check CHECK (line_discount >= 0);
  END IF;
END $$;
