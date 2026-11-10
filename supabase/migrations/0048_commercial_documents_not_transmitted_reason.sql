-- Migration 0048: motivo per cui un documento in ERROR non è mai arrivato all'AdE
--
-- Produzione, 10/11/2026: un integratore della Developer API ha emesso con
-- credenziali Fisconline non più valide. Il login AdE rifiutato ha lasciato la
-- riga in ERROR, e il retry con la stessa idempotencyKey ha ricevuto
-- PENDING_IN_PROGRESS per 30 minuti: un ERROR viene trattato come un PENDING,
-- perché in generale non si sa se l'AdE abbia registrato il documento (un
-- errore dopo submitSale marca ERROR anche a documento registrato).
--
-- Un login rifiutato (credenziali, password scaduta, utenza bloccata o senza
-- P.IVA, riautenticazione CIE/SPID) avviene invece prima di qualunque
-- trasmissione. La colonna registra il codice di quell'errore, così il retry
-- può ripartire subito invece di aspettare la soglia stale.
--
-- NULL vuol dire "nessuna certezza": è lo stato di ogni riga esistente e di
-- ogni ERROR con esito ignoto, ed è il comportamento di prima. Nessun
-- backfill: delle righe storiche non sappiamo il motivo. Si azzera quando il
-- recovery reclama la riga per ritrasmetterla (`claimStaleDocument`).

ALTER TABLE commercial_documents
  ADD COLUMN IF NOT EXISTS not_transmitted_reason text;
