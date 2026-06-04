import { logger } from "@/lib/logger";
import { isExpectedUserAdeError, isTransientAdeError } from "./error-messages";

/**
 * Logga un errore AdE-side con il livello corretto. Tre rami, in
 * ordine di valutazione:
 *
 * - **User error** (`isExpectedUserAdeError`: AdeAuthError,
 *   AdePasswordExpiredError) → `logger.warn` con
 *   `errorClass: "ade_user_error"`, messaggio `messages.failure`. Sono
 *   errori d'input utente prevedibili (credenziali sbagliate, password
 *   scaduta), non bug nostri: come "password sbagliata" su `/login` non
 *   devono salire a Sentry. Storico: SCONTRINOZERO-7 ha collezionato 23
 *   eventi in 5 settimane prima di essere archiviata come noise. Regola
 *   21 di `CLAUDE.md`.
 * - **Transient** (`isTransientAdeError`: network, SPID timeout, AdE 5xx)
 *   → `logger.warn` con `errorClass: "ade_transient"`, messaggio
 *   `messages.transient`. Durante un downtime AdE da 100 utenti
 *   eviterebbe ~100 issue Sentry identiche e non actionable per noi.
 * - **Failure** (tutto il resto) → `logger.error` con
 *   `errorClass: "ade_failure"`, messaggio `messages.failure`. È il solo
 *   ramo che triggera Sentry capture (logger.ts hook a riga 136 cattura
 *   solo `level >= 50`).
 *
 * Mai estrarre i metodi pino in una variabile (`const fn = logger.warn`):
 * pino li dispatcha tramite `this`-binding (accesso a `this.level`,
 * `this.bindings`, ...) e una chiamata unbound crasha dentro il catch,
 * mascherando l'errore AdE originale e impedendo l'update DB di
 * conseguenza. Qui usiamo sempre `logger.warn(...)` / `logger.error(...)`
 * direttamente.
 */
export function logAdeFailure(
  err: unknown,
  context: Record<string, unknown>,
  messages: { transient: string; failure: string },
): void {
  if (isExpectedUserAdeError(err)) {
    logger.warn(
      { err, ...context, errorClass: "ade_user_error" },
      messages.failure,
    );
    return;
  }
  if (isTransientAdeError(err)) {
    logger.warn(
      { err, ...context, errorClass: "ade_transient" },
      messages.transient,
    );
    return;
  }
  logger.error(
    { err, ...context, errorClass: "ade_failure" },
    messages.failure,
  );
}
