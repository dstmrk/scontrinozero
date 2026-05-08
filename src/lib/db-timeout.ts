import { sql } from "drizzle-orm";
import { getDb } from "@/db";

type DrizzleDb = ReturnType<typeof getDb>;
type DrizzleTx = Parameters<Parameters<DrizzleDb["transaction"]>[0]>[0];

/**
 * Esegue `fn` dentro una transazione preceduta da
 * `SET LOCAL statement_timeout = <ms>`.
 *
 * Pattern già provato nella readiness probe (`/api/health/ready`):
 * Postgres aborta lo statement con error code `57014` se eccede il budget e
 * recupera la connessione dal pool. `SET LOCAL` resta scoped alla transazione
 * — sicuro anche con il transaction pooler di Supabase, dove le sessioni non
 * sono persistenti tra transazioni.
 *
 * `timeoutMs` deve essere un intero positivo: Postgres rifiuta valori non
 * interi e un valore <= 0 disabiliterebbe il timeout — bug più che feature.
 *
 * Drizzle non propaga `AbortSignal` attraverso il query builder, perciò
 * `SET LOCAL statement_timeout` è l'unico meccanismo affidabile per imporre
 * un budget di latenza dal lato applicativo.
 */
export async function withStatementTimeout<T>(
  timeoutMs: number,
  fn: (tx: DrizzleTx) => Promise<T>,
): Promise<T> {
  if (!Number.isInteger(timeoutMs)) {
    throw new TypeError(
      `withStatementTimeout: timeoutMs must be an integer, got ${timeoutMs}`,
    );
  }
  if (timeoutMs <= 0) {
    throw new RangeError(
      `withStatementTimeout: timeoutMs must be positive, got ${timeoutMs}`,
    );
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    // sql.raw è sicuro qui: timeoutMs è un intero validato sopra, non
    // c'è nessun input utente nella query.
    await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${timeoutMs}`));
    return fn(tx);
  });
}
