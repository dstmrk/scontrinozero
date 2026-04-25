"use server";

import { createElement } from "react";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
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
import { RateLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email";
import { WelcomeEmail } from "@/emails/welcome";
import {
  getAuthenticatedUser,
  checkBusinessOwnership,
} from "@/lib/server-auth";
import { adePinSchema } from "@/lib/validation";

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "23505"
  );
}

export type OnboardingActionResult = {
  error?: string;
  businessId?: string;
  passwordExpired?: boolean;
};

const changePasswordLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

export type OnboardingStatus = {
  hasProfile: boolean;
  hasBusiness: boolean;
  hasCredentials: boolean;
  credentialsVerified: boolean;
  businessId?: string;
};

export async function saveBusiness(
  formData: FormData,
): Promise<OnboardingActionResult> {
  const user = await getAuthenticatedUser();

  const firstName = (formData.get("firstName") as string)?.trim();
  const lastName = (formData.get("lastName") as string)?.trim();
  const businessName = (formData.get("businessName") as string)?.trim() || null;
  const address = (formData.get("address") as string)?.trim();
  const streetNumber = (formData.get("streetNumber") as string)?.trim() || null;
  const zipCode = (formData.get("zipCode") as string)?.trim();
  const city = (formData.get("city") as string)?.trim() || null;
  const province = (formData.get("province") as string)?.trim() || null;
  const preferredVatCode =
    (formData.get("preferredVatCode") as string)?.trim() || null;

  if (!firstName) {
    return { error: "Il nome è obbligatorio." };
  }
  if (firstName.length > 80) {
    return { error: "Il nome non può superare 80 caratteri." };
  }
  if (!lastName) {
    return { error: "Il cognome è obbligatorio." };
  }
  if (lastName.length > 80) {
    return { error: "Il cognome non può superare 80 caratteri." };
  }
  if (businessName && businessName.length > 120) {
    return { error: "La ragione sociale non può superare 120 caratteri." };
  }
  if (!address) {
    return { error: "L'indirizzo è obbligatorio." };
  }
  if (address.length > 150) {
    return { error: "L'indirizzo non può superare 150 caratteri." };
  }
  if (city && city.length > 80) {
    return { error: "Il comune non può superare 80 caratteri." };
  }
  if (province && province.length > 3) {
    return { error: "La provincia non può superare 3 caratteri." };
  }
  if (!zipCode || !/^\d{5}$/.test(zipCode)) {
    return { error: "CAP non valido (5 cifre numeriche)." };
  }

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
    // Save firstName + lastName on the profile
    await tx
      .update(profiles)
      .set({ firstName, lastName })
      .where(eq(profiles.id, profile.id));

    // Upsert: check if business already exists for this profile
    const [existing] = await tx
      .select()
      .from(businesses)
      .where(eq(businesses.profileId, profile.id))
      .limit(1);

    if (existing) {
      await tx
        .update(businesses)
        .set({
          businessName,
          address,
          streetNumber,
          city,
          province,
          zipCode,
          preferredVatCode,
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

  const businessId = formData.get("businessId") as string;
  const codiceFiscale = (formData.get("codiceFiscale") as string)?.trim();
  const password = formData.get("password") as string;
  const pin = (formData.get("pin") as string)?.trim();

  if (!businessId) {
    return { error: "Business ID mancante." };
  }
  if (codiceFiscale?.length !== 16) {
    return { error: "Codice fiscale non valido (16 caratteri)." };
  }
  if (!password) {
    return { error: "Password Fisconline obbligatoria." };
  }
  const pinResult = adePinSchema.safeParse(pin ?? "");
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

  // Upsert credentials
  const [existing] = await db
    .select()
    .from(adeCredentials)
    .where(eq(adeCredentials.businessId, businessId))
    .limit(1);

  if (existing) {
    await db
      .update(adeCredentials)
      .set({
        encryptedCodiceFiscale,
        encryptedPassword,
        encryptedPin,
        keyVersion,
        verifiedAt: null, // Reset verification on credential change
      })
      .where(eq(adeCredentials.id, existing.id));
  } else {
    await db.insert(adeCredentials).values({
      businessId,
      encryptedCodiceFiscale,
      encryptedPassword,
      encryptedPin,
      keyVersion,
    });
  }

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
  const updated = await db
    .update(adeCredentials)
    .set({ verifiedAt: new Date() })
    .where(
      and(
        eq(adeCredentials.businessId, businessId),
        eq(adeCredentials.updatedAt, credentialVersion),
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

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const user = await getAuthenticatedUser();
  const db = getDb();

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.authUserId, user.id))
    .limit(1);

  if (!profile) {
    return {
      hasProfile: false,
      hasBusiness: false,
      hasCredentials: false,
      credentialsVerified: false,
    };
  }

  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.profileId, profile.id))
    .limit(1);

  if (!business) {
    return {
      hasProfile: true,
      hasBusiness: false,
      hasCredentials: false,
      credentialsVerified: false,
    };
  }

  const [cred] = await db
    .select()
    .from(adeCredentials)
    .where(eq(adeCredentials.businessId, business.id))
    .limit(1);

  return {
    hasProfile: true,
    hasBusiness: true,
    businessId: business.id,
    hasCredentials: !!cred,
    credentialsVerified: !!cred?.verifiedAt,
  };
}

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
    return { error: "Troppi tentativi. Riprova tra qualche minuto." };
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
