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

// Module-scope: opzioni costanti, sv-SE per output ISO-style senza AM/PM.
const romeWallClockFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * Data e ora in ora italiana, separate.
 *
 * `romeWallClockFormatter` (sv-SE) rende "YYYY-MM-DD HH:mm:ss": la data va
 * riordinata in `DD/MM/YYYY`, l'ora si prende com'e'. Sono due funzioni e non
 * una perche' il CSV le vuole in due colonne — un timestamp unico in una cella
 * sola non e' ordinabile ne' filtrabile in un foglio di calcolo.
 */
export function formatRomeDate(date: Date): string {
  const [isoDay] = romeWallClockFormatter.format(date).split(" ");
  const [year, month, day] = isoDay.split("-");
  return `${day}/${month}/${year}`;
}

/** Ora italiana `HH:mm:ss`. Secondi inclusi: e' la precisione fiscale. */
export function formatRomeTime(date: Date): string {
  return romeWallClockFormatter.format(date).split(" ")[1];
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

/**
 * Offset di Europe/Rome, in millisecondi, all'istante dato.
 * Il wall-clock romano viene letto come se fosse UTC e confrontato con
 * l'istante reale: la differenza è l'offset in vigore in quel momento
 * (+01:00 CET o +02:00 CEST).
 */
function romeOffsetMs(instant: Date): number {
  const wall = romeWallClockFormatter.format(instant); // "2026-05-19 14:34:56"
  return new Date(wall.replace(" ", "T") + "Z").getTime() - instant.getTime();
}

/**
 * Converte `yyyy-MM-dd` nell'istante UTC in cui inizia quel giorno **a Roma**.
 *
 * Serve ai filtri di periodo: la giornata fiscale è quella italiana, non
 * quella UTC. Con la mezzanotte UTC come confine, uno scontrino registrato il
 * 1° gennaio alle 00:30 italiane (23:30 UTC del 31/12) resterebbe fuori dal
 * filtro di gennaio pur essendo mostrato con data 01/01.
 *
 * Due passate: la prima stima l'offset alla mezzanotte UTC del giorno, la
 * seconda lo rilegge all'istante stimato. Servono entrambe perché nei giorni
 * di transizione DST l'offset del punto di partenza può non essere quello del
 * punto d'arrivo.
 *
 * Ritorna `null` sugli stessi input che `parseStrictIsoDateUtc` rifiuta.
 */
export function parseRomeDayStartUtc(str: string): Date | null {
  const naiveUtcMidnight = parseStrictIsoDateUtc(str);
  if (!naiveUtcMidnight) return null;

  const firstGuess = new Date(
    naiveUtcMidnight.getTime() - romeOffsetMs(naiveUtcMidnight),
  );
  return new Date(naiveUtcMidnight.getTime() - romeOffsetMs(firstGuess));
}

/**
 * Converte `yyyy-MM-dd` nell'istante UTC che **chiude** quel giorno a Roma,
 * come estremo superiore esclusivo (`< end`): l'inizio del giorno successivo.
 *
 * ⚠️ Non si ricava sommando 24h all'inizio giornata: nei due giorni di
 * transizione DST la giornata italiana dura 23 o 25 ore. Il giorno successivo
 * si calcola sul calendario (dove l'aritmetica è esatta) e solo dopo si
 * converte in istante.
 */
export function parseRomeDayEndExclusiveUtc(str: string): Date | null {
  const naiveUtcMidnight = parseStrictIsoDateUtc(str);
  if (!naiveUtcMidnight) return null;

  const nextDay = new Date(naiveUtcMidnight);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return parseRomeDayStartUtc(nextDay.toISOString().slice(0, 10));
}
