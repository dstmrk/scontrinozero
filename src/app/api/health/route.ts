import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Legacy health endpoint — kept as a backward-compatible alias of
 * `/api/health/live` (the Docker `HEALTHCHECK` in `Dockerfile` still hits this).
 *
 * For new orchestrators, prefer `/api/health/live` (process up) and
 * `/api/health/ready` (DB reachable, instance ready to take traffic).
 */
export function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
