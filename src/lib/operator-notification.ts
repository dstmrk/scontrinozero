import { createElement } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { OperatorSignupNotificationEmail } from "@/emails/operator-signup-notification";
import { OperatorSubscriptionNotificationEmail } from "@/emails/operator-subscription-notification";
import { formatEmailDate } from "@/emails/format-date";
import { logger } from "@/lib/logger";
import type { PlanChoice, SubscriptionChange } from "@/lib/subscription-change";

/**
 * Sends an internal notification to the operator (configured via
 * `NEW_SIGNUP_NOTIFICATION_EMAIL`) when a user completes onboarding.
 *
 * Designed to be called fire-and-forget from the onboarding flow:
 * any failure is non-critical and must NOT block the user. Caller is
 * expected to `.catch()` the returned promise and log a warning.
 *
 * No-op when the env var is unset — keeps test/sandbox environments quiet.
 */
export async function notifyOperatorOfNewSignup(
  authUserId: string,
): Promise<void> {
  const to = process.env.NEW_SIGNUP_NOTIFICATION_EMAIL;
  if (!to) return;

  const db = getDb();
  const [profile] = await db
    .select({
      firstName: profiles.firstName,
      lastName: profiles.lastName,
      email: profiles.email,
    })
    .from(profiles)
    .where(eq(profiles.authUserId, authUserId))
    .limit(1);

  if (!profile) return;

  await sendEmail({
    to,
    subject: "ScontrinoZero — Nuovo onboarding completato",
    react: createElement(OperatorSignupNotificationEmail, {
      firstName: profile.firstName ?? "",
      lastName: profile.lastName ?? "",
      email: profile.email,
    }),
  });
}

const PLAN_NAMES: Record<PlanChoice["plan"], string> = {
  starter: "Starter",
  pro: "Pro",
  team: "Team",
};
const INTERVAL_NAMES = { month: "mensile", year: "annuale" } as const;

function planLabel({ plan, interval }: PlanChoice): string {
  return `${PLAN_NAMES[plan]} ${INTERVAL_NAMES[interval]}`;
}

const EVENT_TITLES: Record<SubscriptionChange["kind"], string> = {
  started: "Nuovo abbonamento",
  changed: "Cambio piano",
  cancel_scheduled: "Disdetta programmata",
  ended: "Abbonamento terminato",
};

/**
 * Notifica interna all'operatore per un evento di abbonamento (nuova
 * sottoscrizione, cambio piano, disdetta programmata, fine abbonamento).
 *
 * **Non lancia mai**: la mail è un di più rispetto al flusso Stripe che la
 * innesca, quindi ogni errore — lettura del profilo, rendering, Resend — si
 * ferma qui e diventa un `warn` (mai `error`: niente rumore su Sentry). Meglio
 * una mail persa che un webhook che fallisce e viene ritentato da Stripe.
 * Il chiamante la lancia senza `await`.
 *
 * No-op quando `NEW_SIGNUP_NOTIFICATION_EMAIL` non è impostata.
 */
export async function notifyOperatorOfSubscriptionEvent(
  authUserId: string,
  change: SubscriptionChange,
  endsAt?: Date,
): Promise<void> {
  try {
    const to = process.env.NEW_SIGNUP_NOTIFICATION_EMAIL;
    if (!to) return;

    const [profile] = await getDb()
      .select({
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        email: profiles.email,
      })
      .from(profiles)
      .where(eq(profiles.authUserId, authUserId))
      .limit(1);

    if (!profile) return;

    const title = EVENT_TITLES[change.kind];
    const label = planLabel(change.to);
    await sendEmail({
      to,
      subject: `ScontrinoZero — ${title}: ${label}`,
      react: createElement(OperatorSubscriptionNotificationEmail, {
        firstName: profile.firstName ?? "",
        lastName: profile.lastName ?? "",
        email: profile.email,
        title,
        planLabel: label,
        previousPlanLabel:
          change.kind === "changed" && change.from
            ? planLabel(change.from)
            : undefined,
        endsAtLabel:
          change.kind === "cancel_scheduled" && endsAt
            ? formatEmailDate(endsAt)
            : undefined,
      }),
    });
  } catch (err) {
    logger.warn(
      { err, kind: change.kind },
      "Operator subscription notification failed",
    );
  }
}
