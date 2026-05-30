"use server";

import { cache, createElement } from "react";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, adeCredentials, profiles } from "@/db/schema";
import {
  encrypt,
  decrypt,
  getEncryptionKey,
  getKeyVersion,
} from "@/lib/crypto";
import { createAdeClient, getAdeMode } from "@/lib/ade";
import {
  AdeAuthError,
  AdeError,
  AdePasswordExpiredError,
} from "@/lib/ade/errors";
import { getUserFacingAdeErrorMessage } from "@/lib/ade/error-messages";
import { logAdeFailure } from "@/lib/ade/log-failure";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email";
import { WelcomeEmail } from "@/emails/welcome";
import { notifyOperatorOfNewSignup } from "@/lib/operator-notification";
import {
  getAuthenticatedUser,
  checkBusinessOwnership,
} from "@/lib/server-auth";
import {
  adePinSchema,
  BUSINESS_PROFILE_LIMITS,
  isValidItalianZipCode,
  ITALIAN_ZIP_MESSAGE,
  validateBusinessOptionalFieldLengths,
} from "@/lib/validation";
import { isInvalidPreferredVatCode } from "@/types/cassa";
import { ERROR_MESSAGES } from "@/lib/error-messages";
import {
  getFormString,
  getFormStringOrNull,
  getFormStringRaw,
} from "@/lib/form-utils";
import { isUniqueConstraintViolation } from "@/lib/db-errors";

export type OnboardingActionResult = {
  error?: string;
  businessId?: string;
  passwordExpired?: boolean;
};

const changePasswordLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: RATE_LIMIT_WINDOWS.AUTH_15_MIN,
});

export type OnboardingStatus = {
  hasProfile: boolean;
  hasBusiness: boolean;
  hasCredentials: boolean;
  credentialsVerified: boolean;
  businessId?: string;
};

type SaveBusinessInput = {
  firstName: string;
  lastName: string;
  businessName: string | null;
  address: string;
  streetNumber: string | null;
  zipCode: string;
  city: string | null;
  province: string | null;
  hasPreferredVatCode: boolean;
  preferredVatCode: string | null;
};

/**
 * Validates the `saveBusiness` payload. Extracted from `saveBusiness` to keep
 * its Cognitive Complexity under SonarCloud's S3776 threshold.
 */
function validateSaveBusinessInput(input: SaveBusinessInput): string | null {
  if (!input.firstName) return "Il nome è obbligatorio.";
  if (input.firstName.length > BUSINESS_PROFILE_LIMITS.firstName)
    return `Il nome non può superare ${BUSINESS_PROFILE_LIMITS.firstName} caratteri.`;
  if (!input.lastName) return "Il cognome è obbligatorio.";
  if (input.lastName.length > BUSINESS_PROFILE_LIMITS.lastName)
    return `Il cognome non può superare ${BUSINESS_PROFILE_LIMITS.lastName} caratteri.`;
  if (!input.address) return "L'indirizzo è obbligatorio.";
  if (input.address.length > BUSINESS_PROFILE_LIMITS.address)
    return `L'indirizzo non può superare ${BUSINESS_PROFILE_LIMITS.address} caratteri.`;
  const optionalError = validateBusinessOptionalFieldLengths(input);
  if (optionalError) return optionalError;
  if (!isValidItalianZipCode(input.zipCode)) return ITALIAN_ZIP_MESSAGE;
  if (
    input.hasPreferredVatCode &&
    isInvalidPreferredVatCode(input.preferredVatCode)
  )
    return "Aliquota IVA non valida.";
  return null;
}

