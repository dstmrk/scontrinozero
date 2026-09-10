/**
 * Ordinamento canonico dell'elenco storico quando le righe arrivano da due
 * sorgenti: il nostro database e l'archivio AdE.
 *
 * Vive in un modulo suo perché lo applicano **due** superfici — l'elenco a
 * schermo (`storico-actions.ts`) e l'export CSV di riepilogo
 * (`csv-export.ts`) — e due regole diverse si noterebbero: lo stesso periodo
 * darebbe a schermo un ordine e nel file un altro, sulle stesse righe.
 *
 * Puro e client-safe: nessun import di database.
 */

/** Il minimo che serve per collocare una riga nell'ordine. */
export type StoricoOrderKey = {
  readonly adeRegisteredAt: Date;
  readonly origin: "local" | "ade";
  /**
   * Chiave secondaria **dentro** una sorgente: l'UUID per le righe nostre,
   * l'`idtrx` per quelle AdE. Non si confrontano mai fra sorgenti diverse —
   * ci pensa `origin`.
   */
  readonly sortId: string;
};

/**
 * Più recenti prima, con un ordine **totale**: a parità di `ade_registered_at`
 * — normalissima in cassa — un ordine indeciso fa comparire una riga due volte
 * e sparire un'altra mentre si naviga fra le pagine.
 *
 * A parità di istante vengono prima le righe AdE. È una convenzione, non una
 * verità: serve solo a essere la **stessa** ovunque. Confrontare un UUID
 * nostro con un `idtrx` del portale non significherebbe niente, quindi la
 * sorgente decide prima che i due alfabeti si incontrino.
 */
export function compareStoricoOrder(
  a: StoricoOrderKey,
  b: StoricoOrderKey,
): number {
  const byDate = b.adeRegisteredAt.getTime() - a.adeRegisteredAt.getTime();
  if (byDate !== 0) return byDate;

  if (a.origin !== b.origin) return a.origin === "ade" ? -1 : 1;

  if (a.sortId === b.sortId) return 0;
  return a.sortId < b.sortId ? 1 : -1;
}
