"use server";

import { createElement } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { authErrorResult } from "@/lib/auth-errors";
import { sendEmail } from "@/lib/email";
import { AccountDeletionEmail } from "@/emails/account-deletion";
import { purgeUserById } from "@/lib/services/purge-user";

export type AccountActionResult = {
  error?: string;
};

/**
 * Permanently deletes the authenticated user's account and all associated data.
 *
 * The actual purge (auth-first delete + profile FK cascade, with retries) lives
 * in the shared `purgeUserById` helper, reused by the GDPR inactive-user prune
 * sweep. This action wraps it with the session-specific concerns: auth gate,
 * sign-out, confirmation email and redirect.
 */
export async function deleteAccount(): Promise<AccountActionResult> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, "deleteAccount");
  }

  // 1-2. Delete auth user (retry) then the profile cascade. If the auth delete
  //      fails after retries the profile is untouched → surface an error so the
  //      user can log in and retry. If auth succeeded but the profile delete
  //      failed, purgeUserById has already logged a critical error; we still
  //      proceed to sign out/redirect because the user can no longer log in.
  const { authDeleted } = await purgeUserById(user.id);
  if (!authDeleted) {
    return {
      error:
        "Eliminazione account fallita. Riprova oppure contatta il supporto.",
    };
  }

  // 3. Sign out current session (best-effort: auth user is already deleted;
  //    cookies may linger but cannot be used for re-authentication).
  const supabase = await createServerSupabaseClient();
  await supabase.auth
    .signOut()
    .catch((err) =>
      logger.warn(
        { err },
        "signOut after account deletion failed (non-critical)",
      ),
    );

  logger.info({ userId: user.id }, "Account deleted");

  // 4. Send deletion confirmation email (fire-and-forget)
  if (user.email) {
    void sendEmail({
      to: user.email,
      subject: "Il tuo account ScontrinoZero è stato eliminato",
      react: createElement(AccountDeletionEmail, { email: user.email }),
    }).catch((err) => logger.warn({ err }, "Account deletion email failed"));
  }

  redirect("/");
}
