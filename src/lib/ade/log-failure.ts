import { logger } from "@/lib/logger";
import { isTransientAdeError } from "./error-messages";

/**
 * Logga un errore AdE-side con il livello corretto.
 *
 * - Transient (network, SPID timeout, AdE 5xx via `isTransientAdeError`)
 *   → `logger.warn` con `errorClass: "ade_transient"`. NON triggera
 *   Sentry capture (logger.ts hook a riga 136 cattura solo `level >= 50`),
 *   evitando ~100 issue Sentry identiche durante un downtime AdE.
 * - Non transient → `logger.error` con `errorClass: "ade_failure"`.
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
  const transient = isTransientAdeError(err);
  const payload = {
    err,
    ...context,
    errorClass: transient ? "ade_transient" : "ade_failure",
  };
  if (transient) {
    logger.warn(payload, messages.transient);
  } else {
    logger.error(payload, messages.failure);
  }
}
