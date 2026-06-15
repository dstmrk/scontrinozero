"use server";

import { cache } from "react";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { commercialDocuments } from "@/db/schema";
import {
  checkBusinessOwnership,
  getAuthenticatedUser,
} from "@/lib/server-auth";
import {
  canUsePro,
  getPlan,
  type Plan,
  ProfileNotFoundError,
} from "@/lib/plans";
import { isStatementTimeoutError } from "@/lib/api-errors";
import { withStatementTimeout } from "@/lib/db-timeout";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import {
  calcDocTotal,
  fetchLinesByDocIds,
  groupLinesByDocId,
} from "@/lib/receipts/document-lines";
import type { SelectCommercialDocumentLine } from "@/db/schema/commercial-document-lines";
import { logger } from "@/lib/logger";
import {
  type AnalyticsKpis,
  type AnalyticsRange,
  type PaymentBreakdownEntry,
  type ProductBreakdownEntry,
  type RevenuePoint,
  VALID_RANGES,
  computeBreakdown,
  computeKpis,
  computeProductBreakdown,
  computeTimeseries,
  rangeToBounds,
} from "./analytics-helpers";

export type {
  AnalyticsKpis,
  AnalyticsRange,
  PaymentBreakdownEntry,
  ProductBreakdownEntry,
  RevenuePoint,
} from "./analytics-helpers";

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

// Range fino a YTD scansiona migliaia di documenti + lines per call (a fine
// anno YTD ≈ 365 giorni, ben oltre il vecchio max 90d): senza rate limit
// per-utente, una pagina aperta che retry'a o un client mal scritto può
// martellare il DB. Soglia 60/h coerente con CLAUDE.md (pdf:<ip> 60/h).
const analyticsLimiter = new RateLimiter({
  maxRequests: 60,
  windowMs: RATE_LIMIT_WINDOWS.HOURLY,
});

type AuthOk = {
  ok: true;
  userId: string;
  plan: Plan;
  planExpiresAt: Date | null;
};
type AuthFail = { ok: false; error: string };

// Owner-level gate: auth + rate-limit + ownership + plan fetch, SENZA il check
// Pro. Usato sia dal path Pro (grafici, via authorizePro) sia dalla vista
// "analytics base" Starter/Trial (solo KPI, via getStarterKpis): entrambi
// condividono lo stesso budget rate-limit per-utente (`analytics:<id>`).
async function authorizeOwner(businessId: string): Promise<AuthOk | AuthFail> {
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
  return {
    ok: true,
    userId: user.id,
    plan: planInfo.plan,
    planExpiresAt: planInfo.planExpiresAt,
  };
}

// Pro-only gate per i grafici (bundle completo): owner + check Pro. Tenere il
// check qui — non solo nella UI — assicura che gli endpoint dei grafici non
// siano raggiungibili da Starter/Trial via chiamata diretta alla server action.
async function authorizePro(businessId: string): Promise<AuthOk | AuthFail> {
  const auth = await authorizeOwner(businessId);
  if (!auth.ok) return auth;
  if (!canUsePro(auth.plan, auth.planExpiresAt)) {
    return { ok: false, error: "Funzionalità riservata al piano Pro." };
  }
  return auth;
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

/**
 * Type guard runtime su una riga restituita da `commercialDocuments`.
 * Evita il cast cieco `as DocRow[]` che silenzia eventuali drift di schema
 * (es. colonna rinominata, JOIN parziale, valore null inatteso).
 */
function isDocRow(value: unknown): value is DocRow {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.status === "string" &&
    v.createdAt instanceof Date
  );
}

// 5s budget allineato con altri endpoint Pro: il range max e' YTD (~365d
// a fine anno), su dataset normali la query risponde in <500ms. Oltre i 5s
// significa dataset degenere o contention DB — preferiamo errore 503
// friendly piuttosto che pinning della connessione.
const ANALYTICS_QUERY_TIMEOUT_MS = 5_000;

// Safety net contro tenant con volumi anomali: nessun business Pro reale
// emette >50k scontrini su un range YTD (≈137/giorno sull'intero anno).
// Oltre, la pagina analytics produrrebbe un payload da MB e degraderebbe
// l'istanza.
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
  const validRows: DocRow[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (isDocRow(row)) {
      validRows.push(row);
    } else {
      skipped++;
    }
  }
  if (skipped > 0) {
    logger.error(
      { critical: true, businessId, skipped },
      "analytics: DB drift — righe commercialDocuments scartate dal type guard",
    );
  }
  return validRows;
}

type DocLineAggregates = {
  totalsByDoc: Map<string, number>;
  linesByDoc: Map<string, SelectCommercialDocumentLine[]>;
};

async function computeTotalsByDoc(
  docs: { id: string }[],
): Promise<DocLineAggregates> {
  if (docs.length === 0) {
    return { totalsByDoc: new Map(), linesByDoc: new Map() };
  }
  const lines = await fetchLinesByDocIds(docs.map((d) => d.id));
  const linesByDoc = groupLinesByDocId(lines);
  const totalsByDoc = new Map<string, number>();
  for (const doc of docs) {
    totalsByDoc.set(doc.id, calcDocTotal(linesByDoc.get(doc.id) ?? []));
  }
  return { totalsByDoc, linesByDoc };
}

// ---------------------------------------------------------------------------
// Shared analytics dataset
// ---------------------------------------------------------------------------

