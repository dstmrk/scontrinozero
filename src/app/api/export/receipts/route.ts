import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { businesses, profiles } from "@/db/schema";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { assertProPlan } from "@/lib/plans";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import {
  parseRomeDayEndExclusiveUtc,
  parseRomeDayStartUtc,
} from "@/lib/date-utils";
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

function buildFilename(from: string = "tutti", to: string = "tutti"): string {
  return `scontrini-${from}-${to}.csv`;
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

  // getAuthenticatedUser (non getUser() diretto): bind Sentry.setUser({ id })
  // (regola 22) e touch last_seen_at gratis anche per chi usa l'app solo per
  // esportare CSV (altrimenti risulterebbe inattivo per il GDPR pruning).
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return errorJson(401, "Non autenticato.");
  }
  const userId = user.id;

  const proCheck = await assertProPlan(userId);
  if (!proCheck.ok) {
    return errorJson(proCheck.status, proCheck.error);
  }

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

  // Estremi sulla giornata **italiana**: il periodo che l'esercente sceglie e'
  // quello del suo calendario, e deve combaciare con la data che il CSV
  // stampa (`ade_registered_at` reso in ora di Roma). `to` e' inclusivo per
  // l'utente → l'estremo superiore e' l'inizio del giorno dopo, calcolato sul
  // calendario e non sommando 24h (giorni DST da 23/25 ore).
  const dateFrom = from ? parseRomeDayStartUtc(from) : null;
  if (from && !dateFrom) {
    return errorJson(400, "Formato data 'from' non valido (yyyy-MM-dd).");
  }
  const dateToExclusive = to ? parseRomeDayEndExclusiveUtc(to) : null;
  if (to && !dateToExclusive) {
    return errorJson(400, "Formato data 'to' non valido (yyyy-MM-dd).");
  }
  // Confronto sulle stringhe yyyy-MM-dd: ordinamento lessicografico ==
  // cronologico, e non risente del giorno-dopo dell'estremo superiore.
  if (from && to && from > to) {
    return errorJson(
      400,
      "La data di inizio non può essere successiva alla data di fine.",
    );
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
