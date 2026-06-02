"use server";

import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocuments } from "@/db/schema";
import {
  checkBusinessOwnership,
  getAuthenticatedUser,
} from "@/lib/server-auth";
import { canUsePro, getPlan } from "@/lib/plans";
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

type AuthOk = { ok: true; userId: string };
type AuthFail = { ok: false; error: string };

// Base authorization: any authenticated owner. Used by the "Analytics base"
// KPIs available to every plan (Starter included).
async function authorizeOwner(businessId: string): Promise<AuthOk | AuthFail> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return { ok: false, error: "Non autenticato." };
  }
  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) {
    logger.warn(
      { userId: user.id, businessId },
      "analytics: ownership check failed",
    );
    return { ok: false, error: ownershipError.error };
  }
  return { ok: true, userId: user.id };
}

// Pro authorization: owner + plan gate. Used by the advanced widgets
// (timeseries, payment breakdown) reserved to Pro/Unlimited.
async function authorizePro(businessId: string): Promise<AuthOk | AuthFail> {
  const base = await authorizeOwner(businessId);
  if (!base.ok) return base;
  const planInfo = await getPlan(base.userId);
  if (!canUsePro(planInfo.plan)) {
    return { ok: false, error: "Funzionalità riservata al piano Pro." };
  }
  return { ok: true, userId: base.userId };
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

async function fetchSaleDocsInRange(
  businessId: string,
  from: Date,
  to: Date,
  options: { includePublicRequest?: boolean } = {},
): Promise<DocRow[]> {
  const db = getDb();
  const baseSelection = {
    id: commercialDocuments.id,
    status: commercialDocuments.status,
    createdAt: commercialDocuments.createdAt,
  };
  const selection = options.includePublicRequest
    ? { ...baseSelection, publicRequest: commercialDocuments.publicRequest }
    : baseSelection;
  const rows = await db
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
  const auth = await authorizeOwner(businessId);
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
