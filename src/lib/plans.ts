import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";

export type Plan = "trial" | "starter" | "pro" | "unlimited";

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
  if (plan === "pro" || plan === "unlimited") return true;
  if (plan === "trial" && isTrialExpired(trialStartedAt)) return false;
  return currentCount < STARTER_CATALOG_LIMIT;
}
