/**
 * Autenticazione via API key per le route /api/v1/*.
 *
 * Ogni richiesta deve includere:
 *   Authorization: Bearer szk_live_XXXX  (business key)
 *   Authorization: Bearer szk_mgmt_XXXX  (management key)
 *
 * La funzione verifica la key nel DB (via hash), controlla che non sia
 * revocata/scaduta, e aggiorna last_used_at in modo asincrono (fire-and-forget).
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apiKeys, profiles } from "@/db/schema";
import { hashApiKey } from "@/lib/api-keys";
import type { Plan } from "@/lib/plans";
import type { SelectApiKey } from "@/db/schema";

export type ApiKeyContext = {
  apiKey: SelectApiKey;
  profileId: string;
  /** null per management key */
  businessId: string | null;
  plan: Plan;
  trialStartedAt: Date | null;
};

export type ApiKeyAuthError = {
  error: string;
  status: 401;
};

/**
 * Autentica una richiesta tramite API key nel header Authorization.
 *
 * Ritorna ApiKeyContext se la chiave è valida, o ApiKeyAuthError altrimenti.
 * Non esegue il controllo del piano (canUseApi) — quello spetta alla route.
 */
export async function authenticateApiKey(
  request: Request,
): Promise<ApiKeyContext | ApiKeyAuthError> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      error: "API key mancante. Usa l'header Authorization: Bearer <key>.",
      status: 401,
    };
  }

  const raw = authHeader.slice(7).trim();
  if (!raw) {
    return { error: "API key mancante.", status: 401 };
  }

  const hash = hashApiKey(raw);
  const db = getDb();

  const [row] = await db
    .select({
      apiKey: apiKeys,
      plan: profiles.plan,
      trialStartedAt: profiles.trialStartedAt,
    })
    .from(apiKeys)
    .innerJoin(profiles, eq(apiKeys.profileId, profiles.id))
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);

  if (!row) {
    return { error: "API key non valida.", status: 401 };
  }

  if (row.apiKey.revokedAt) {
    return { error: "API key revocata.", status: 401 };
  }

  if (row.apiKey.expiresAt && row.apiKey.expiresAt < new Date()) {
    return { error: "API key scaduta.", status: 401 };
  }

  // Fire-and-forget: aggiorna last_used_at senza bloccare la risposta
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.apiKey.id));

  return {
    apiKey: row.apiKey,
    profileId: row.apiKey.profileId,
    businessId: row.apiKey.businessId ?? null,
    plan: row.plan as Plan,
    trialStartedAt: row.trialStartedAt ?? null,
  };
}

/**
 * Type guard: verifica se il risultato di authenticateApiKey è un errore.
 */
export function isApiKeyAuthError(
  result: ApiKeyContext | ApiKeyAuthError,
): result is ApiKeyAuthError {
  return "status" in result;
}
