"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { authErrorResult } from "@/lib/auth-errors";
import { getPlanSafe } from "@/lib/plans";
import type { Plan } from "@/lib/plans";
import { planFromPriceId } from "@/lib/stripe";

// getEffectivePlan è stato spostato in "@/lib/plans" (helper server-only, non
// una action pubblica invocabile via POST) — vedi REVIEW #66.

export type ProfilePlanResult =
  | {
      plan: Plan;
      trialStartedAt: Date | null;
      planExpiresAt: Date | null;
      hasSubscription: boolean;
      /** "active" | "past_due" | "canceled" | "incomplete" | null */
      subscriptionStatus: string | null;
      /** "month" | "year" | null */
      subscriptionInterval: string | null;
      /** true se annullato dal portale Stripe ma attivo fino a scadenza (#34) */
      cancelAtPeriodEnd: boolean;
    }
  | { error: string };

/**
 * Restituisce il piano corrente dell'utente autenticato e indica
 * se ha una subscription Stripe attiva.
 */
export async function getProfilePlan(): Promise<ProfilePlanResult> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, "getProfilePlan");
  }

  // Profilo orfano o DB sovraccarico → { error } inline: la sezione piano di
  // /dashboard/impostazioni ha già il suo fallback, un throw la sostituirebbe
  // con l'error boundary di Next (REVIEW.md #78, regola 19).
  const planResult = await getPlanSafe(user.id, "getProfilePlan");
  if (!planResult.ok) return { error: planResult.error };
  const planInfo = planResult.info;

  const db = getDb();
  const [sub] = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      interval: subscriptions.interval,
      stripePriceId: subscriptions.stripePriceId,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1);

  const displayPlan: Plan =
    planInfo.plan === "trial" && sub?.stripePriceId && sub.status === "active"
      ? (planFromPriceId(sub.stripePriceId) ?? planInfo.plan)
      : planInfo.plan;

  return {
    plan: displayPlan,
    trialStartedAt: planInfo.trialStartedAt,
    planExpiresAt: planInfo.planExpiresAt,
    hasSubscription: !!sub,
    subscriptionStatus: sub?.status ?? null,
    subscriptionInterval: sub?.interval ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
  };
}
