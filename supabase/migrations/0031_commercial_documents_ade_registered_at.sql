-- Migration: add ade_registered_at to commercial_documents
-- Feature: ricevuta di annullamento (v1.7.0)
--
-- Istante di registrazione del documento presso l'AdE. La risposta alla POST
-- non contiene alcun timestamp, ma l'header HTTP `Date` coincide al secondo
-- con quello che l'AdE stampa nel footer del PDF ufficiale e con il campo
-- `data` della ricerca documenti (misurato su tre catture e due fusi orari —
-- HAR.md #16b).
--
-- Perche' NOT NULL invece che nullable con fallback su created_at: un
-- `ade_registered_at ?? created_at` andrebbe ripetuto in ogni lettore (PDF,
-- ricevuta pubblica, storico, export, API v1) e basterebbe dimenticarlo in uno
-- per mostrare due date diverse sullo stesso documento. Una colonna sempre
-- valorizzata e' una lettura sola, per sempre.
--
-- ⚠️ Semantica sulle righe storiche: il backfill copia `created_at`, che e' il
-- NOSTRO orologio al momento dell'INSERT — scritto PRIMA della chiamata AdE, e
-- quindi in anticipo sul timestamp fiscale della latenza del round-trip (2-5s).
-- Per i documenti gia' emessi la colonna NON e' quindi il dato autorevole
-- dell'AdE ma la miglior approssimazione disponibile: e' esattamente la data
-- che l'app mostra oggi, quindi nessun documento storico cambia aspetto.
-- Dai documenti emessi dalla v1.7.0 in poi il valore e' quello vero dell'AdE.
--
-- DEFAULT now() perche' la riga nasce PENDING, inserita prima di sapere l'esito
-- AdE: al momento dell'INSERT il timestamp autorevole non esiste ancora. La
-- UPDATE che marca ACCEPTED/VOID_ACCEPTED lo sovrascrive con quello vero. Se
-- l'header AdE mancasse (raro), la colonna resta sul valore d'inserimento
-- invece di essere NULL: nessun ramo nullo da gestire a valle, mai.

-- 1. Colonna nullable: su una tabella popolata un NOT NULL immediato fallirebbe.
ALTER TABLE commercial_documents
  ADD COLUMN IF NOT EXISTS ade_registered_at timestamptz;

-- 2. Backfill delle righe storiche. Prima del DEFAULT: con un default gia'
--    impostato, Postgres riempirebbe le righe esistenti con l'istante della
--    migrazione invece che con il loro created_at.
UPDATE commercial_documents
  SET ade_registered_at = created_at
  WHERE ade_registered_at IS NULL;

-- 3. Default per le INSERT successive (riga PENDING, esito AdE ancora ignoto).
ALTER TABLE commercial_documents
  ALTER COLUMN ade_registered_at SET DEFAULT now();

-- 4. Ora che ogni riga ha un valore e ogni nuova riga ne avra' uno, il vincolo
--    puo' essere imposto. Idempotente: un SET NOT NULL su colonna gia' NOT NULL
--    e' un no-op.
ALTER TABLE commercial_documents
  ALTER COLUMN ade_registered_at SET NOT NULL;