export async function saveBusiness(
  formData: FormData,
): Promise<OnboardingActionResult> {
  const user = await getAuthenticatedUser();

  const firstName = getFormString(formData, "firstName");
  const lastName = getFormString(formData, "lastName");
  const businessName = getFormStringOrNull(formData, "businessName");
  const address = getFormString(formData, "address");
  const streetNumber = getFormStringOrNull(formData, "streetNumber");
  const zipCode = getFormString(formData, "zipCode");
  const city = getFormStringOrNull(formData, "city");
  const province = getFormStringOrNull(formData, "province");

  // Distinguish "field absent" (don't touch existing preference on UPDATE)
  // from "field present and empty" (clear it). `getFormStringOrNull` collapses
  // both into null, which would silently wipe `preferredVatCode` for a user
  // re-entering the onboarding wizard with a partial form. Same fix-class as
  // `updateBusiness` in `profile-actions.ts`.
  const hasPreferredVatCode = formData.has("preferredVatCode");
  const preferredVatCode = hasPreferredVatCode
    ? getFormStringOrNull(formData, "preferredVatCode")
    : null;

  const validationError = validateSaveBusinessInput({
    firstName,
    lastName,
    businessName,
    address,
    streetNumber,
    zipCode,
    city,
    province,
    hasPreferredVatCode,
    preferredVatCode,
  });
  if (validationError) return { error: validationError };

  const db = getDb();

  // Find the user's profile
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.authUserId, user.id))
    .limit(1);

  if (!profile) {
    return { error: "Profilo non trovato." };
  }

  // Wrap both writes in a transaction: updating the profile and upserting
  // the business must stay consistent. A partial failure (profile updated but
  // business insert failed) would leave the user in an incomplete onboarding
  // state that is hard to recover from.
  return db.transaction(async (tx) => {
    // Upsert: check if business already exists for this profile
    const [existing] = await tx
      .select()
      .from(businesses)
      .where(eq(businesses.profileId, profile.id))
      .limit(1);

    // Aggiorna firstName/lastName su profile SOLO se l'onboarding non è già
    // stato completato (fiscalCode è valorizzato dalla verifica AdE). Edit
    // del nome post-onboarding deve passare da /dashboard/settings.
    if (!existing?.fiscalCode) {
      await tx
        .update(profiles)
        .set({ firstName, lastName })
        .where(eq(profiles.id, profile.id));
    }

    if (existing) {
      // Omit `preferredVatCode` from the UPDATE payload when the field is
      // absent from the form — preserves the existing preference instead of
      // overwriting it with null.
      await tx
        .update(businesses)
        .set({
          businessName,
          address,
          streetNumber,
          city,
          province,
          zipCode,
          ...(hasPreferredVatCode && { preferredVatCode }),
        })
        .where(eq(businesses.id, existing.id));

      return { businessId: existing.id };
    }

    const [newBiz] = await tx
      .insert(businesses)
      .values({
        profileId: profile.id,
        businessName,
        address,
        streetNumber,
        city,
        province,
        zipCode,
        preferredVatCode,
      })
      .returning({ id: businesses.id });

    return { businessId: newBiz.id };
  });
}

export async function saveAdeCredentials(
  formData: FormData,
): Promise<OnboardingActionResult> {
  const user = await getAuthenticatedUser();

  const businessId = getFormString(formData, "businessId");
  const codiceFiscale = getFormString(formData, "codiceFiscale");
  // La password Fisconline è una credenziale opaca (regole AdE: 8–15 char,
  // charset misto). Non trimmare: ogni byte ha significato semantico —
  // lo stesso principio della password app.
  const password = getFormStringRaw(formData, "password");
  // PIN già validato a regex `^\d{10}$`: trimming è sicuro perché
  // qualsiasi whitespace verrebbe comunque rifiutato dallo schema.
  const pin = getFormString(formData, "pin");

  if (!businessId) {
    return { error: "Business ID mancante." };
  }
  if (codiceFiscale.length !== 16) {
    return { error: "Codice fiscale non valido (16 caratteri)." };
  }
  if (!password) {
    return { error: "Password Fisconline obbligatoria." };
  }
  const pinResult = adePinSchema.safeParse(pin);
  if (!pinResult.success) {
    return {
      error: pinResult.error.issues[0]?.message ?? "PIN Fisconline non valido.",
    };
  }

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) return ownershipError;

  const key = getEncryptionKey();
  const keyVersion = getKeyVersion();

  const encryptedCodiceFiscale = encrypt(codiceFiscale, key, keyVersion);
  const encryptedPassword = encrypt(password, key, keyVersion);
  const encryptedPin = encrypt(pin, key, keyVersion);

  const db = getDb();

  // Atomic upsert per evitare race condition (doppio submit del form, retry
  // di rete) — il vincolo UNIQUE su business_id garantisce 1:1.
  // verifiedAt: null al re-insert E al conflict update — credenziali nuove
  // non sono ancora state verificate contro AdE.
  await db
    .insert(adeCredentials)
    .values({
      businessId,
      encryptedCodiceFiscale,
      encryptedPassword,
      encryptedPin,
      keyVersion,
    })
    .onConflictDoUpdate({
      target: adeCredentials.businessId,
      set: {
        encryptedCodiceFiscale,
        encryptedPassword,
        encryptedPin,
        keyVersion,
        verifiedAt: null,
      },
    });

  logger.info({ businessId }, "ADE credentials updated");

  // Invalida la Router Cache client-side del dashboard: dopo aver salvato le
  // credenziali l'utente è eleggibile ad accedere al dashboard, ma il redirect
  // precedente (dashboard → onboarding) potrebbe essere ancora in cache.
  revalidatePath("/dashboard", "layout");

  return { businessId };
}

