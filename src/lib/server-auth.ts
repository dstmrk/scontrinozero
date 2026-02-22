import { and, eq } from "drizzle-orm";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import { businesses, profiles } from "@/db/schema";
import type { User } from "@supabase/supabase-js";

export type { User };

export type BusinessOwnershipError = { error: string };

/**
 * Returns the authenticated Supabase user or throws if not authenticated.
 */
export async function getAuthenticatedUser(): Promise<User> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated");
  }
  return user;
}

/**
 * Checks that businessId belongs to the authenticated user's profile.
 * Returns an error object if the check fails, or null if ownership is confirmed.
 */
export async function checkBusinessOwnership(
  userId: string,
  businessId: string,
): Promise<BusinessOwnershipError | null> {
  const db = getDb();

  const [profile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.authUserId, userId))
    .limit(1);

  if (!profile) {
    return { error: "Profilo non trovato." };
  }

  const [business] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(
      and(eq(businesses.id, businessId), eq(businesses.profileId, profile.id)),
    )
    .limit(1);

  if (!business) {
    return { error: "Business non trovato o non autorizzato." };
  }

  return null;
}
