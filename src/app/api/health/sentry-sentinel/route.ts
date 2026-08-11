import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getAppRelease } from "@/lib/version";

export const dynamic = "force-dynamic";

/**
 * Sentry drain sentinel — emits a triple log (info, warn, error) tagged
 * with a stable `errorClass: "sentinel"` and a per-call `sentinelId`,
 * letting an operator (or CI) verify end-to-end that:
 *
 *   - pino → Sentry Logs is wired (info + warn + error appear in the
 *     `logs` dataset for the running release within ~5 min)
 *   - the `level >= 50` Sentry capture hook in `src/lib/logger.ts` is
 *     working (error appears in the `issues` dataset)
 *
 * Pattern di scoperta in Sentry:
 *
 *   logs:    severity:[info,warn,error] errorClass:sentinel sentinelId:<id>
 *   issues:  errorClass:sentinel sentinelId:<id>
 *
 * Gated by `SENTRY_SENTINEL_TOKEN` env in a constant-time compare. The
 * endpoint returns 404 (not 401/403) when unauthorised so its existence
 * isn't leaked. Coerente con la regola 21 di CLAUDE.md: ogni feature di
 * telemetria nuova va validata con una sentinella all'attivazione, prima
 * di considerare il rollout "concluso".
 *
 * Storico: aggiunto durante il rollout di v1.3.6 (pino → Sentry Logs
 * drain via `Sentry.pinoIntegration` in `sentry.server.config.ts`).
 */
export async function GET(req: Request): Promise<Response> {
  if (!isAuthorised(req)) {
    return new NextResponse(null, { status: 404 });
  }

  const url = new URL(req.url);
  const sentinelId = url.searchParams.get("id")?.trim() || randomUUID();
  const release = getAppRelease();

  logger.info(
    { sentinelId, errorClass: "sentinel", release },
    "sentry-sentinel: info",
  );
  logger.warn(
    { sentinelId, errorClass: "sentinel", release },
    "sentry-sentinel: warn",
  );
  logger.error(
    {
      sentinelId,
      errorClass: "sentinel",
      release,
      err: new Error("sentry-sentinel: intentional error for drain validation"),
    },
    "sentry-sentinel: error",
  );

  return NextResponse.json({
    ok: true,
    sentinelId,
    release,
    sentryQuery: `errorClass:sentinel sentinelId:${sentinelId}`,
  });
}

function isAuthorised(req: Request): boolean {
  const expected = process.env.SENTRY_SENTINEL_TOKEN;
  // Present-but-empty (`""`) treated as missing: a Dockerfile that bakes
  // an empty ARG/ENV would otherwise expose the endpoint unauthenticated.
  // Coerente con la regola 18 (env present-but-empty).
  if (!expected) return false;

  const provided = req.headers.get("x-sentinel-token") ?? "";
  if (provided.length === 0) return false;
  if (provided.length !== expected.length) return false;

  // Timing-safe compare to defeat byte-by-byte guessing.
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
