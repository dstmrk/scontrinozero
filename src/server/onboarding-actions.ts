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
import { createAdeClient } from "@/lib/ade";
import {
  AdeAuthError,
  AdeError,
  AdePasswordExpiredError,
} from "@/lib/ade/errors";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email";
import { WelcomeEmail } from "@/emails/welcome";
import {
  getAuthenticatedUser,
  checkBusinessOwnership,
} from "@/lib/server-auth";
import {
  adePinSchema,
  isValidItalianZipCode,
  ITALIAN_ZIP_MESSAGE,
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
  if (input.firstName.length > 80)
    return "Il nome non può superare 80 caratteri.";
  if (!input.lastName) return "Il cognome è obbligatorio.";
  if (input.lastName.length > 80)
    return "Il cognome non può superare 80 caratteri.";
  if (input.businessName && input.businessName.length > 120)
    return "La ragione sociale non può superare 120 caratteri.";
  if (!input.address) return "L'indirizzo è obbligatorio.";
  if (input.address.length > 150)
    return "L'indirizzo non può superare 150 caratteri.";
  if (input.city && input.city.length > 80)
    return "Il comune non può superare 80 caratteri.";
  if (input.province && input.province.length > 3)
    return "La provincia non può superare 3 caratteri.";
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

  // Snapshot updatedAt to detect concurrent credential updates (optimistic locking).
  // If the user saves new credentials while AdE login is in progress, the WHERE
  // below will match 0 rows, preventing verifiedAt from being set on stale data.
  const credentialVersion = cred.updatedAt;

  const key = getEncryptionKey();
  const keys = new Map<number, Buffer>([[cred.keyVersion, key]]);

  const codiceFiscale = decrypt(cred.encryptedCodiceFiscale, keys);
  const password = decrypt(cred.encryptedPassword, keys);
  const pin = decrypt(cred.encryptedPin, keys);

  const adeMode = (process.env.ADE_MODE as "mock" | "real") || "mock";
  const adeClient = createAdeClient(adeMode);

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
    logger.error({ err, businessId }, "AdE credential verification failed");
    return { error: "Verifica fallita. Controlla le credenziali Fisconline." };
  }

  try {
    // Fetch fiscal data from AdE while session is active
    try {
      const fiscalData = await adeClient.getFiscalData();
      const vatNumber = fiscalData.identificativiFiscali.partitaIva;
      const fiscalCode = fiscalData.identificativiFiscali.codiceFiscale;

      // Wrap both DB writes in a transaction: if the profile update fails (e.g.
      // unique constraint on partitaIva for trial-abuse detection), the businesses
      // update must also be rolled back so neither record is left in a partial state.
      await db.transaction(async (tx) => {
        await tx
          .update(businesses)
          .set({ vatNumber, fiscalCode })
          .where(eq(businesses.id, businessId));

        // Anti-abuso trial: la P.IVA è UNIQUE su profiles per impedire trial multipli
        // con email diverse ma stessa P.IVA. Vincolo DB garantisce atomicità.
        await tx
          .update(profiles)
          .set({ partitaIva: vatNumber })
          .where(eq(profiles.authUserId, user.id));
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        logger.warn({ businessId }, "P.IVA già in uso — possibile abuso trial");
        return { error: "Questa P.IVA è già associata a un altro account." };
      }
      logger.error({ err, businessId }, "Failed to fetch fiscal data from AdE");
      // Non-blocking per altri errori: verifica comunque riuscita, P.IVA/CF aggiunti in seguito
    }
  } finally {
    await adeClient
      .logout()
      .catch((err) => logger.warn({ err }, "AdE logout failed"));
  }

  // Mark credentials as verified, but only if they haven't been replaced since
  // we read them (optimistic locking via updatedAt snapshot taken above).
  // date_trunc to milliseconds: defaultNow() lets PostgreSQL set updatedAt via
  // NOW() (microsecond precision), but JS Date is only millisecond-precise.
  // Truncating before comparison prevents false mismatches on the first SELECT.
  const updated = await db
    .update(adeCredentials)
    .set({ verifiedAt: new Date() })
    .where(
      and(
        eq(adeCredentials.businessId, businessId),
        sql`date_trunc('milliseconds', ${adeCredentials.updatedAt}) = ${credentialVersion}`,
      ),
    )
    .returning({ id: adeCredentials.id });

  if (updated.length === 0) {
    // Credentials were changed while AdE login was in progress.
    // Return success with the businessId — the user's new credentials
    // are not verified yet and will be checked on the next operation.
    logger.warn(
      { businessId },
      "verifyAdeCredentials: credenziali modificate durante verifica, verifiedAt non impostato",
    );
    return { businessId };
  }

  // Send welcome email on first successful verification (fire-and-forget)
  if (!cred.verifiedAt && user.email) {
    void sendEmail({
      to: user.email,
      subject: "Sei pronto! Inizia a emettere scontrini con ScontrinoZero",
      react: createElement(WelcomeEmail, { email: user.email }),
    }).catch((err) => logger.error({ err }, "Welcome email failed"));
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

  const adeMode = (process.env.ADE_MODE as "mock" | "real") || "mock";
  const adeClient = createAdeClient(adeMode);

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
    logger.error({ err, businessId }, "Cambio password AdE fallito");
    return { error: "Errore durante il cambio password. Riprova più tardi." };
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
