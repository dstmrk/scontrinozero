"use server";

import { and, count, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { apiKeys, businesses, profiles } from "@/db/schema";
import { generateApiKey } from "@/lib/api-keys";
import { canUseApi, getApiKeyLimit, getPlan } from "@/lib/plans";
import { getEffectivePlan } from "@/server/billing-actions";
import {
  checkBusinessOwnership,
  getAuthenticatedUser,
} from "@/lib/server-auth";
import { authErrorResult } from "@/lib/auth-errors";

export type ApiKeyListItem = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

/**
 * Guard condiviso da listApiKeys/createApiKey: autentica degradando invece di
 * lanciare (sessione assente → { error }, regola 19/20), verifica l'ownership
 * del business e applica il gate di piano (Pro+). Fattorizzato per non
 * duplicare il prefisso identico tra le due azioni — la duplicazione
 * ownership+plan era pre-esistente e l'auth-guard l'aveva spinta oltre la
 * soglia CPD di SonarCloud (new_duplicated_lines, PR #699).
 */
async function authorizeApiKeyBusiness(
  action: string,
  businessId: string,
  planDeniedMessage: string,
): Promise<
  | {
      user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
      effectivePlan: Awaited<ReturnType<typeof getEffectivePlan>>;
    }
  | { error: string }
> {
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, action);
  }

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) return ownershipError;

  const [effectivePlan, planInfo] = await Promise.all([
    getEffectivePlan(user.id),
    getPlan(user.id),
  ]);
  if (!canUseApi(effectivePlan, planInfo.planExpiresAt)) {
    return { error: planDeniedMessage };
  }

  return { user, effectivePlan };
}

export async function listApiKeys(
  businessId: string,
): Promise<{ error?: string; keys?: ApiKeyListItem[] }> {
  const auth = await authorizeApiKeyBusiness(
    "listApiKeys",
    businessId,
    "Per accedere alle API key serve il piano Pro o superiore.",
  );
  if ("error" in auth) return auth;

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
  const auth = await authorizeApiKeyBusiness(
    "createApiKey",
    businessId,
    "Per generare API key serve il piano Pro o superiore.",
  );
  if ("error" in auth) return auth;
  const { user, effectivePlan } = auth;

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
  // piano di 1 unità.
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
  // Sessione assente → degrada a { error } inline (regola 19/20).
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, "revokeApiKey");
  }

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
