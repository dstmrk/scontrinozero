-- Migration 0037: utenza di lavoro AdE scelta al primo collegamento
-- Feature: supporto alle utenze che operano per conto di societa' terze.
-- Evidenza: HAR.md #18, REVIEW.md #106, Sentry SCONTRINOZERO-13.
--
-- Chi accede al portale AdE con le proprie credenziali ma rappresenta una o
-- piu' societa' non ha una partita IVA propria: il portale gli fa scegliere
-- l'"utenza di lavoro" fra gli incarichi disponibili. Questa colonna registra
-- quale scelta rigiocare a ogni login, incluso il re-auth automatico su 401,
-- dove nessun utente e' davanti allo schermo.
--
-- Perche' su `ade_credentials` e non su `businesses`: e' un **input della
-- procedura di login**, non un attributo dell'attivita'. Sta con gli altri
-- input (login_method, i campi encrypted_*) e, soprattutto, ne condivide il
-- ciclo di vita: quando l'esercente sostituisce le credenziali, la scelta
-- fatta con quelle vecchie non e' piu' garantita valida — le nuove credenziali
-- potrebbero non avere quell'incarico. Vivendo sulla stessa riga la coerenza
-- e' strutturale invece che affidata al codice chiamante. Su `businesses`
-- sarebbe sopravvissuta al cambio credenziali puntando a un incarico
-- inesistente. Stesso motivo per cui `verified_at` sta qui.
--
-- `businesses.vat_number` resta il dato **osservato**, scritto da
-- finalizeAdeVerification con cio' che l'AdE ha risposto. Invariante che ne
-- discende, e che vale come check di integrita': dopo una verifica riuscita i
-- due valori coincidono.
--
-- Una colonna sola, nullable, senza default:
--   NULL            -> utenza "me stesso", la P.IVA e' intestata a chi accede.
--                      E' il caso storico e la stragrande maggioranza, quindi
--                      nessun backfill: le righe esistenti sono gia' corrette.
--   valorizzata     -> utenza "incaricato" su quella partita IVA.
-- Mappa 1:1 sul tipo AdeUtenza in src/lib/ade/types.ts.
--
-- Perche' NON anche una colonna `utenza_tipo`: i rami `delega` e `tutore` del
-- wizard non sono mai stati osservati (HAR.md 18.6) e costruire una colonna
-- per un caso ipotetico e' esattamente cio' che i principi guida vietano.
-- Quando arriveranno, `utenza_tipo` nullable e' una migrazione additiva a
-- rischio zero che deriva il default da questa colonna.
--
-- Perche' NON persistiamo il payload opaco che il portale pretende
-- (`incaricante`, una stringa JSON annidata): e' una struttura del portale che
-- puo' cambiare sotto di noi, e conservarla renderebbe invisibile un incarico
-- revocato. Si risolve a ogni login cercando questa P.IVA nella lista viva di
-- wizardTemplate, e se non c'e' piu' il login stesso lo scopre.

ALTER TABLE ade_credentials
  ADD COLUMN IF NOT EXISTS utenza_piva text;

-- CHECK: 11 cifre esatte, la forma di una partita IVA italiana. Difesa in
-- profondita' come i limiti della 0019 — la validazione applicativa resta la
-- prima linea, il vincolo DB e' la rete per import e script che la bypassano.
-- Passa automaticamente su NULL: vincola solo i valori presenti.
-- DO block su pg_constraint -> idempotente al re-run del runner.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ade_credentials_utenza_piva_format_check') THEN
    ALTER TABLE ade_credentials
      ADD CONSTRAINT ade_credentials_utenza_piva_format_check CHECK (utenza_piva ~ '^[0-9]{11}$');
  END IF;
END $$;
