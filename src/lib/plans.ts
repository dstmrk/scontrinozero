import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { canUsePro, isPlan, type Plan } from "@/lib/plans-shared";
import { isStatementTimeoutError } from "@/lib/api-errors";
import { logger } from "@/lib/logger";

// Re-export pure helpers so existing server callers can keep importing from
// "@/lib/plans". I client component MUST import from "@/lib/plans-shared"
// (questo file importa @/db, server-only).
export {
  API_KEY_LIMITS,
  DEVELOPER_MONTHLY_LIMITS,
  PLAN_EXPIRY_GRACE_MS,
  PLAN_VALUES,
  STARTER_CATALOG_LIMIT,
  TRIAL_DAYS,
  TRIAL_EXPIRED_MESSAGE,
  canAddCatalogItem,
  canEmit,
  canUseApi,
  canUseDashboardCashier,
  canUsePro,
  getApiKeyLimit,
  isDeveloperPlan,
  isPaidPlanExpired,
  isPlan,
  isTrialExpired,
} from "@/lib/plans-shared";
export type { Plan } from "@/lib/plans-shared";

export type PlanInfo = {
  plan: Plan;
  trialStartedAt: Date | null;
  planExpiresAt: Date | null;
};

/**
 * Throw quando il profilo non esiste per un authUserId valido (orphan auth
 * user). Caso distinto da "non autenticato" e da "DB unavailable": va
 * classificato come 403 — l'utente è autenticato ma il record applicativo
 * manca, serve intervento manuale.
 */
export class ProfileNotFoundError extends Error {
  constructor(authUserId: string) {
    super(`Profilo non trovato per authUserId=${authUserId}`);
    this.name = "ProfileNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// DB query (server-only)
// ---------------------------------------------------------------------------

/**
 * Recupera le informazioni sul piano dell'utente dal profilo.
 * Lancia `ProfileNotFoundError` se il profilo non viene trovato.
 *
 * Wrappato con `react/cache` per deduplicare le chiamate concorrenti nello
 * stesso render RSC. Tipicamente una pagina chiama getPlan piu' volte
 * (es. layout + page + Pro-gate + 3 server actions di analytics): senza
 * cache una visita a /dashboard/analytics colpisce profiles 4-5 volte. La
 * cache e' richiesta-scoped: nuove richieste rifanno la query.
 */
async function fetchPlan(authUserId: string): Promise<PlanInfo> {
  const db = getDb();

  const [profile] = await db
    .select({
      plan: profiles.plan,
      trialStartedAt: profiles.trialStartedAt,
      planExpiresAt: profiles.planExpiresAt,
    })
    .from(profiles)
    .where(eq(profiles.authUserId, authUserId))
    .limit(1);

  if (!profile) {
    throw new ProfileNotFoundError(authUserId);
  }

  // Defense-in-depth: il DB column `profiles.plan` è di tipo `text` con CHECK
  // su un enum applicativo. Un valore non riconosciuto qui indica drift di
  // schema, migration parziale o INSERT manuale errato — situazioni critiche
  // che vanno alertate e fallite chiuse, non silenziate da un cast `as Plan`.
  if (!isPlan(profile.plan)) {
    logger.error(
      { critical: true, userId: authUserId },
      "DB drift: profiles.plan ha un valore non riconosciuto",
    );
    throw new ProfileNotFoundError(authUserId);
  }

  return {
    plan: profile.plan,
    trialStartedAt: profile.trialStartedAt ?? null,
    planExpiresAt: profile.planExpiresAt ?? null,
  };
}

export const getPlan: (authUserId: string) => Promise<PlanInfo> =
  cache(fetchPlan);

export type AssertProPlanResult =
  | { ok: true; plan: Plan }
  | { ok: false; status: 401 | 403 | 503; error: string };

/**
 * Gate per route handler che proteggono una feature Pro.
 * - authUserId null/empty → 401
 * - profilo non trovato (orphan auth user) → 403
 * - DB statement timeout → 503
 * - altri errori → rethrow (bubbleano al global error boundary)
 * - piano non Pro/Unlimited → 403
 * - piano Pro/Unlimited → ok
 *
 * Da usare nelle route handler dove si vuole rispondere con uno status HTTP
 * preciso senza try/catch. Per le server actions usare direttamente getPlan +
 * canUsePro (i pattern esistenti).
 */
export async function assertProPlan(
  authUserId: string | null,
): Promise<AssertProPlanResult> {
  if (!authUserId) {
    return { ok: false, status: 401, error: "Non autenticato." };
  }

  let info: PlanInfo;
  try {
    info = await getPlan(authUserId);
  } catch (err) {
    if (err instanceof ProfileNotFoundError) {
      logger.warn(
        { authUserId },
        "assertProPlan: orphan auth user — profile missing",
      );
      return {
        ok: false,
        status: 403,
        error: "Profilo non disponibile. Contatta il supporto.",
      };
    }
    if (isStatementTimeoutError(err)) {
      return {
        ok: false,
        status: 503,
        error:
          "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
      };
    }
    throw err;
  }

  if (!canUsePro(info.plan, info.planExpiresAt)) {
    return {
      ok: false,
      status: 403,
      error: "Funzionalità riservata al piano Pro.",
    };
  }

  return { ok: true, plan: info.plan };
}
