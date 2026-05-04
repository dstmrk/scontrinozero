import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const DB_PING_TIMEOUT_MS = 1500;
// Grace margin for the JS-side race: only fires if even the SET LOCAL itself
// is hung (e.g. TCP-level stall before Postgres can apply the timeout).
const JS_RACE_TIMEOUT_MS = DB_PING_TIMEOUT_MS + 500;

/**
 * Readiness probe: returns 200 only when the process can serve traffic — i.e.
 * the DB is reachable. Used by an orchestrator to decide whether to send
 * requests to this instance.
 *
 * Liveness vs readiness:
 * - `/api/health/live` (and the legacy `/api/health` alias) → process up.
 * - `/api/health/ready` → DB reachable. A failed DB ping returns 503 so the
 *   instance is taken out of rotation without being restarted.
 *
 * Cancellation:
 * Wrapping the ping in a transaction with `SET LOCAL statement_timeout` makes
 * Postgres abort and reclaim the connection if the SELECT exceeds the budget,
 * even when the response has already returned via the JS race. Without this,
 * a slow DB would let probe queries accumulate and exhaust the pool right
 * when the service is already degraded.
 */
export async function GET() {
  const checks: Record<string, "ok" | "fail"> = {};
  let allOk = true;

  try {
    const db = getDb();
    const dbPing = db.transaction(async (tx) => {
      // SET LOCAL is bounded to this transaction, so it can never leak into
      // another pooled connection. The literal value is a compile-time
      // constant — no SQL injection surface.
      await tx.execute(
        sql.raw(`SET LOCAL statement_timeout = ${DB_PING_TIMEOUT_MS}`),
      );
      await tx.execute(sql`SELECT 1`);
    });

    await Promise.race([
      dbPing,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("db ping timeout")),
          JS_RACE_TIMEOUT_MS,
        ),
      ),
    ]);
    checks.db = "ok";
  } catch (err) {
    allOk = false;
    checks.db = "fail";
    logger.warn({ err }, "Readiness probe: DB ping failed");
  }

  return NextResponse.json(
    {
      status: allOk ? "ready" : "not_ready",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 },
  );
}
