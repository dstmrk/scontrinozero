"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { getPlan } from "@/lib/plans";
import type { Plan } from "@/lib/plans";

export type ProfilePlanResult =
  | {
      plan: Plan;
      trialStartedAt: Date | null;
      planExpiresAt: Date | null;
      hasSubscription: boolean;
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
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1);

  return {
    plan: planInfo.plan,
    trialStartedAt: planInfo.trialStartedAt,
    planExpiresAt: planInfo.planExpiresAt,
    hasSubscription: !!sub,
  };
}
