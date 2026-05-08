import { sanitizeCspViolation } from "@/lib/csp";
import { getClientIp } from "@/lib/get-client-ip";
import { logger } from "@/lib/logger";
import { RATE_LIMIT_WINDOWS, RateLimiter } from "@/lib/rate-limit";
import { readJsonWithLimit } from "@/lib/request-utils";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;

// Rate limit conservativo: violazioni reali sono rare; un picco di richieste
// indica abuso (uno script ostile che bombarda l'endpoint per riempire i log).
const cspReportLimiter = new RateLimiter({
  maxRequests: 60,
  windowMs: RATE_LIMIT_WINDOWS.HOURLY / 60,
});

interface ReportingApiEntry {
  readonly type?: string;
  readonly body?: unknown;
}

function logViolation(violation: unknown, ip: string): void {
  const sanitized = sanitizeCspViolation(violation);
  if (Object.keys(sanitized).length === 0) return;
  logger.warn({ cspViolation: sanitized, ip }, "CSP violation report received");
}

export async function POST(req: Request): Promise<Response> {
  const ip = getClientIp(req.headers);
  const limit = cspReportLimiter.check(`csp-report:${ip}`);
  if (!limit.success) {
    return new Response(null, { status: 429 });
  }

  const ct = req.headers.get("content-type") ?? "";
  const isLegacy = ct.includes("application/csp-report");
  const isReportingApi = ct.includes("application/reports+json");
  if (!isLegacy && !isReportingApi) {
    return new Response(null, { status: 415 });
  }

  const result = await readJsonWithLimit(req, MAX_BODY_BYTES);
  if (!result.ok) {
    if ("tooLarge" in result) return new Response(null, { status: 413 });
    return new Response(null, { status: 400 });
  }

  if (isLegacy) {
    const data = result.data as { "csp-report"?: unknown };
    logViolation(data?.["csp-report"], ip);
    return new Response(null, { status: 204 });
  }

  // Reporting API: il body è un array di report eterogenei. Filtriamo i
  // soli "csp-violation" — gli altri (deprecation, intervention) non ci
  // interessano e non vanno loggati come CSP.
  if (Array.isArray(result.data)) {
    for (const entry of result.data as ReportingApiEntry[]) {
      if (entry?.type === "csp-violation") {
        logViolation(entry.body, ip);
      }
    }
  }

  return new Response(null, { status: 204 });
}
