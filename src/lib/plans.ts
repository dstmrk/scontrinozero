import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { canUsePro, type Plan } from "@/lib/plans-shared";

// Re-export pure helpers so existing server callers can keep importing from
// "@/lib/plans". I client component MUST import from "@/lib/plans-shared"
// (questo file importa @/db, server-only).
export {
  API_KEY_LIMITS,
  DEVELOPER_MONTHLY_LIMITS,
  STARTER_CATALOG_LIMIT,
  TRIAL_DAYS,
  canAddCatalogItem,
  canEmit,
  canUseApi,
  canUsePro,
  getApiKeyLimit,
  isDeveloperPlan,
  isTrialExpired,
} from "@/lib/plans-shared";
export type { Plan } from "@/lib/plans-shared";

export type PlanInfo = {
  plan: Plan;
  trialStartedAt: Date | null;
  planExpiresAt: Date | null;
};

// ---------------------------------------------------------------------------
// DB query (server-only)
// ---------------------------------------------------------------------------

/**
 * Recupera le informazioni sul piano dell'utente dal profilo.
 * Lancia se il profilo non viene trovato.
 */
export async function getPlan(authUserId: string): Promise<PlanInfo> {
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
    throw new Error("Profilo non trovato per l'utente autenticato.");
  }

  return {
    plan: profile.plan as Plan,
    trialStartedAt: profile.trialStartedAt ?? null,
    planExpiresAt: profile.planExpiresAt ?? null,
  };
}

export type AssertProPlanResult =
  | { ok: true; plan: Plan }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Gate per route handler che proteggono una feature Pro.
 * - authUserId null/empty → 401
 * - profilo non trovato → 401
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
  } catch {
    return { ok: false, status: 401, error: "Non autenticato." };
  }

  if (!canUsePro(info.plan)) {
    return {
      ok: false,
      status: 403,
      error: "Funzionalità riservata al piano Pro.",
    };
  }

  return { ok: true, plan: info.plan };
}
