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
