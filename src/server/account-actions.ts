"use server";

import { createElement } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { sendEmail } from "@/lib/email";
import { AccountDeletionEmail } from "@/emails/account-deletion";

export type AccountActionResult = {
  error?: string;
};

/**
 * Permanently deletes the authenticated user's account and all associated data.
 *
 * Deletion cascade (via FK constraints in 0000_initial.sql):
 *   profiles → businesses → ade_credentials
 *                         → commercial_documents → commercial_document_lines
 *                         → catalog_items
 *
 * Order: auth user is deleted FIRST so that if it fails we can return an error
 * without having touched any application data. If the profile delete fails after
 * auth deletion, we log a critical error (auth entry is gone so the user cannot
 * log in again, but a profile orphan requires manual cleanup via Supabase dashboard).
 */
export async function deleteAccount(): Promise<AccountActionResult> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return { error: "Non autenticato." };
  }

  // 1. Delete auth user via admin API first (service role key).
  //    Retry up to 3 times with exponential backoff. If all retries fail, return
  //    an error — the profile is still intact so the user can log in and retry.
  //    Supabase automatically invalidates all sessions when the auth user is
  //    removed, so an explicit signOut before deletion is not needed here.
  const adminClient = createAdminSupabaseClient();
  let deleteAuthError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await adminClient.auth.admin.deleteUser(user.id);
    if (!error) {
      deleteAuthError = null;
      break;
    }
    deleteAuthError = error;
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  if (deleteAuthError) {
    // All retries exhausted. Profile is still intact — the user can log in
    // and retry the deletion later.
    logger.error(
      { userId: user.id, err: deleteAuthError, critical: true },
      "deleteAccount: auth user deletion failed after retries — account not deleted",
    );
    return {
      error:
        "Eliminazione account fallita. Riprova oppure contatta il supporto.",
    };
  }

  // 2. Delete profile — FK cascade removes everything linked to this user.
  //    Auth entry is already gone at this point. If this fails, the profile
  //    is orphaned (no login possible) and requires manual cleanup:
  //    DELETE FROM profiles WHERE auth_user_id = '<userId>' in Supabase dashboard.
  const db = getDb();
  const deleted = await db
    .delete(profiles)
    .where(eq(profiles.authUserId, user.id))
    .returning({ id: profiles.id });

  if (deleted.length === 0) {
    // Auth deleted but no profile found — already partially cleaned up or
    // profile was never created. Log for awareness.
    logger.error(
      { userId: user.id },
      "deleteAccount: auth user deleted but profile not found",
    );
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
