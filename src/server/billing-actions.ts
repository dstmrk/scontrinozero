"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { getPlan } from "@/lib/plans";
import type { Plan } from "@/lib/plans";
import { planFromPriceId } from "@/lib/stripe";

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
    }
  | { error: string };

/**
 * Restituisce il piano effettivo dell'utente, applicando il fallback
 * subscription-aware: se profiles.plan è ancora "trial" ma esiste già una
 * subscription row con stripePriceId (set al checkout prima che arrivi il
 * webhook), deriva il piano dal prezzo. Usato come base per tutti i feature
 * gate che devono essere consistenti con la UI.
 */
export async function getEffectivePlan(userId: string): Promise<Plan> {
  const planInfo = await getPlan(userId);

  const db = getDb();
  const [sub] = await db
    .select({
      stripePriceId: subscriptions.stripePriceId,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  // Only derive plan from subscription when payment is confirmed (active).
  // Excluding incomplete/past_due prevents premature access on failed payments.
  if (
    planInfo.plan === "trial" &&
    sub?.stripePriceId &&
    sub.status === "active"
  ) {
    return planFromPriceId(sub.stripePriceId) ?? planInfo.plan;
  }
  return planInfo.plan;
}

/**
 * Restituisce il piano corrente dell'utente autenticato e indica
 * se ha una subscription Stripe attiva.
 */
export async function getProfilePlan(): Promise<ProfilePlanResult> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return { error: "Non autenticato." };
  }

  const planInfo = await getPlan(user.id);

  const db = getDb();
  const [sub] = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      interval: subscriptions.interval,
      stripePriceId: subscriptions.stripePriceId,
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
  };
}