type Dataset = {
  ok: true;
  docs: DocRow[];
  totalsByDoc: Map<string, number>;
  linesByDoc: Map<string, SelectCommercialDocumentLine[]>;
  from: Date;
  to: Date;
};
type DatasetError = { ok: false; error: string };

async function buildAnalyticsDataset(
  businessId: string,
  range: AnalyticsRange,
  reference?: Date,
): Promise<Dataset | DatasetError> {
  const rangeCheck = await validateRange(range);
  if (!rangeCheck.ok) return { ok: false, error: rangeCheck.error };
  const auth = await authorizePro(businessId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { from, to } = rangeToBounds(range, reference);
  // Includiamo sempre publicRequest: il dataset condiviso serve KPI +
  // timeseries (che non lo usano) e breakdown (che lo usa). Pagare un campo
  // jsonb in piu' una volta sola e' molto piu' economico di 3 fetch separate.
  const docs = await fetchSaleDocsInRange(businessId, from, to, {
    includePublicRequest: true,
  });
  const { totalsByDoc, linesByDoc } = await computeTotalsByDoc(docs);
  return { ok: true, docs, totalsByDoc, linesByDoc, from, to };
}

// Cached path: deduplicato per (businessId, range) nello stesso render RSC.
// La firma esclude `reference` perche' react/cache richiede arg con uguaglianza
// referenziale strict; le call site di produzione non passano reference
// (default `new Date()` interno), quindi la dedup si attiva. I test che
// iniettano `reference` esplicitamente bypassano la cache via reference path.
//
// Nota: `cache()` e' no-op fuori da un render RSC (es. unit test). E' OK:
// la correttezza della funzione non dipende dalla cache, solo la
// performance in produzione.
const getCachedDataset: (
  businessId: string,
  range: AnalyticsRange,
) => Promise<Dataset | DatasetError> = cache(
  (businessId: string, range: AnalyticsRange) =>
    buildAnalyticsDataset(businessId, range),
);

async function getAnalyticsDataset(
  businessId: string,
  range: AnalyticsRange,
  reference?: Date,
): Promise<Dataset | DatasetError> {
  if (reference) {
    return buildAnalyticsDataset(businessId, range, reference);
  }
  return getCachedDataset(businessId, range);
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

export type AnalyticsBundle = {
  kpis: AnalyticsKpis;
  timeseries: RevenuePoint[];
  breakdown: PaymentBreakdownEntry[];
  productBreakdown: ProductBreakdownEntry[];
};

/**
 * Aggregated server action returning all four analytics datasets in one
 * round-trip. Server-side runs a single `getAnalyticsDataset` (cached by
 * `react/cache()` during the RSC render) and computes all aggregates from
 * the shared dataset. Client-side range changes used to invoke four
 * separate Server Actions (kpis/timeseries/breakdown/productBreakdown):
 * each instantiated its own `cache()` scope, so `getAnalyticsDataset` ran
 * four times — quadrupling auth checks, DB fetches, and rate-limit tokens.
 * Funneling through this single entry point preserves the cache benefit
 * across both RSC initial render and client range-change paths.
 */
export async function getAnalyticsBundle(
  businessId: string,
  range: AnalyticsRange,
  reference?: Date,
): Promise<AnalyticsBundle | { error: string }> {
  const result = await getAnalyticsDataset(businessId, range, reference);
  if (!result.ok) return { error: result.error };
  return {
    kpis: computeKpis(result.docs, result.totalsByDoc),
    timeseries: computeTimeseries(
      result.docs,
      result.totalsByDoc,
      result.from,
      result.to,
    ),
    breakdown: computeBreakdown(result.docs, result.totalsByDoc),
    productBreakdown: computeProductBreakdown(result.docs, result.linesByDoc),
  };
}

export type StarterKpisResult = { kpis: AnalyticsKpis } | { error: string };

// Vista "analytics base" del piano Starter/Trial: solo i 4 KPI su finestra
// fissa 30 giorni rolling (niente selettore range, niente grafici → niente
// recharts). Autorizzata a livello owner (NON Pro): canUsePro(starter/trial)
// e' false ma questi piani devono comunque vedere i KPI base. I grafici
// restano dietro authorizePro in getAnalyticsBundle.
//
// Non passa per il dataset cache-ato di getAnalyticsBundle: serve una sola
// fetch server-side al render della pagina e non include `publicRequest`
// (i KPI non lo usano), risparmiando il campo jsonb.
export async function getStarterKpis(
  businessId: string,
  reference?: Date,
): Promise<StarterKpisResult> {
  const auth = await authorizeOwner(businessId);
  if (!auth.ok) return { error: auth.error };

  try {
    const { from, to } = rangeToBounds("30d", reference);
    const docs = await fetchSaleDocsInRange(businessId, from, to);
    const { totalsByDoc } = await computeTotalsByDoc(docs);
    return { kpis: computeKpis(docs, totalsByDoc) };
  } catch (err) {
    // Un timeout DB (57014) sotto carico deve degradare nella vista base
    // (alert inline + KPI a zero gestiti da AnalyticsPage), non propagare
    // fino all'error boundary di Next. Gli errori imprevisti restano
    // visibili (rethrow → Sentry), coerente con authorizeOwner.
    if (isStatementTimeoutError(err)) {
      return {
        error:
          "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
      };
    }
    throw err;
  }
}
