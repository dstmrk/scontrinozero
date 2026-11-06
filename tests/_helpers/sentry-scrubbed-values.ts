/**
 * Sottostringhe per cui lo scrubbing lato server di Sentry censura un VALORE
 * (non solo una chiave) con `[Filtered]`, confronto case-insensitive. Fonte:
 * https://docs.sentry.io/security-legal-pii/scrubbing/server-side-scrubbing/
 *
 * Un attributo di log che deve restare leggibile su Sentry Logs non può
 * contenerne nessuna: `INVALID_CREDENTIALS` e `auth_error` arrivano censurati.
 */
const SENTRY_SCRUBBED_VALUE_SUBSTRINGS = [
  "password",
  "secret",
  "passwd",
  "api_key",
  "apikey",
  "auth",
  "credentials",
  "mysql_pwd",
  "privatekey",
  "private_key",
  "token",
  "bearer",
] as const;

export function isScrubbedBySentry(value: string): boolean {
  const lower = value.toLowerCase();
  return SENTRY_SCRUBBED_VALUE_SUBSTRINGS.some((s) => lower.includes(s));
}