export async function verifyAdeCredentials(
  businessId: string,
): Promise<OnboardingActionResult> {
  const user = await getAuthenticatedUser();

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) return ownershipError;

  const db = getDb();

  const [cred] = await db
    .select()
    .from(adeCredentials)
    .where(eq(adeCredentials.businessId, businessId))
    .limit(1);

  if (!cred) {
    return { error: "Credenziali non trovate." };
  }

  // Snapshot fiscalCode BEFORE the transaction that sets it. fiscalCode is
  // assigned once on the first successful AdE verification and never reset
  // (saveBusiness/saveAdeCredentials preserve it), so its absence is the
  // canonical "user has never completed onboarding" signal. Using
  // cred.verifiedAt would re-fire welcome/operator emails when the user
  // replaces credentials (saveAdeCredentials resets verifiedAt to null) and
  // re-verifies — fiscalCode survives that path.
  const [businessSnapshot] = await db
    .select({ fiscalCode: businesses.fiscalCode })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  const wasAlreadyOnboarded = Boolean(businessSnapshot?.fiscalCode);

  // Snapshot updatedAt to detect concurrent credential updates (optimistic locking).
  // If the user saves new credentials while AdE login is in progress, the WHERE
  // below will match 0 rows, preventing verifiedAt from being set on stale data.
  const credentialVersion = cred.updatedAt;

  const key = getEncryptionKey();
  const keys = new Map<number, Buffer>([[cred.keyVersion, key]]);

  const codiceFiscale = decrypt(cred.encryptedCodiceFiscale, keys);
  const password = decrypt(cred.encryptedPassword, keys);
  const pin = decrypt(cred.encryptedPin, keys);

  const adeClient = createAdeClient(getAdeMode());

  try {
    await adeClient.login({ codiceFiscale, password, pin });
  } catch (err) {
    if (err instanceof AdePasswordExpiredError) {
      logger.warn({ businessId }, "AdE password scaduta durante verifica");
      return {
        error: "La password Fisconline è scaduta.",
        passwordExpired: true,
      };
    }
    logAdeFailure(
      err,
      { businessId },
      {
        transient: "AdE credential verification: transient failure",
        failure: "AdE credential verification failed",
      },
    );
    const userFacing = getUserFacingAdeErrorMessage(
      err,
      "Verifica fallita. Controlla le credenziali Fisconline.",
    );
    return {
      error: userFacing.message,
      ...(userFacing.passwordExpired ? { passwordExpired: true } : {}),
    };
  }

  // Fetch fiscal data from AdE while the session is still active. Best-effort:
  // verification still succeeds (verifiedAt set) even if AdE doesn't return it;
  // P.IVA/CF are then filled on a later run.
  let fiscalData: Awaited<ReturnType<typeof adeClient.getFiscalData>> | null =
    null;
  try {
    fiscalData = await adeClient.getFiscalData();
  } catch (err) {
    logger.error({ err, businessId }, "Failed to fetch fiscal data from AdE");
  } finally {
    await adeClient
      .logout()
      .catch((err) => logger.warn({ err }, "AdE logout failed"));
  }

  // Finalize atomically AND optimistically in a single transaction guarded by
  // the credential version snapshotted BEFORE talking to AdE. The guarded
  // verifiedAt UPDATE is the FIRST statement: if the user replaced the
  // credentials while AdE login/getFiscalData was in flight, it matches 0 rows
  // and the whole transaction is abandoned — so fiscal identity from a STALE
  // session is never written to businesses/profiles (review P1.1). Previously
  // only verifiedAt was guarded while vatNumber/fiscalCode/partitaIva were
  // written unconditionally, corrupting the business identity on a concurrent
  // credential swap.
  //
  // date_trunc to milliseconds: defaultNow() lets PostgreSQL set updatedAt via
  // NOW() (microsecond precision), but JS Date is only millisecond-precise.
  // Truncating before comparison prevents false mismatches on the first SELECT.
  // The snapshot is serialized as ISO string + `::timestamptz` cast: inside a
  // raw `sql` template Drizzle has no column-type context to bind a JS Date and
  // would crash `Buffer.byteLength(<Date>)` in postgres-js.
  let credentialsChanged = false;
  try {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(adeCredentials)
        .set({ verifiedAt: new Date() })
        .where(
          and(
            eq(adeCredentials.businessId, businessId),
            sql`date_trunc('milliseconds', ${adeCredentials.updatedAt}) = ${credentialVersion.toISOString()}::timestamptz`,
          ),
        )
        .returning({ id: adeCredentials.id });

      if (updated.length === 0) {
        // Optimistic-lock miss: credentials replaced during verification.
        // Abort without writing any fiscal data from the stale session.
        credentialsChanged = true;
        return;
      }

      if (fiscalData) {
        const vatNumber = fiscalData.identificativiFiscali.partitaIva;
        const fiscalCode = fiscalData.identificativiFiscali.codiceFiscale;

        await tx
          .update(businesses)
          .set({ vatNumber, fiscalCode })
          .where(eq(businesses.id, businessId));

        // Anti-abuso trial: la P.IVA è UNIQUE su profiles per impedire trial
        // multipli con email diverse ma stessa P.IVA. Il vincolo DB fa fallire
        // l'INSERT/UPDATE e l'intera transazione esegue rollback (verifiedAt
        // incluso), così nessun dato resta in stato parziale.
        await tx
          .update(profiles)
          .set({ partitaIva: vatNumber })
          .where(eq(profiles.authUserId, user.id));
      }
    });
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      logger.warn({ businessId }, "P.IVA già in uso — possibile abuso trial");
      return { error: "Questa P.IVA è già associata a un altro account." };
    }
    logger.error(
      { err, businessId, critical: true },
      "verifyAdeCredentials: finalizzazione DB fallita dopo verifica AdE",
    );
    return {
      error:
        "Verifica riuscita ma il salvataggio è fallito. Riprova tra qualche istante.",
    };
  }

  if (credentialsChanged) {
    // Credentials were replaced while AdE login was in progress: neither the
    // fiscal identity nor verifiedAt was written. The new credentials will be
    // verified on the next attempt.
    logger.warn(
      { businessId },
      "verifyAdeCredentials: credenziali modificate durante verifica, verifiedAt non impostato",
    );
    return { businessId };
  }

  // Send welcome email on first successful verification (fire-and-forget).
  // Gated on fiscalCode (not verifiedAt) to avoid duplicate emails when the
  // user replaces AdE credentials and re-verifies — see snapshot above.
  if (!wasAlreadyOnboarded && user.email) {
    void sendEmail({
      to: user.email,
      subject: "Sei pronto! Inizia a emettere scontrini con ScontrinoZero",
      react: createElement(WelcomeEmail, { email: user.email }),
    }).catch((err) => logger.error({ err }, "Welcome email failed"));

    // Internal notification (fire-and-forget, non-critical, env-gated).
    void notifyOperatorOfNewSignup(user.id).catch((err) =>
      logger.warn({ err }, "Operator signup notification failed"),
    );
  }

  revalidatePath("/dashboard", "layout");

  return { businessId };
}

