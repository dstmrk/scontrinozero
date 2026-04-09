/**
 * Date utilities for fiscal/tax-compliant date formatting.
 *
 * Fiscal dates sent to the Agenzia delle Entrate must reflect the local
 * calendar day in the Italian fiscal timezone (Europe/Rome), not UTC.
 * Near midnight UTC the two timezones can differ by one calendar day, which
 * would produce an incorrect document date on AdE.
 */

/**
 * Returns the current date (or the given date) as `YYYY-MM-DD` in the
 * specified IANA timezone.
 *
 * @param date - The instant to format. Defaults to `new Date()` (now).
 * @param tz   - IANA timezone identifier. Defaults to `"Europe/Rome"`.
 */
export function getFiscalDate(
  date: Date = new Date(),
  tz = "Europe/Rome",
): string {
  // sv-SE locale uses ISO 8601 date format (YYYY-MM-DD) natively.
  return new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(date);
}
