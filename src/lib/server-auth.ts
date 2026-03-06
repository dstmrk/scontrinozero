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

/**
 * Fetches, validates, and decrypts AdE credentials for a business,
 * and builds the cedente/prestatore from local business data.
 * Returns an error object if any prerequisite is missing or invalid.
 */
export async function fetchAdePrerequisites(
  businessId: string,
): Promise<AdePrerequisites | { error: string }> {
  const db = getDb();

  const [cred] = await db
    .select()
    .from(adeCredentials)
    .where(eq(adeCredentials.businessId, businessId))
    .limit(1);

  if (!cred) {
    return {
      error: "Credenziali AdE non trovate. Completa la configurazione.",
    };
  }
  if (!cred.verifiedAt) {
    return {
      error:
        "Credenziali AdE non verificate. Verifica le credenziali nelle impostazioni.",
    };
  }

  const key = getEncryptionKey();
  const keys = new Map<number, Buffer>([[cred.keyVersion, key]]);
  const codiceFiscale = decrypt(cred.encryptedCodiceFiscale, keys);
  const password = decrypt(cred.encryptedPassword, keys);
  const pin = decrypt(cred.encryptedPin, keys);

  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) {
    return { error: "Dati business non trovati." };
  }

  const cedentePrestatore = buildCedenteFromBusiness(business);
  return { codiceFiscale, password, pin, cedentePrestatore };
}