/**
 * Restituisce lo stato di onboarding dell'utente con un'unica query JOIN
 * (profile → business → credentials) anziché 3 query sequenziali.
 *
 * `cache()` di React deduplicaza le chiamate nello stesso render tree RSC:
 * `dashboard/layout.tsx` + `dashboard/<segment>/page.tsx` ora condividono
 * la stessa risposta invece di colpire il DB due volte. Combinato con il
 * JOIN, una page navigation dashboard scende da 6 query a 1.
 *
 * Nota CLAUDE.md: `cache()` non deduplicaza tra Route Handler e RSC, ma qui
 * tutti i caller sono RSC nello stesso request — funziona.
 */
export const getOnboardingStatus = cache(
  async (): Promise<OnboardingStatus> => {
    const user = await getAuthenticatedUser();
    const db = getDb();

    const [row] = await db
      .select({
        profileId: profiles.id,
        businessId: businesses.id,
        hasCredentials: sql<boolean>`(${adeCredentials.id} is not null)`,
        credentialsVerified: sql<boolean>`(${adeCredentials.verifiedAt} is not null)`,
      })
      .from(profiles)
      .leftJoin(businesses, eq(businesses.profileId, profiles.id))
      .leftJoin(adeCredentials, eq(adeCredentials.businessId, businesses.id))
      .where(eq(profiles.authUserId, user.id))
      .limit(1);

    if (!row) {
      return {
        hasProfile: false,
        hasBusiness: false,
        hasCredentials: false,
        credentialsVerified: false,
      };
    }

    if (!row.businessId) {
      return {
        hasProfile: true,
        hasBusiness: false,
        hasCredentials: false,
        credentialsVerified: false,
      };
    }

    return {
      hasProfile: true,
      hasBusiness: true,
      businessId: row.businessId,
      hasCredentials: row.hasCredentials,
      credentialsVerified: row.credentialsVerified,
    };
  },
);

