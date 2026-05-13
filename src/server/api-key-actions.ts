"use server";

import { and, count, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { apiKeys, businesses, profiles } from "@/db/schema";
import { generateApiKey } from "@/lib/api-keys";
import { canUseApi, getApiKeyLimit } from "@/lib/plans";
import { getEffectivePlan } from "@/server/billing-actions";
import {
  checkBusinessOwnership,
  getAuthenticatedUser,
} from "@/lib/server-auth";

export type ApiKeyListItem = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export async function listApiKeys(
  businessId: string,
): Promise<{ error?: string; keys?: ApiKeyListItem[] }> {
  const user = await getAuthenticatedUser();

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) return ownershipError;

  const effectivePlan = await getEffectivePlan(user.id);
  if (!canUseApi(effectivePlan)) {
    return {
      error: "Per accedere alle API key serve il piano Pro o superiore.",
    };
  }

  const db = getDb();
  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.businessId, businessId), isNull(apiKeys.revokedAt)));

  return { keys };
}

export async function createApiKey(
  businessId: string,
  name: string,
): Promise<{ error?: string; apiKeyRaw?: string; keyId?: string }> {
  const user = await getAuthenticatedUser();

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) return ownershipError;

  const effectivePlan = await getEffectivePlan(user.id);
  if (!canUseApi(effectivePlan)) {
    return {
      error: "Per generare API key serve il piano Pro o superiore.",
    };
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return { error: "Il nome della chiave è obbligatorio." };
  }
  if (trimmedName.length > 64) {
    return { error: "Il nome della chiave non può superare 64 caratteri." };
  }

  const db = getDb();

  const keyLimit = getApiKeyLimit(effectivePlan);

  const [profile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.authUserId, user.id))
    .limit(1);

  if (!profile) {
    return { error: "Profilo non trovato." };
  }

  const generated = generateApiKey("business");

  // Serializza count + insert per business con SELECT ... FOR UPDATE sulla
  // riga business. Senza lock due richieste concorrenti possono entrambe
  // superare il check (vedono N < limit) e inserire, eccedendo il limite del
  // piano di 1 unità (CLAUDE.md B12 / regola 16).
  return db.transaction(async (tx) => {
    await tx
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .for("update");

    if (keyLimit !== null) {
      const [{ count: activeKeyCount }] = await tx
        .select({ count: count() })
        .from(apiKeys)
        .where(
          and(eq(apiKeys.businessId, businessId), isNull(apiKeys.revokedAt)),
        );
      if (Number(activeKeyCount) >= keyLimit) {
        return {
          error: `Hai raggiunto il limite di ${keyLimit} API key per il piano corrente. Revoca una chiave esistente per crearne una nuova.`,
        };
      }
    }

    const [inserted] = await tx
      .insert(apiKeys)
      .values({
        profileId: profile.id,
        businessId,
        type: "business",
        name: trimmedName,
        keyHash: generated.hash,
        keyPrefix: generated.prefix,
      })
      .returning({ id: apiKeys.id });

    return { apiKeyRaw: generated.raw, keyId: inserted.id };
  });
}

export async function revokeApiKey(keyId: string): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();

  const db = getDb();

  const [profile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.authUserId, user.id))
    .limit(1);

  if (!profile) {
    return { error: "Profilo non trovato." };
  }

  const [updated] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.profileId, profile.id)))
    .returning({ id: apiKeys.id });

  if (!updated) {
    return { error: "Chiave non trovata o non autorizzata." };
  }

  return {};
}
