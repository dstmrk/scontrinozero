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

  // If profiles.plan is still "trial" but the subscription row already has a
  // known stripePriceId (set at checkout before the webhook fires), derive the
  // display plan from it. This avoids showing "Prova gratuita" during the race
  // window between checkout redirect and webhook processing.
  // Note: profiles.plan is NOT mutated here — feature gates still read from DB.
  const displayPlan: Plan =
    planInfo.plan === "trial" && sub?.stripePriceId
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
