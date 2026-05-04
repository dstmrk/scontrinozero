import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const DB_PING_TIMEOUT_MS = 1500;

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
 * We keep the per-check timeout short on purpose: a slow DB is treated as
 * unready, not as a transient blip — the orchestrator will retry.
 */
export async function GET() {
  const checks: Record<string, "ok" | "fail"> = {};
  let allOk = true;

  try {
    const db = getDb();
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("db ping timeout")),
          DB_PING_TIMEOUT_MS,
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
