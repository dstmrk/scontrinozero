"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, adeCredentials, profiles } from "@/db/schema";
import {
  encrypt,
  decrypt,
  getEncryptionKey,
  getKeyVersion,
} from "@/lib/crypto";
import { createAdeClient } from "@/lib/ade";
import { logger } from "@/lib/logger";
import {
  getAuthenticatedUser,
  checkBusinessOwnership,
} from "@/lib/server-auth";

export type OnboardingActionResult = {
  error?: string;
  businessId?: string;
};

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
  if (!lastName) {
    return { error: "Il cognome è obbligatorio." };
  }
  if (!address) {
    return { error: "L'indirizzo è obbligatorio." };
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

  // Save firstName + lastName on the profile
  await db
    .update(profiles)
    .set({ firstName, lastName })
    .where(eq(profiles.id, profile.id));

  // Upsert: check if business already exists for this profile
  const [existing] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.profileId, profile.id))
    .limit(1);

  if (existing) {
    await db
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

  const [newBiz] = await db
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
  if (!pin || pin.length < 6) {
    return { error: "PIN Fisconline non valido (minimo 6 cifre)." };
  }

  const key = getEncryptionKey();
  const keyVersion = getKeyVersion();

  const encryptedCodiceFiscale = encrypt(codiceFiscale, key, keyVersion);
  const encryptedPassword = encrypt(password, key, keyVersion);
  const encryptedPin = encrypt(pin, key, keyVersion);

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) return ownershipError;

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

  const key = getEncryptionKey();
  const keys = new Map<number, Buffer>([[cred.keyVersion, key]]);

  const codiceFiscale = decrypt(cred.encryptedCodiceFiscale, keys);
  const password = decrypt(cred.encryptedPassword, keys);
  const pin = decrypt(cred.encryptedPin, keys);

  const adeMode = (process.env.ADE_MODE as "mock" | "real") || "mock";
  const adeClient = createAdeClient(adeMode);

  try {
    await adeClient.login({ codiceFiscale, password, pin });
    await adeClient.logout();
  } catch (err) {
    logger.error({ err, businessId }, "AdE credential verification failed");
    return { error: "Verifica fallita. Controlla le credenziali Fisconline." };
  }

  // Fetch fiscal data from AdE and persist vatNumber + fiscalCode
  try {
    const fiscalData = await adeClient.getFiscalData();
    const vatNumber = fiscalData.identificativiFiscali.partitaIva;
    const fiscalCode = fiscalData.identificativiFiscali.codiceFiscale;

    await db
      .update(businesses)
      .set({ vatNumber, fiscalCode })
      .where(eq(businesses.id, businessId));
  } catch (err) {
    logger.error({ err, businessId }, "Failed to fetch fiscal data from AdE");
    // Non-blocking: verifica comunque riuscita, P.IVA/CF aggiunti in seguito
  }

  // Mark credentials as verified
  await db
    .update(adeCredentials)
    .set({ verifiedAt: new Date() })
    .where(eq(adeCredentials.businessId, businessId));

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
