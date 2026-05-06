/**
 * Centralised user-facing error messages.
 *
 * All UI/server actions/API routes pull their copy from this dictionary so
 * that future i18n or copy tweaks happen in one place. Drift between flows
 * (e.g. "Password non sicura" vs "La nuova password non è sicura") is the
 * exact reason this file exists.
 *
 * Nota: il messaggio CAP sta in `@/lib/validation` (`ITALIAN_ZIP_MESSAGE`)
 * insieme alla regex e allo schema Zod. Non duplichiamo qui per evitare
 * cross-module circular imports nei test.
 */

export const PASSWORD_REQUIREMENTS_MESSAGE =
  "Almeno 8 caratteri con maiuscola, minuscola, numero e carattere speciale.";

export const ERROR_MESSAGES = {
  /** Rate-limit window misurata in minuti (form auth/profile interattivi). */
  RATE_LIMIT_AUTH_MINUTES: "Troppi tentativi. Riprova tra qualche minuto.",
  /** Rate-limit window misurata in ore (Developer API pubblica). */
  RATE_LIMIT_API_HOURS: "Troppe richieste. Riprova tra qualche ora.",
  /** Rate-limit window per PDF pubblico (per-IP, finestra 1h). */
  RATE_LIMIT_PUBLIC_MINUTES: "Troppe richieste. Riprova tra qualche minuto.",
  PASSWORD_NOT_STRONG: `Password non sicura. ${PASSWORD_REQUIREMENTS_MESSAGE}`,
  NEW_PASSWORD_NOT_STRONG: `La nuova password non è sicura. ${PASSWORD_REQUIREMENTS_MESSAGE}`,
  PASSWORDS_MISMATCH: "Le password non coincidono.",
  UNAUTHORIZED: "Non autorizzato.",
} as const;

export type ErrorMessageKey = keyof typeof ERROR_MESSAGES;
