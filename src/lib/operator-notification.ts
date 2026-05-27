import { createElement } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { OperatorSignupNotificationEmail } from "@/emails/operator-signup-notification";

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
