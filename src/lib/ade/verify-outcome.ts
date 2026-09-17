import {
  AdeAccountLockedError,
  AdeAuthError,
  AdeNoPartitaIvaError,
  AdePasswordExpiredError,
  AdeReauthRequiredError,
  AdeUtenzaNotAvailableError,
  AdeUtenzaSelectionRequiredError,
} from "./errors";
import { isTransientAdeError } from "./error-messages";

/**
 * Vocabolario chiuso degli esiti registrati su `ade_credentials`
 * (`last_verify_outcome`, migrazione 0038). **Deve restare allineato al CHECK
 * della 0038**: è il DB ad avere l'ultima parola, e un valore fuori elenco fa
 * fallire la UPDATE.
 *
 * Perché esiste (REVIEW.md #107): dieci righe su ventidue si fermano a metà
 * onboarding e condividono lo stesso stato DB — `verified_at IS NULL` +
 * `businesses.fiscal_code IS NULL` — qualunque sia la causa. Credenziali
 * sbagliate, abbandono puro e utenza non supportata sono tre problemi di
 * prodotto diversi, con tre rimedi diversi, e finora erano indistinguibili.
 * L'informazione c'era già tutta a runtime: moriva in un messaggio a schermo.
 *
 * Perché non i Sentry Logs: campionano e scartano (misurato, REVIEW.md #106),
 * quindi non reggono un conteggio. Questa colonna si interroga con un
 * `GROUP BY` ed è esatta.
 *
 * Mappa ramo d'uscita -> valore:
 *  - `success`                    verifica completata, `verified_at` scritto.
 *  - `auth_error`                 AdeAuthError: credenziali rifiutate.
 *  - `account_locked`             AdeAccountLockedError: utenza bloccata
 *                                 dall'AdE. Separato da `auth_error` perche'
 *                                 il rimedio e' opposto — le credenziali sono
 *                                 giuste e riscriverle non sblocca niente.
 *  - `password_expired`           AdePasswordExpiredError.
 *  - `utenza_selection_required`  picker mostrato: si è fermato DAVANTI
 *                                 alla scelta, non davanti a un errore.
 *  - `utenza_not_available`       incarico revocato, o business già
 *                                 collegato le cui P.IVA non sono più
 *                                 raggiungibili.
 *  - `utenza_locked`              scelta rifiutata su business già collegato.
 *  - `no_partita_iva`             AdeNoPartitaIvaError (SCONTRINOZERO-13).
 *  - `reauth_required`            sessione interattiva CIE/SPID da rifare.
 *  - `piva_mismatch`              identity guard: credenziali di un'altra P.IVA.
 *  - `piva_conflict`              UNIQUE anti-abuso trial: P.IVA già altrove.
 *  - `identity_unconfirmed`       getFiscalData muto su business onboardato.
 *  - `incomplete_credentials`     riga incompleta per il metodo, o SPID.
 *  - `invalid_utenza_piva`        P.IVA malformata al boundary (regola 9).
 *  - `credentials_changed`        lock ottimistico perso durante la verifica.
 *  - `finalize_failed`            AdE ok, scrittura DB fallita.
 *  - `transient`                  rete, 5xx, timeout push.
 *  - `failure`                    tutto il resto, per non restare muti.
 *  - `unknown_pre_tracking`       righe precedenti alla 0038, solo backfill.
 *
 * Fuori elenco per scelta: rate limit, ownership e sessione assente. Sono gate
 * d'accesso, non cause di abbandono, e scriverli sovrascriverebbe un esito
 * informativo con rumore.
 */
export const RECORDED_VERIFY_OUTCOMES = [
  "success",
  "auth_error",
  "account_locked",
  "password_expired",
  "utenza_selection_required",
  "utenza_not_available",
  "utenza_locked",
  "no_partita_iva",
  "reauth_required",
  "piva_mismatch",
  "piva_conflict",
  "identity_unconfirmed",
  "incomplete_credentials",
  "invalid_utenza_piva",
  "credentials_changed",
  "finalize_failed",
  "transient",
  "failure",
  "unknown_pre_tracking",
] as const;

export type RecordedVerifyOutcome = (typeof RECORDED_VERIFY_OUTCOMES)[number];

/**
 * Traduce l'errore di login nel valore di vocabolario corrispondente. Le classi
 * d'errore AdE distinguono già i casi: qui si smette solo di buttare via
 * quella distinzione.
 *
 * `AdePasswordExpiredError` prima di `AdeAuthError` per leggibilità: oggi non
 * sono in relazione di ereditarieta', ma l'ordine esplicito sopravvive a un
 * refactor che le mettesse in gerarchia.
 */
export function classifyAdeLoginFailure(err: unknown): RecordedVerifyOutcome {
  if (err instanceof AdePasswordExpiredError) return "password_expired";
  if (err instanceof AdeAccountLockedError) return "account_locked";
  if (err instanceof AdeAuthError) return "auth_error";
  if (err instanceof AdeUtenzaSelectionRequiredError)
    return "utenza_selection_required";
  if (err instanceof AdeUtenzaNotAvailableError) return "utenza_not_available";
  if (err instanceof AdeNoPartitaIvaError) return "no_partita_iva";
  if (err instanceof AdeReauthRequiredError) return "reauth_required";
  if (isTransientAdeError(err)) return "transient";
  return "failure";
}
