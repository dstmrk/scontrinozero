import { and, eq } from "drizzle-orm";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import { adeCredentials, businesses, profiles } from "@/db/schema";
import { decrypt, getEncryptionKey } from "@/lib/crypto";
import { buildCedenteFromBusiness } from "@/lib/ade/mapper";
import type { User } from "@supabase/supabase-js";
import type { AdeCedentePrestatore } from "@/lib/ade/types";
export type { User } from "@supabase/supabase-js";

export type BusinessOwnershipError = { error: string };

export type AdePrerequisites = {
  codiceFiscale: string;
  password: string;
  pin: string;
  cedentePrestatore: AdeCedentePrestatore;
};

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
 *
 * Uses a single JOIN query instead of two sequential queries to reduce DB roundtrips.
 */
export async function checkBusinessOwnership(
  userId: string,
  businessId: string,
): Promise<BusinessOwnershipError | null> {
  const db = getDb();

  const [result] = await db
    .select({ id: businesses.id })
    .from(profiles)
    .innerJoin(
      businesses,
      and(eq(businesses.profileId, profiles.id), eq(businesses.id, businessId)),
    )
    .where(eq(profiles.authUserId, userId))
    .limit(1);

  if (!result) {
    return { error: "Business non trovato o non autorizzato." };
  }

  return null;
}

/**
 * Fetches, validates, and decrypts AdE credentials for a business,
 * and builds the cedente/prestatore from local business data.
 * Returns an error object if any prerequisite is missing or invalid.
 *
 * Uses a single JOIN query instead of two sequential queries to reduce DB roundtrips.
 */
export async function fetchAdePrerequisites(
  businessId: string,
): Promise<AdePrerequisites | { error: string }> {
  const db = getDb();

  const [row] = await db
    .select({ cred: adeCredentials, business: businesses })
    .from(adeCredentials)
    .innerJoin(businesses, eq(businesses.id, adeCredentials.businessId))
    .where(eq(adeCredentials.businessId, businessId))
    .limit(1);

  if (!row) {
    return {
      error: "Credenziali AdE non trovate. Completa la configurazione.",
    };
  }
  if (!row.cred.verifiedAt) {
    return {
      error:
        "Credenziali AdE non verificate. Verifica le credenziali nelle impostazioni.",
    };
  }

  const key = getEncryptionKey();
  const keys = new Map<number, Buffer>([[row.cred.keyVersion, key]]);
  const codiceFiscale = decrypt(row.cred.encryptedCodiceFiscale, keys);
  const password = decrypt(row.cred.encryptedPassword, keys);
  const pin = decrypt(row.cred.encryptedPin, keys);

  const cedentePrestatore = buildCedenteFromBusiness(row.business);
  return { codiceFiscale, password, pin, cedentePrestatore };
}
