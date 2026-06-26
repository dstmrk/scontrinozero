"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { profiles, businesses } from "@/db/schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getAuthenticatedUser,
  checkBusinessOwnership,
} from "@/lib/server-auth";
import {
  BUSINESS_PROFILE_LIMITS,
  isStrongPassword,
  isValidItalianZipCode,
  ITALIAN_ZIP_MESSAGE,
  validateBusinessOptionalFieldLengths,
} from "@/lib/validation";
import { isInvalidPreferredVatCode } from "@/types/cassa";
import { getClientIp } from "@/lib/get-client-ip";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { ERROR_MESSAGES } from "@/lib/error-messages";
import {
  getFormString,
  getFormStringOrNull,
  getFormStringRaw,
} from "@/lib/form-utils";

export type ProfileActionResult = { error?: string };

const updateProfileLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: RATE_LIMIT_WINDOWS.HOURLY,
});

const updateBusinessLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: RATE_LIMIT_WINDOWS.HOURLY,
});

const changePasswordLimiter = new RateLimiter({
  maxRequests: 5,
  // same threshold as other auth actions
  windowMs: RATE_LIMIT_WINDOWS.AUTH_15_MIN,
});

const completePasswordResetLimiter = new RateLimiter({
  maxRequests: 5,
  // same threshold as other auth actions
  windowMs: RATE_LIMIT_WINDOWS.AUTH_15_MIN,
});

type DrizzleDb = ReturnType<typeof getDb>;
type DrizzleTx = Parameters<Parameters<DrizzleDb["transaction"]>[0]>[0];

/**
 * Reads the current `preferredVatCode` taking a row lock (SELECT … FOR UPDATE)
 * within the supplied transaction. Returning the value INSIDE the same locked
 * transaction that issues the UPDATE prevents two concurrent updates from
 * reading the same `current` and logging stale `oldVatCode` values.
 *
 * Returns an empty patch (and skips the audit log) when the field is absent
 * from the submission, so the existing value is preserved.
 *
 * Extracted as a helper to keep `updateBusiness` under SonarCloud's Cognitive
 * Complexity threshold (S3776).
 */
async function preparePreferredVatCodeUpdate(opts: {
  tx: DrizzleTx;
  hasField: boolean;
  newValue: string | null;
  businessId: string;
  userId: string;
}): Promise<{ preferredVatCode?: string | null }> {
  if (!opts.hasField) return {};

  const [current] = await opts.tx
    .select({ preferredVatCode: businesses.preferredVatCode })
    .from(businesses)
    .where(eq(businesses.id, opts.businessId))
    .for("update")
    .limit(1);
  const oldValue = current?.preferredVatCode ?? null;

  if (oldValue !== opts.newValue) {
    logger.info(
      {
        userId: opts.userId,
        businessId: opts.businessId,
        oldVatCode: oldValue,
        newVatCode: opts.newValue,
      },
      "Business preferred VAT code changed",
    );
  }

  return { preferredVatCode: opts.newValue };
}

export async function updateProfile(
  formData: FormData,
): Promise<ProfileActionResult> {
  const user = await getAuthenticatedUser();

  const firstName = getFormString(formData, "firstName");
  const lastName = getFormString(formData, "lastName");

  if (!firstName) return { error: "Il nome è obbligatorio." };
  if (firstName.length > BUSINESS_PROFILE_LIMITS.firstName)
    return {
      error: `Il nome non può superare ${BUSINESS_PROFILE_LIMITS.firstName} caratteri.`,
    };
  if (!lastName) return { error: "Il cognome è obbligatorio." };
  if (lastName.length > BUSINESS_PROFILE_LIMITS.lastName)
    return {
      error: `Il cognome non può superare ${BUSINESS_PROFILE_LIMITS.lastName} caratteri.`,
    };

  const rateLimitResult = updateProfileLimiter.check(
    `updateProfile:${user.id}`,
  );
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "updateProfile rate limit exceeded");
    return { error: ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES };
  }

  const db = getDb();
  await db
    .update(profiles)
    .set({ firstName, lastName })
    .where(eq(profiles.authUserId, user.id));

  revalidatePath("/dashboard/settings");
  return {};
}

