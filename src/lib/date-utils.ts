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

/**
 * Parses an ISO YYYY-MM-DD string to a UTC-midnight Date.
 * Returns null for invalid format or impossible dates (e.g. 2026-02-31).
 * Round-trip check: parsed year/month/day must equal input to catch JS Date
 * normalisation of out-of-range values like month 13 or Feb 31.
 */
export function parseStrictIsoDateUtc(str: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const parts = str.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() + 1 !== month ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d;
}