const ADE_PASSWORD_REGEX = /^[a-zA-Z0-9*+§°ç@^?=)(/&%$£!|\\<>]{8,15}$/;

export async function changeAdePassword(
  businessId: string,
  currentPassword: string,
  newPassword: string,
  confirmNewPassword: string,
): Promise<OnboardingActionResult> {
  const user = await getAuthenticatedUser();

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) return ownershipError;

  const rateLimitResult = changePasswordLimiter.check(
    `change-ade-pw:${user.id}`,
  );
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "changeAdePassword rate limit exceeded");
    return { error: ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES };
  }

  if (!ADE_PASSWORD_REGEX.test(newPassword)) {
    return {
      error:
        "Password non valida. Usa 8–15 caratteri: lettere (non accentate), numeri o caratteri speciali.",
    };
  }
  if (newPassword !== confirmNewPassword) {
    return { error: "Le password non coincidono." };
  }
  if (newPassword === currentPassword) {
    return {
      error: "La nuova password deve essere diversa da quella attuale.",
    };
  }

  const db = getDb();
  const [cred] = await db
    .select()
    .from(adeCredentials)
    .where(eq(adeCredentials.businessId, businessId))
    .limit(1);

  if (!cred) return { error: "Credenziali non trovate." };

  const key = getEncryptionKey();
  const keys = new Map<number, Buffer>([[cred.keyVersion, key]]);
  const codiceFiscale = decrypt(cred.encryptedCodiceFiscale, keys);

  const adeClient = createAdeClient(getAdeMode());

  try {
    await adeClient.changePasswordFisconline({
      codiceFiscale,
      oldPassword: currentPassword,
      newPassword,
      confirmNewPassword,
    });
  } catch (err) {
    if (err instanceof AdeAuthError) {
      logger.warn({ businessId }, "changeAdePassword: password attuale errata");
      return { error: "Password attuale non corretta." };
    }
    if (err instanceof AdeError && err.code === "ADE_CHANGE_PW_SAME") {
      return {
        error: "La nuova password deve essere diversa da quella attuale.",
      };
    }
    logAdeFailure(
      err,
      { businessId },
      {
        transient: "changeAdePassword: AdE transient failure",
        failure: "Cambio password AdE fallito",
      },
    );
    const userFacing = getUserFacingAdeErrorMessage(
      err,
      "Errore durante il cambio password. Riprova più tardi.",
    );
    return { error: userFacing.message };
  }

  const newEncryptedPassword = encrypt(newPassword, key, cred.keyVersion);
  await db
    .update(adeCredentials)
    .set({ encryptedPassword: newEncryptedPassword, verifiedAt: new Date() })
    .where(eq(adeCredentials.businessId, businessId));

  revalidatePath("/dashboard", "layout");
  logger.info({ businessId }, "Password Fisconline aggiornata con successo");
  return { businessId };
}
