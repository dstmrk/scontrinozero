"use server";

import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { commercialDocuments } from "@/db/schema";
import {
  checkBusinessOwnership,
  getAuthenticatedUser,
} from "@/lib/server-auth";
import { canUsePro, getPlan, ProfileNotFoundError } from "@/lib/plans";
import { isStatementTimeoutError } from "@/lib/api-errors";
import { withStatementTimeout } from "@/lib/db-timeout";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import {
  calcDocTotal,
  fetchLinesByDocIds,
  groupLinesByDocId,
} from "@/lib/receipts/document-lines";
import { logger } from "@/lib/logger";
import {
  type AnalyticsKpis,
  type AnalyticsRange,
  type PaymentBreakdownEntry,
  type RevenuePoint,
  VALID_RANGES,
  fillMissingDays,
  formatRomeDay,
  normalizePaymentMethod,
  rangeToBounds,
  toCents,
} from "./analytics-helpers";

export type {
  AnalyticsKpis,
  AnalyticsRange,
  PaymentBreakdownEntry,
  RevenuePoint,
} from "./analytics-helpers";

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

// Range fino a 90d scansiona migliaia di documenti + lines per call: senza
// rate limit per-utente, una pagina aperta che retry'a o un client mal scritto
// può martellare il DB. Soglia 60/h coerente con CLAUDE.md (pdf:<ip> 60/h).
const analyticsLimiter = new RateLimiter({
  maxRequests: 60,
  windowMs: RATE_LIMIT_WINDOWS.HOURLY,
});

type AuthOk = { ok: true; userId: string };
type AuthFail = { ok: false; error: string };

async function authorizePro(businessId: string): Promise<AuthOk | AuthFail> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return { ok: false, error: "Non autenticato." };
  }
  const rateLimitResult = analyticsLimiter.check(`analytics:${user.id}`);
  if (!rateLimitResult.success) {
    logger.warn(
      { userId: user.id, errorClass: "analytics_rate_limit" },
      "Analytics rate limit exceeded",
    );
    return {
      ok: false,
      error: "Troppe richieste. Riprova tra qualche minuto.",
    };
  }
  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) {
    logger.warn(
      { userId: user.id, businessId },
      "analytics: ownership check failed",
    );
    return { ok: false, error: ownershipError.error };
  }
  let planInfo;
  try {
    planInfo = await getPlan(user.id);
  } catch (err) {
    if (err instanceof ProfileNotFoundError) {
      logger.warn(
        { userId: user.id },
        "analytics: orphan auth user — profile missing",
      );
      return {
        ok: false,
        error: "Profilo non disponibile. Contatta il supporto.",
      };
    }
    if (isStatementTimeoutError(err)) {
      return {
        ok: false,
        error:
          "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
      };
    }
    throw err;
  }
  if (!canUsePro(planInfo.plan)) {
    return { ok: false, error: "Funzionalità riservata al piano Pro." };
  }
  return { ok: true, userId: user.id };
}

