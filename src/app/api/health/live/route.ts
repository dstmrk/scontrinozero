import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness probe: process is up and the event loop responds.
 *
 * No external dependencies are checked here — orchestrators use this to decide
 * whether to restart the container on a hung process. Use `/api/health/ready`
 * to gate traffic on DB/Supabase availability.
 */
export function GET() {
  return NextResponse.json({
    status: "live",
    timestamp: new Date().toISOString(),
  });
}