export async function updateBusiness(
  formData: FormData,
): Promise<ProfileActionResult> {
  const user = await getAuthenticatedUser();

  // CLAUDE.md regola 29: ordine difensivo rate-limit → ownership →
  // validation → UPDATE. La ownership query (DB read) NON deve essere
  // raggiungibile da un attaccante autenticato che martella la action
  // con businessId arbitrari: prima si blocca il volume di richieste,
  // poi si valida l'autorizzazione, poi si valida il payload.
  const rateLimitResult = updateBusinessLimiter.check(
    `updateBusiness:${user.id}`,
  );
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "updateBusiness rate limit exceeded");
    return { error: ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES };
  }

  const businessId = getFormString(formData, "businessId");
  if (!businessId) return { error: "Business ID mancante." };

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) return ownershipError;

  const businessName = getFormStringOrNull(formData, "businessName");
  const address = getFormString(formData, "address");
  const streetNumber = getFormStringOrNull(formData, "streetNumber");
  const city = getFormStringOrNull(formData, "city");
  const province = getFormStringOrNull(formData, "province");
  const zipCode = getFormString(formData, "zipCode");

  // Distinguish "field absent" (don't touch) from "field present and empty"
  // (clear the preference). A missing key would otherwise wipe the existing
  // value AND emit a misleading audit event.
  const hasPreferredVatCode = formData.has("preferredVatCode");
  const preferredVatCode = hasPreferredVatCode
    ? getFormStringOrNull(formData, "preferredVatCode")
    : null;

  if (!address) return { error: "L'indirizzo è obbligatorio." };
  if (address.length > BUSINESS_PROFILE_LIMITS.address)
    return {
      error: `L'indirizzo non può superare ${BUSINESS_PROFILE_LIMITS.address} caratteri.`,
    };
  const optionalError = validateBusinessOptionalFieldLengths({
    businessName,
    streetNumber,
    city,
    province,
  });
  if (optionalError) return { error: optionalError };
  if (!isValidItalianZipCode(zipCode)) return { error: ITALIAN_ZIP_MESSAGE };
  if (hasPreferredVatCode && isInvalidPreferredVatCode(preferredVatCode))
    return { error: "Aliquota IVA non valida." };

  // Lock + diff + UPDATE in una transazione: senza il lock pessimistico
  // sulla riga, due update concorrenti dello stesso business possono
  // leggere lo stesso "vecchio" valore e produrre audit log inconsistenti
  // (entrambi loggano lo stesso oldVatCode, ma uno dei due UPDATE perde).
  await getDb().transaction(async (tx) => {
    const vatPatch = await preparePreferredVatCodeUpdate({
      tx,
      hasField: hasPreferredVatCode,
      newValue: preferredVatCode,
      businessId,
      userId: user.id,
    });

    await tx
      .update(businesses)
      .set({
        businessName,
        address,
        streetNumber,
        city,
        province,
        zipCode,
        ...vatPatch,
      })
      .where(eq(businesses.id, businessId));
  });

  revalidatePath("/dashboard/settings");
  return {};
}

export async function changePassword(
  formData: FormData,
): Promise<ProfileActionResult> {
  const user = await getAuthenticatedUser();

  // Raw read sui campi password: il trim() cambierebbe la semantica delle
  // credenziali e bloccherebbe login a utenti registrati con whitespace
  // significativo (vedi `getFormStringRaw`).
  const currentPassword = getFormStringRaw(formData, "currentPassword");
  const newPassword = getFormStringRaw(formData, "newPassword");
  const confirmPassword = getFormStringRaw(formData, "confirmPassword");

  if (!currentPassword) return { error: "Inserisci la password attuale." };
  if (!newPassword || !isStrongPassword(newPassword)) {
    return { error: ERROR_MESSAGES.NEW_PASSWORD_NOT_STRONG };
  }
  if (newPassword !== confirmPassword) {
    return { error: ERROR_MESSAGES.PASSWORDS_MISMATCH };
  }

  // Rate limit per user.id (not per IP) to avoid locking out multiple users
  // sharing the same NAT/proxy IP. IP is still logged for audit purposes.
  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const rateLimitResult = changePasswordLimiter.check(
    `changePassword:${user.id}`,
  );
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id, ip }, "changePassword rate limit exceeded");
    return { error: ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES };
  }

  const email = user.email;
  if (!email) return { error: "Email utente non disponibile." };

  // Backlog v1.3.2: coprire la sequenza con un test E2E Playwright contro
  // un'istanza Supabase reale per verificare le due invarianti documentate
  // sotto. I test unitari sopra mockano @supabase/supabase-js e non
  // possono validare il comportamento effettivo del cookie store SSR.
  //
  // Sequenza obbligata: signInWithPassword → updateUser → signOut({scope:"others"}).
  // Invariante 1: la sessione corrente (cookie del browser che esegue il
  //   cambio) DEVE restare valida dopo la sequenza completa. `scope:"others"`
  //   opera sui refresh token di altre sessioni dell'utente; il refresh
  //   token corrente (ruotato da `signInWithPassword` e nuovamente da
  //   `updateUser`) viene preservato. Il cookie store SSR di @supabase/ssr
  //   riscrive i cookie via `setAll()` durante `signInWithPassword`, e
  //   l'istanza `supabase` riusata sotto continua a operare con quel
  //   refresh token "corrente".
  // Invariante 2: la sessione PRE-cambio password (su altri device) deve
  //   essere invalidata. `signOut({scope:"others"})` revoca tutti i
  //   refresh token attivi sull'utente eccetto quello in uso.
  // Comportamento documentato in https://github.com/supabase/auth-js;
  // verifica empirica condotta a maggio 2026.

  // Re-authenticate to verify the current password before allowing a change.
  // NB: signInWithPassword RUOTA il refresh token corrente — il cookie store
  // viene aggiornato via setAll() ed è ciò che mantiene viva la sessione
  // dell'utente dopo signOut({scope:"others"}).
  const supabase = await createServerSupabaseClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (signInError) {
    return { error: "Password attuale non corretta." };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateError) {
    logger.error(
      { err: updateError, userId: user.id },
      "changePassword: updateUser failed",
    );
    return { error: "Aggiornamento password fallito. Riprova." };
  }

  // Revoca le altre sessioni dell'utente. Supabase per default NON
  // invalida i refresh token sugli altri device quando la password cambia;
  // un attaccante che era già loggato resterebbe loggato altrove.
  // scope: "others" mantiene la sessione corrente (l'utente che ha appena
  // cambiato password resta connesso) e butta fuori tutti gli altri.
  // Security-critical: retry+backoff per non lasciare sessioni orfane su
  // network glitch (CLAUDE.md regola 17).
  await revokeOtherSessionsWithRetry(supabase, user.id);

  return {};
}

