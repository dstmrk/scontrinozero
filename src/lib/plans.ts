import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";

export type Plan =
  | "trial"
  | "starter"
  | "pro"
  | "unlimited"
  | "developer_indie"
  | "developer_business"
  | "developer_scale";

export type PlanInfo = {
  plan: Plan;
  trialStartedAt: Date | null;
  planExpiresAt: Date | null;
};

/** Durata del trial in giorni */
export const TRIAL_DAYS = 30;

/** Numero massimo di prodotti nel catalogo per piano Starter e trial */
export const STARTER_CATALOG_LIMIT = 5;

// ---------------------------------------------------------------------------
// DB query
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

// ---------------------------------------------------------------------------
// Pure helper functions
// ---------------------------------------------------------------------------

/**
 * Ritorna true se il trial è scaduto (> TRIAL_DAYS giorni fa).
 * Se trialStartedAt è null, considera il trial come scaduto.
 */
export function isTrialExpired(trialStartedAt: Date | null): boolean {
  if (!trialStartedAt) return true;
  const expiryMs = trialStartedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() >= expiryMs;
}

/**
 * Ritorna true se l'utente può emettere scontrini.
 * - trial non scaduto → ✅
 * - starter / pro / unlimited → ✅
 * - trial scaduto → ❌ (sola lettura)
 */
export function canEmit(plan: Plan, trialStartedAt: Date | null): boolean {
  if (plan === "trial") return !isTrialExpired(trialStartedAt);
  return true;
}

/**
 * Ritorna true se l'utente ha accesso alle feature Pro (analytics avanzata,
 * export CSV, AdE sync, supporto prioritario).
 */
export function canUsePro(plan: Plan): boolean {
  return plan === "pro" || plan === "unlimited";
}

/**
 * Ritorna true se il piano è un piano developer (Fase B: Partner API).
 */
export function isDeveloperPlan(plan: Plan): boolean {
  return (
    plan === "developer_indie" ||
    plan === "developer_business" ||
    plan === "developer_scale"
  );
}

/**
 * Ritorna true se il piano ha accesso alla Developer API.
 * - Pro e Unlimited: accesso API come feature inclusa nel piano
 * - Developer plans: accesso API con limiti mensili per volume
 */
export function canUseApi(plan: Plan): boolean {
  return canUsePro(plan) || isDeveloperPlan(plan);
}

/**
 * Numero massimo di API key attive (non revocate) per piano.
 * null = nessun limite.
 * Starter/trial non hanno accesso API (canUseApi = false), quindi non
 * hanno una entry qui. I piani Developer sono gestiti nella Fase B.
 */
export const API_KEY_LIMITS: Partial<Record<Plan, number>> = {
  pro: 3,
};

/**
 * Ritorna il limite di API key attive per il piano dato.
 * null significa nessun limite applicato (es. Unlimited, piani Developer).
 */
export function getApiKeyLimit(plan: Plan): number | null {
  return API_KEY_LIMITS[plan] ?? null;
}

/**
 * Limite mensile di scontrini emettibili via API per i piani developer.
 * null = nessun limite (piani non-developer con accesso API).
 */
export const DEVELOPER_MONTHLY_LIMITS: Partial<Record<Plan, number>> = {
  developer_indie: 300,
  developer_business: 1500,
  developer_scale: 5000,
};

/**
 * Ritorna true se l'utente può aggiungere un prodotto al catalogo.
 * - pro / unlimited → sempre true
 * - starter / trial (non scaduto) → solo se currentCount < STARTER_CATALOG_LIMIT
 * - trial scaduto → false
 */
export function canAddCatalogItem(
  plan: Plan,
  trialStartedAt: Date | null,
  currentCount: number,
): boolean {
  if (plan === "pro" || plan === "unlimited" || isDeveloperPlan(plan))
    return true;
  if (plan === "trial" && isTrialExpired(trialStartedAt)) return false;
  return currentCount < STARTER_CATALOG_LIMIT;
}
