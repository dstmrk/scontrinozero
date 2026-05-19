import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { businesses, profiles } from "@/db/schema";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assertProPlan } from "@/lib/plans";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { parseStrictIsoDateUtc } from "@/lib/date-utils";
import {
  buildReceiptsCsvStream,
  type ReceiptStatusFilter,
} from "@/lib/receipts/csv-export";

const csvExportLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: RATE_LIMIT_WINDOWS.HOURLY,
});

const STATUS_VALUES = ["ACCEPTED", "VOID_ACCEPTED"] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  from: z
    .string()
    .regex(ISO_DATE, "Formato data 'from' non valido (yyyy-MM-dd).")
    .optional(),
  to: z
    .string()
    .regex(ISO_DATE, "Formato data 'to' non valido (yyyy-MM-dd).")
    .optional(),
  status: z.enum(STATUS_VALUES).optional(),
});

function errorJson(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function buildFilename(
  from: string | undefined,
  to: string | undefined,
): string {
  const start = from ?? "tutti";
  const end = to ?? "tutti";
  return `scontrini-${start}-${end}.csv`;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return errorJson(
      400,
      parsed.error.issues[0]?.message ?? "Parametri non validi.",
    );
  }
  const { from, to, status } = parsed.data;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const proCheck = await assertProPlan(user?.id ?? null);
  if (!proCheck.ok) {
    return errorJson(proCheck.status, proCheck.error);
  }
  // user is guaranteed non-null here (assertProPlan returns 401 otherwise)
  const userId = user!.id;

  const rate = csvExportLimiter.check(`csv:${userId}`);
  if (!rate.success) {
    logger.warn({ userId }, "CSV export rate limit exceeded");
    return errorJson(429, "Troppe esportazioni. Riprova tra qualche minuto.");
  }

  const db = getDb();
  const [biz] = await db
    .select({ id: businesses.id })
    .from(profiles)
    .innerJoin(businesses, eq(businesses.profileId, profiles.id))
    .where(eq(profiles.authUserId, userId))
    .limit(1);

  if (!biz) {
    return errorJson(404, "Business non trovato.");
  }

  const dateFrom = from ? parseStrictIsoDateUtc(from) : null;
  if (from && !dateFrom) {
    return errorJson(400, "Formato data 'from' non valido (yyyy-MM-dd).");
  }
  const dateTo = to ? parseStrictIsoDateUtc(to) : null;
  if (to && !dateTo) {
    return errorJson(400, "Formato data 'to' non valido (yyyy-MM-dd).");
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return errorJson(
      400,
      "La data di inizio non può essere successiva alla data di fine.",
    );
  }

  // dateTo is inclusive in user-facing semantics; convert to exclusive
  // upper bound (start of next day) for the SQL filter.
  let dateToExclusive: Date | null = null;
  if (dateTo) {
    dateToExclusive = new Date(dateTo);
    dateToExclusive.setUTCDate(dateToExclusive.getUTCDate() + 1);
  }

  const stream = buildReceiptsCsvStream({
    businessId: biz.id,
    status: (status as ReceiptStatusFilter | undefined) ?? null,
    dateFrom,
    dateTo: dateToExclusive,
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${buildFilename(from, to)}"`,
      "Cache-Control": "no-store",
    },
  });
}
