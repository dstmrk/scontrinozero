import { formatRomeDay } from "@/server/analytics-helpers";

/**
 * Default range "ultimi 7 giorni" per la pagina storico, ancorato al
 * calendario Europe/Rome. Tra mezzanotte UTC e l'1/2 di mattino italiano
 * (CET/CEST) il default basato su `toISOString().split('T')[0]` cadrebbe
 * sul giorno UTC precedente, mostrando filtri sfalsati di un giorno.
 *
 * Restituisce due stringhe yyyy-MM-dd: `dateTo` = oggi (Rome), `dateFrom`
 * = oggi - 6 giorni (Rome). 6 + 1 = 7 giorni inclusivi.
 */
export function defaultLast7DaysRomeRange(now: Date = new Date()): {
  dateFrom: string;
  dateTo: string;
} {
  const dateTo = formatRomeDay(now);
  // Aritmetica UTC sulla data nominale (a noon per evitare DST edge cases):
  // `formatRomeDay` di un instant a mezzogiorno UTC di un giorno qualunque
  // restituisce sempre quello stesso giorno calendar Rome.
  const noonUtc = new Date(`${dateTo}T12:00:00Z`);
  noonUtc.setUTCDate(noonUtc.getUTCDate() - 6);
  const dateFrom = formatRomeDay(noonUtc);
  return { dateFrom, dateTo };
}