/**
 * Completa il flusso di reset password.
 *
 * L'utente è arrivato qui cliccando il link di recovery nella mail
 * (`/auth/v1/verify` di Supabase → `/callback` → `exchangeCodeForSession`):
 * ha quindi una sessione di recovery valida ma NON conosce la vecchia
 * password (l'ha dimenticata, è il motivo del reset). A differenza di
 * `changePassword` NON facciamo `signInWithPassword`: è la sessione di
 * recovery stessa ad autorizzare il cambio. Per il resto la sequenza è
 * identica — `updateUser({ password })` poi `signOut({ scope: "others" })`
 * per buttare fuori eventuali sessioni di un attaccante che aveva preso
 * l'account, mantenendo viva quella corrente (il refresh token viene ruotato
 * da `updateUser`, vedi "Invariante 1" in `changePassword`).
 *
 * Se non c'è una sessione valida (link scaduto/già usato, oppure accesso
 * diretto alla pagina) degradiamo con un messaggio chiaro invece di lasciar
 * propagare `UnauthenticatedError` all'error boundary (CLAUDE.md regola 19).
 */
export async function completePasswordReset(
  formData: FormData,
): Promise<ProfileActionResult> {
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return { error: ERROR_MESSAGES.UNAUTHORIZED };
  }

  // Raw read: il trim() cambierebbe la semantica della credenziale (vedi
  // `getFormStringRaw` e l'identico vincolo in `changePassword`).
  const newPassword = getFormStringRaw(formData, "newPassword");
  const confirmPassword = getFormStringRaw(formData, "confirmPassword");

  if (!newPassword || !isStrongPassword(newPassword)) {
    return { error: ERROR_MESSAGES.NEW_PASSWORD_NOT_STRONG };
  }
  if (newPassword !== confirmPassword) {
    return { error: ERROR_MESSAGES.PASSWORDS_MISMATCH };
  }

  // Rate limit per user.id (come changePassword): evita il lockout di più
  // utenti dietro lo stesso NAT/proxy. IP loggato solo per audit.
  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const rateLimitResult = completePasswordResetLimiter.check(
    `completePasswordReset:${user.id}`,
  );
  if (!rateLimitResult.success) {
    logger.warn(
      { userId: user.id, ip },
      "completePasswordReset rate limit exceeded",
    );
    return { error: ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES };
  }

  const supabase = await createServerSupabaseClient();
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateError) {
    logger.error(
      { err: updateError, userId: user.id },
      "completePasswordReset: updateUser failed",
    );
    return { error: "Aggiornamento password fallito. Riprova." };
  }

  // Revoca le altre sessioni: chi resetta perché un attaccante gli ha preso
  // l'account deve poterlo disconnettere. `scope: "others"` preserva la
  // sessione di recovery corrente.
  await revokeOtherSessionsWithRetry(supabase, user.id);

  return {};
}

/**
 * Revoca le sessioni "altre" (non la corrente) con 3 retry + exponential
 * backoff (500ms / 1s / 2s). Fire-and-forget: il cambio password è già
 * committato lato Supabase quando questa viene chiamata, quindi anche su
 * exhausted retornamo senza propagare l'errore — ma logghiamo
 * `critical: true` perché un attaccante loggato altrove potrebbe restare
 * attivo finché il refresh token non scade naturalmente.
 *
 * Stessa shape di `compensatingDeleteAuthUser` in `src/server/auth-actions.ts`.
 */
async function revokeOtherSessionsWithRetry(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (!error) return;
    if (attempt === 3) {
      logger.error(
        { err: error, userId, critical: true },
        "changePassword: revoke other sessions failed after 3 retries — other devices may still be authenticated until refresh token expiry",
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
}
