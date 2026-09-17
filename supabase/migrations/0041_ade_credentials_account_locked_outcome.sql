-- Migration 0041: `account_locked` nel vocabolario degli esiti di verifica AdE
--
-- Evidenza (produzione, 17/09/2026): un esercente in onboarding riceveva
-- `401 {"details":"ACCOUNT_LOCKED"}` dall'AdE. Il client collassava tutto cio'
-- che non era `PASSWORD_EXPIRED` in `AdeAuthError`, quindi a schermo leggeva
-- "Credenziali Fisconline non valide. Verifica codice fiscale, password e PIN"
-- su credenziali **corrette**, e le ha riscritte tre volte prima di scrivere
-- all'assistenza.
--
-- Ora il caso ha la sua classe (`AdeAccountLockedError`) e il suo messaggio.
-- Questa migrazione gli da' il suo posto nel vocabolario: `auth_error` e
-- `account_locked` sono due problemi di prodotto diversi con due rimedi
-- opposti — nel primo si ricontrollano i campi, nel secondo si sblocca
-- l'utenza sul portale e ricontrollare i campi e' esattamente cio' che NON
-- serve. Tenerli nello stesso bucket rifarebbe il buco di attribuzione che la
-- 0038 e' nata per chiudere (REVIEW.md #107).
--
-- La 0038 aveva gia' messo in conto questo costo: "una classe d'errore nuova
-- richiede una migrazione additiva".

-- DROP + ADD invece del guard su `pg_constraint` della 0038: qui il vincolo
-- ESISTE gia' e va sostituito, quindi un `IF NOT EXISTS` non farebbe nulla e
-- lascerebbe il vocabolario vecchio in piedi. `DROP ... IF EXISTS` seguito da
-- `ADD` e' idempotente per costruzione e non serve leggere la definizione
-- corrente per sapere a che punto siamo.
--
-- Nessun rischio sui dati: l'elenco e' un soprainsieme del precedente, quindi
-- nessuna riga gia' scritta puo' violare il vincolo nuovo.
ALTER TABLE ade_credentials
  DROP CONSTRAINT IF EXISTS ade_credentials_last_verify_outcome_check;

ALTER TABLE ade_credentials
  ADD CONSTRAINT ade_credentials_last_verify_outcome_check
  CHECK (last_verify_outcome IN (
    'success',
    'auth_error',
    'account_locked',
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
