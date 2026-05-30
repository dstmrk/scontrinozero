import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocuments } from "@/db/schema";

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

/**
 * Tenta di "rivendicare" (claim) un documento stale PENDING/ERROR prima di
 * rieseguire la submit ad AdE, per serializzare due retry concorrenti oltre la
 * soglia stale (P1.3).
 *
 * CAS ottimistico su `updated_at`: l'UPDATE matcha solo se `updated_at` coincide
 * ancora con lo snapshot osservato e lo stato è PENDING/ERROR, bumpando
 * `updated_at`. Il primo retry vince (ritorna `true`); ogni retry concorrente
 * con lo stesso snapshot matcha 0 righe (ritorna `false`) e deve rispondere
 * in-progress invece di ri-sottomettere (che creerebbe un documento fiscale
 * duplicato su AdE, irreversibile).
 *
 * Pool-safe: nessun lock DB tenuto durante la HTTP AdE (2-5s), a differenza di
 * `pg_advisory_xact_lock` / `SELECT ... FOR UPDATE`.
 *
 * NB: lo snapshot è confrontato come ISO string + `::timestamptz` con
 * `date_trunc('milliseconds', ...)`: dentro un raw `sql` template Drizzle non
 * ha il column-type context per bindare una JS Date (crash `Buffer.byteLength`
 * in postgres-js) e il default `NOW()` ha precisione al microsecondo mentre la
 * JS Date è al millisecondo (stesso pattern di `verifyAdeCredentials`).
 */
export async function claimStaleDocument(
  db: ReturnType<typeof getDb>,
  documentId: string,
  observedUpdatedAt: Date,
): Promise<boolean> {
  const claimed = await db
    .update(commercialDocuments)
    .set({ updatedAt: new Date() })
    .where(
      and(
        eq(commercialDocuments.id, documentId),
        inArray(commercialDocuments.status, ["PENDING", "ERROR"]),
        sql`date_trunc('milliseconds', ${commercialDocuments.updatedAt}) = ${observedUpdatedAt.toISOString()}::timestamptz`,
      ),
    )
    .returning({ id: commercialDocuments.id });
  return claimed.length === 1;
}
