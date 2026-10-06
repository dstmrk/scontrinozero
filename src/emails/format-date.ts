// Module-scope: costruire un Intl.DateTimeFormat è costoso, le opzioni sono
// costanti. Il fuso è esplicito perché il container gira in UTC: senza, una
// data calcolata dopo le 22 UTC finirebbe nell'email col giorno precedente.
const emailDateFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Data in prosa per il corpo delle email, es. "7 luglio 2026". */
export function formatEmailDate(date: Date): string {
  return emailDateFormatter.format(date);
}
