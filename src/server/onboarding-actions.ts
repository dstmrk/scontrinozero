"use server";

import { eq } from "drizzle-orm";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import { businesses, adeCredentials, profiles } from "@/db/schema";
import { encrypt, decrypt } from "@/lib/crypto";
import { createAdeClient } from "@/lib/ade";
import { logger } from "@/lib/logger";

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

function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string");
  }
  return Buffer.from(hex, "hex");
}

function getKeyVersion(): number {
  return parseInt(process.env.ENCRYPTION_KEY_VERSION || "1", 10);
}

async function requireUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated");
  }
  return user;
}

export async function saveBusiness(
  formData: FormData,
): Promise<OnboardingActionResult> {
  const user = await requireUser();

  const businessName = (formData.get("businessName") as string)?.trim();
  const vatNumber = (formData.get("vatNumber") as string)?.trim();

  if (!businessName) {
    return { error: "Il nome dell'attivita e obbligatorio." };
  }
  if (!vatNumber || !/^\d{11}$/.test(vatNumber)) {
    return { error: "Partita IVA non valida (11 cifre)." };
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
        vatNumber,
        fiscalCode: (formData.get("fiscalCode") as string)?.trim() || null,
        address: (formData.get("address") as string)?.trim() || null,
        city: (formData.get("city") as string)?.trim() || null,
        province: (formData.get("province") as string)?.trim() || null,
        zipCode: (formData.get("zipCode") as string)?.trim() || null,
      })
      .where(eq(businesses.id, existing.id));

    return { businessId: existing.id };
  }

  const [newBiz] = await db
    .insert(businesses)
    .values({
      profileId: profile.id,
      businessName,
      vatNumber,
      fiscalCode: (formData.get("fiscalCode") as string)?.trim() || null,
      address: (formData.get("address") as string)?.trim() || null,
      city: (formData.get("city") as string)?.trim() || null,
      province: (formData.get("province") as string)?.trim() || null,
      zipCode: (formData.get("zipCode") as string)?.trim() || null,
    })
    .returning({ id: businesses.id });

  return { businessId: newBiz.id };
}

export async function saveAdeCredentials(
  formData: FormData,
): Promise<OnboardingActionResult> {
  await requireUser();

  const businessId = formData.get("businessId") as string;
  const codiceFiscale = (formData.get("codiceFiscale") as string)?.trim();
  const password = formData.get("password") as string;
  const pin = (formData.get("pin") as string)?.trim();

  if (!businessId) {
    return { error: "Business ID mancante." };
  }
  if (!codiceFiscale || codiceFiscale.length !== 16) {
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
  await requireUser();

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

  // Mark as verified
  await db
    .update(adeCredentials)
    .set({ verifiedAt: new Date() })
    .where(eq(adeCredentials.businessId, businessId));

  return { businessId };
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const user = await requireUser();
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
