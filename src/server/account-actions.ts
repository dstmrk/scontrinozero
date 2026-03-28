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
 * After DB deletion, the Supabase auth user is removed via the admin API.
 */
export async function deleteAccount(): Promise<AccountActionResult> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return { error: "Non autenticato." };
  }

  const db = getDb();

  // 1. Delete profile — FK cascade removes everything linked to this user
  const deleted = await db
    .delete(profiles)
    .where(eq(profiles.authUserId, user.id))
    .returning({ id: profiles.id });

  if (deleted.length === 0) {
    logger.error({ userId: user.id }, "deleteAccount: profile not found");
    return { error: "Profilo non trovato." };
  }

  // 2. Sign out current session before deleting the auth user.
  // Supabase signOut may fail or behave unexpectedly if called after the
  // auth user has already been removed, so we invalidate the session first.
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();

  // 3. Delete auth user via admin API (service role key).
  // Retry up to 3 times: a transient failure would leave an orphan auth entry
  // that blocks re-registration with the same email.
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
    // All retries exhausted. Profile is deleted but auth entry persists —
    // the user cannot log in but CAN be blocked from re-registering.
    // Requires manual cleanup via Supabase dashboard or admin script.
    logger.error(
      { userId: user.id, err: deleteAuthError },
      "deleteAccount: auth user deletion failed after retries — manual cleanup required",
    );
  }

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