async function validateRange(
  range: AnalyticsRange,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!VALID_RANGES.has(range)) {
    return { ok: false, error: "Range non valido." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

type DocRow = {
  id: string;
  status: string;
  createdAt: Date;
  publicRequest?: unknown;
};

// 5s budget allineato con altri endpoint Pro: il range max e' 90d, su
// dataset normali la query risponde in <200ms. Oltre i 5s significa
// dataset degenere o contention DB — preferiamo errore 503 friendly
// piuttosto che pinning della connessione.
const ANALYTICS_QUERY_TIMEOUT_MS = 5_000;

// Safety net contro tenant con volumi anomali: nessun business Pro reale
// emette >50k scontrini in 90d (≈555/giorno). Oltre, la pagina analytics
// produrrebbe un payload da MB e degraderebbe l'istanza.
const ANALYTICS_MAX_DOCS = 50_000;

async function fetchSaleDocsInRange(
  businessId: string,
  from: Date,
  to: Date,
  options: { includePublicRequest?: boolean } = {},
): Promise<DocRow[]> {
  const baseSelection = {
    id: commercialDocuments.id,
    status: commercialDocuments.status,
    createdAt: commercialDocuments.createdAt,
  };
  const selection = options.includePublicRequest
    ? { ...baseSelection, publicRequest: commercialDocuments.publicRequest }
    : baseSelection;
  const rows = await withStatementTimeout(
    ANALYTICS_QUERY_TIMEOUT_MS,
    async (tx) =>
      tx
        .select(selection)
        .from(commercialDocuments)
        .where(
          and(
            eq(commercialDocuments.businessId, businessId),
            eq(commercialDocuments.kind, "SALE"),
            inArray(commercialDocuments.status, ["ACCEPTED", "VOID_ACCEPTED"]),
            gte(commercialDocuments.createdAt, from),
            lt(commercialDocuments.createdAt, to),
          ),
        )
        .limit(ANALYTICS_MAX_DOCS),
  );
  return rows as DocRow[];
}

async function computeTotalsByDoc(
  docs: { id: string }[],
): Promise<Map<string, number>> {
  if (docs.length === 0) return new Map();
  const lines = await fetchLinesByDocIds(docs.map((d) => d.id));
  const grouped = groupLinesByDocId(lines);
  const totalsByDoc = new Map<string, number>();
  for (const doc of docs) {
    totalsByDoc.set(doc.id, calcDocTotal(grouped.get(doc.id) ?? []));
  }
  return totalsByDoc;
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

export async function getAnalyticsKpis(
  businessId: string,
  range: AnalyticsRange,
): Promise<AnalyticsKpis | { error: string }> {
  const rangeCheck = await validateRange(range);
  if (!rangeCheck.ok) return { error: rangeCheck.error };
  const auth = await authorizePro(businessId);
  if (!auth.ok) return { error: auth.error };

  const { from, to } = rangeToBounds(range);
  const docs = await fetchSaleDocsInRange(businessId, from, to);
  const totalsByDoc = await computeTotalsByDoc(docs);

  let revenueCents = 0;
  let count = 0;
  let voidCount = 0;
  for (const doc of docs) {
    if (doc.status === "ACCEPTED") {
      count++;
      revenueCents += toCents(totalsByDoc.get(doc.id) ?? 0);
    } else if (doc.status === "VOID_ACCEPTED") {
      voidCount++;
    }
  }
  const aovCents = count === 0 ? 0 : Math.round(revenueCents / count);

  return { revenueCents, count, aovCents, voidCount };
}

export async function getRevenueTimeseries(
  businessId: string,
  range: AnalyticsRange,
  reference: Date = new Date(),
): Promise<RevenuePoint[] | { error: string }> {
  const rangeCheck = await validateRange(range);
  if (!rangeCheck.ok) return { error: rangeCheck.error };
  const auth = await authorizePro(businessId);
  if (!auth.ok) return { error: auth.error };

  const { from, to } = rangeToBounds(range, reference);
  const docs = await fetchSaleDocsInRange(businessId, from, to);
  const totalsByDoc = await computeTotalsByDoc(docs);

  const byDay = new Map<string, number>();
  for (const doc of docs) {
    if (doc.status !== "ACCEPTED") continue;
    // Bucket per giorno fiscale italiano (Europe/Rome), non UTC: uno
    // scontrino emesso alle 00:30 ora locale del 19 maggio deve apparire
    // nel giorno "2026-05-19", anche se internamente e' 22:30Z del 18.
    const key = formatRomeDay(doc.createdAt);
    byDay.set(
      key,
      (byDay.get(key) ?? 0) + toCents(totalsByDoc.get(doc.id) ?? 0),
    );
  }
  return fillMissingDays(byDay, from, to);
}

export async function getPaymentBreakdown(
  businessId: string,
  range: AnalyticsRange,
): Promise<PaymentBreakdownEntry[] | { error: string }> {
  const rangeCheck = await validateRange(range);
  if (!rangeCheck.ok) return { error: rangeCheck.error };
  const auth = await authorizePro(businessId);
  if (!auth.ok) return { error: auth.error };

  const { from, to } = rangeToBounds(range);
  const docs = await fetchSaleDocsInRange(businessId, from, to, {
    includePublicRequest: true,
  });
  const totalsByDoc = await computeTotalsByDoc(docs);

  const byMethod = new Map<string, { count: number; revenueCents: number }>();
  for (const doc of docs) {
    if (doc.status !== "ACCEPTED") continue;
    const method = normalizePaymentMethod(
      doc.publicRequest && typeof doc.publicRequest === "object"
        ? (doc.publicRequest as { paymentMethod?: unknown }).paymentMethod
        : null,
    );
    const entry = byMethod.get(method) ?? { count: 0, revenueCents: 0 };
    entry.count++;
    entry.revenueCents += toCents(totalsByDoc.get(doc.id) ?? 0);
    byMethod.set(method, entry);
  }
  return Array.from(byMethod.entries()).map(([method, agg]) => ({
    method,
    ...agg,
  }));
}
