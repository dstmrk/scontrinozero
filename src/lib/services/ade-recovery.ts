/**
 * Soglia oltre la quale un documento commerciale PENDING/ERROR è
 * considerato "stale" e può entrare nel recovery path (re-submit ad AdE).
 *
 * Default: 30 min. Override via env `STALE_PENDING_THRESHOLD_MINUTES`
 * (utile per i test di integrazione che non vogliono aspettare 30 min).
 *
 * Condiviso fra receipt-service e void-service per evitare drift: la
 * soglia governa lo stesso trade-off (collision window vs UX di retry) in
 * entrambi i flussi. Un drift potrebbe lasciare la sale recovery più
 * aggressiva del void recovery (o viceversa) per errore di copia.
 *
 * NB: la soluzione corretta al collision-window problem è il lookup AdE
 * pre-retry via `searchDocuments` (vedi `ricerca_documento.har`); la
 * soglia temporale è una mitigation finché quel lookup non viene
 * implementato — tracciato nel backlog.
 */
export function getStalePendingThresholdMs(): number {
  const raw = process.env.STALE_PENDING_THRESHOLD_MINUTES;
  const minutes = raw ? Number.parseFloat(raw) : Number.NaN;
  const effective = Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
  return effective * 60 * 1000;
}
