-- Migration 0038: esito dell'ultimo tentativo di verifica AdE
-- Evidenza: REVIEW.md #107 (10 righe `ade_credentials` su 22 ferme a meta'
-- onboarding, una sola attribuibile), REVIEW.md #106 (perche' la stessa
-- domanda non si puo' fare a Sentry).
--
-- Il problema e' di **attribuzione**, non di correttezza: credenziali
-- sbagliate, abbandono puro e utenza non supportata finiscono tutti nello
-- stesso stato DB (`verified_at IS NULL` + `businesses.fiscal_code IS NULL`),
-- quindi il collo di bottiglia dell'attivazione si vede ma non si spiega.
-- L'informazione esiste gia' a runtime — `attemptAdeLoginForVerification`
-- distingue sette classi d'errore diverse — e finora moriva in un messaggio a
-- schermo e in una riga di log. I Sentry Logs non sono una risposta: campionano
-- e scartano (misurato il 16/09/2026, REVIEW.md #106), quindi qualunque
-- conteggio basato su di essi e' inaffidabile. Una colonna sul DB e' l'unica
-- fonte deterministica.
--
-- Tre colonne:
--   last_verify_outcome  vocabolario chiuso, MAI il messaggio d'errore.
--   last_verify_at       quando il tentativo registrato e' avvenuto.
--   verify_attempts      quanti tentativi registrati in totale.
--
-- Perche' anche il contatore: separa "ha provato una volta e ha mollato" da
-- "ci ha sbattuto la testa dieci volte". Sono due problemi di prodotto
-- opposti — il primo e' un messaggio poco chiaro, il secondo un blocco vero —
-- e senza il contatore l'ultimo esito da solo li confonde.
--
-- Perche' un vocabolario e non il testo dell'errore: il messaggio utente
-- contiene gia' oggi frasi costruite sul metodo di accesso e domani potrebbe
-- contenere dati del portale. Qui serve raggruppare, non leggere: un `GROUP BY`
-- su testo libero non e' un breakdown, e' un elenco. Il CHECK sotto e' quindi
-- parte del contratto, non decorazione.
--
-- Cosa NON viene scritto qui: rate limit, ownership e sessione assente. Sono
-- gate d'accesso, non cause di abbandono, e registrarli sovrascriverebbe un
-- esito piu' informativo con rumore.

-- Le due colonne senza backfill: `IF NOT EXISTS` basta.
ALTER TABLE ade_credentials
  ADD COLUMN IF NOT EXISTS last_verify_at timestamptz;

-- NOT NULL con DEFAULT su tabella popolata: da PG 11 non riscrive le righe.
ALTER TABLE ade_credentials
  ADD COLUMN IF NOT EXISTS verify_attempts integer NOT NULL DEFAULT 0;

-- La colonna con il backfill vive in un DO block invece che in un
-- `ADD COLUMN IF NOT EXISTS` + `UPDATE`, e il motivo e' l'idempotenza: un
-- UPDATE guardato da `WHERE last_verify_outcome IS NULL` marcherebbe
-- 'unknown_pre_tracking' anche le righe NUOVE — quelle create dopo la
-- migrazione, dove NULL significa "mai tentato" — se il runner ripassasse di
-- qui. Legando il backfill alla **creazione** della colonna, gira una volta
-- sola per costruzione.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ade_credentials' AND column_name = 'last_verify_outcome'
  ) THEN
    ALTER TABLE ade_credentials ADD COLUMN last_verify_outcome text;

    -- Le righe gia' verificate hanno un esito noto e vero: l'ultima verifica e'
    -- riuscita, e sappiamo quando. Non e' una supposizione, e' `verified_at`.
    --
    -- `verify_attempts = 1` e' invece un **pavimento**, non un conteggio: chi
    -- ha sbagliato la password tre volte prima di riuscirci resta a 1. Lo zero
    -- sarebbe peggio — contraddirebbe l'esito accanto, che dice che un
    -- tentativo c'e' stato — ma nessuna analisi sulla frequenza dei tentativi
    -- deve includere le righe anteriori alla 0038.
    UPDATE ade_credentials
      SET last_verify_outcome = 'success',
          last_verify_at = verified_at,
          verify_attempts = 1
      WHERE verified_at IS NOT NULL;

    -- Tutte le altre: non sappiamo se hanno mai tentato. Marcarle esplicitamente
    -- e' cio' che rende NULL inequivocabile da domani ("mai tentato") invece di
    -- un secondo modo per dire "non lo so". Le 10 righe ferme di oggi restano
    -- non attribuibili: il contatore parte da adesso, non recupera lo storico.
    UPDATE ade_credentials
      SET last_verify_outcome = 'unknown_pre_tracking'
      WHERE verified_at IS NULL;
  END IF;
END $$;

-- Vocabolario chiuso (idempotente via guard su pg_constraint, come la 0027).
-- Ogni valore mappa 1:1 su un ramo di uscita di verifyAdeCredentials; l'indice
-- ramo -> valore vive nel commento di RECORDED_VERIFY_OUTCOMES in
-- src/server/onboarding-actions.ts.
--
-- Il costo del CHECK e' che una classe d'errore nuova richiede una migrazione
-- additiva. E' accettabile perche' la scrittura dell'esito e' best-effort: un
-- valore fuori vocabolario fa fallire quella UPDATE e basta — l'onboarding
-- prosegue, si perde una riga di telemetria, non un collegamento.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ade_credentials_last_verify_outcome_check'
  ) THEN
    ALTER TABLE ade_credentials
      ADD CONSTRAINT ade_credentials_last_verify_outcome_check
      CHECK (last_verify_outcome IN (
        'success',
        'auth_error',
        'password_expired',
        'utenza_selection_required',
        'utenza_not_available',
        'utenza_locked',
        'no_partita_iva',
        'reauth_required',
        'piva_mismatch',
        'piva_conflict',
        'identity_unconfirmed',
        'incomplete_credentials',
        'invalid_utenza_piva',
        'credentials_changed',
        'finalize_failed',
        'transient',
        'failure',
        'unknown_pre_tracking'
      ));
  END IF;
END $$;

-- Indice parziale sulle sole righe ferme: e' la popolazione che il pannello
-- operatore interroga (conteggio per causa ed eta'), ed e' una frazione della
-- tabella. Sulle righe verificate — la maggioranza, e in crescita — non paga
-- nulla ne' in spazio ne' in scrittura.
CREATE INDEX IF NOT EXISTS ade_credentials_unverified_outcome_idx
  ON ade_credentials (last_verify_outcome, created_at)
  WHERE verified_at IS NULL;
