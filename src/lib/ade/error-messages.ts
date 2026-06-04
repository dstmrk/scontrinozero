import {
  AdeAuthError,
  AdeNetworkError,
  AdePasswordExpiredError,
  AdePortalError,
  AdeSpidTimeoutError,
} from "./errors";

export type UserFacingAdeError = {
  message: string;
  passwordExpired?: boolean;
};

/**
 * Maps an AdE-side error to a message the end user can act on.
 *
 * The default catch sites used to return the same generic "verifica
 * credenziali" string for every failure mode, which misleads users when the
 * AdE portal itself is temporarily down (5xx) — they assume their CF /
 * password / PIN are wrong and either retry the same data or abandon the
 * onboarding. This helper distinguishes the cases that map to actionable,
 * non-blaming messages and leaves everything else to the caller's fallback.
 */
export function getUserFacingAdeErrorMessage(
  err: unknown,
  fallback: string,
): UserFacingAdeError {
  if (err instanceof AdePasswordExpiredError) {
    return {
      message: "La password Fisconline è scaduta.",
      passwordExpired: true,
    };
  }
  if (err instanceof AdeAuthError) {
    return {
      message:
        "Credenziali Fisconline non valide. Verifica codice fiscale, password e PIN.",
    };
  }
  if (err instanceof AdeNetworkError) {
    return {
      message:
        "Il portale Agenzia delle Entrate Fatture e Corrispettivi non è raggiungibile al momento. Non dipende da te né da ScontrinoZero. Riprova tra qualche minuto.",
    };
  }
  if (err instanceof AdePortalError && err.statusCode >= 500) {
    return {
      message:
        "Il portale Agenzia delle Entrate Fatture e Corrispettivi non risponde al momento. Non dipende da te né da ScontrinoZero. Riprova tra qualche minuto.",
    };
  }
  if (err instanceof AdeSpidTimeoutError) {
    return {
      message: "Non hai approvato la richiesta SPID in tempo. Riprova.",
    };
  }
  return { message: fallback };
}

/**
 * Ritorna true se l'errore è una condizione transient su cui ScontrinoZero
 * non può fare nulla (downtime AdE, rete, SPID timeout).
 *
 * Usato dai catch site dei servizi AdE per decidere il log level: i
 * transient vanno loggati a `warn` (non `error`) per non aprire issue
 * Sentry spurie. Durante un downtime AdE da 100 utenti riceveremmo ~100
 * issue identiche e non actionable per noi — il logger.ts hook a livello
 * 50 (error) le farebbe scattare. Coerente con il downgrade di
 * `esito:false` (rifiuto business AdE) a `warn` fatto in 8c654b5.
 */
export function isTransientAdeError(err: unknown): boolean {
  if (err instanceof AdeNetworkError) return true;
  if (err instanceof AdeSpidTimeoutError) return true;
  if (err instanceof AdePortalError && err.statusCode >= 500) return true;
  return false;
}

/**
 * Ritorna true se l'errore è un caso prevedibile di **input utente
 * invalido** (credenziali Fisconline sbagliate, password scaduta che
 * l'utente deve ruotare sul portale AdE). Non è un bug del nostro
 * sistema più di quanto lo sia "password sbagliata" su `/login`.
 *
 * Conseguenza per il logging: come per `isTransientAdeError`, va
 * loggato a `warn` (non `error`) — niente issue Sentry. Storico:
 * SCONTRINOZERO-7 ha accumulato 23 eventi in 5 settimane prima di
 * essere archiviata come noise perché tutte le auth-failure salivano
 * a Sentry come issue. Regola 21 di `CLAUDE.md`.
 */
export function isExpectedUserAdeError(err: unknown): boolean {
  if (err instanceof AdeAuthError) return true;
  if (err instanceof AdePasswordExpiredError) return true;
  return false;
}
