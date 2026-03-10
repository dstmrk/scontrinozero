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

  // 2. Delete auth user via admin API (service role key)
  const adminClient = createAdminSupabaseClient();
  const { error: adminError } = await adminClient.auth.admin.deleteUser(
    user.id,
  );
  if (adminError) {
    // Profile data is already deleted. The auth user becomes an orphan but is
    // harmless — it has no data and cannot log in (profile check would fail).
    logger.error(
      { userId: user.id, err: adminError },
      "deleteAccount: auth user deletion failed — orphaned auth entry",
    );
  }

  logger.info({ userId: user.id }, "Account deleted");

  // 3. Send deletion confirmation email (fire-and-forget)
  if (user.email) {
    void sendEmail({
      to: user.email,
      subject: "Il tuo account ScontrinoZero è stato eliminato",
      react: createElement(AccountDeletionEmail, { email: user.email }),
    }).catch((err) => logger.warn({ err }, "Account deletion email failed"));
  }

  // 4. Sign out current session before redirecting
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();

  redirect("/");
}
