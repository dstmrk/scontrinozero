"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { profiles, businesses } from "@/db/schema";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getAuthenticatedUser,
  checkBusinessOwnership,
} from "@/lib/server-auth";
import { isStrongPassword } from "@/lib/validation";
import { getClientIp } from "@/lib/get-client-ip";
import { RateLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export type ProfileActionResult = { error?: string };

const updateProfileLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
});

const updateBusinessLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
});

const changePasswordLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes — same threshold as other auth actions
});

export async function updateProfile(
  formData: FormData,
): Promise<ProfileActionResult> {
  const user = await getAuthenticatedUser();

  const firstName = (formData.get("firstName") as string)?.trim();
  const lastName = (formData.get("lastName") as string)?.trim();

  if (!firstName) return { error: "Il nome è obbligatorio." };
  if (firstName.length > 80)
    return { error: "Il nome non può superare 80 caratteri." };
  if (!lastName) return { error: "Il cognome è obbligatorio." };
  if (lastName.length > 80)
    return { error: "Il cognome non può superare 80 caratteri." };

  const rateLimitResult = updateProfileLimiter.check(
    `updateProfile:${user.id}`,
  );
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "updateProfile rate limit exceeded");
    return { error: "Troppi tentativi. Riprova tra qualche minuto." };
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

  const businessId = (formData.get("businessId") as string)?.trim();
  const businessName = (formData.get("businessName") as string)?.trim() || null;
  const address = (formData.get("address") as string)?.trim();
  const streetNumber = (formData.get("streetNumber") as string)?.trim() || null;
  const city = (formData.get("city") as string)?.trim() || null;
  const province = (formData.get("province") as string)?.trim() || null;
  const zipCode = (formData.get("zipCode") as string)?.trim();

  if (!businessId) return { error: "Business ID mancante." };
  if (businessName && businessName.length > 120)
    return { error: "La ragione sociale non può superare 120 caratteri." };
  if (!address) return { error: "L'indirizzo è obbligatorio." };
  if (address.length > 150)
    return { error: "L'indirizzo non può superare 150 caratteri." };
  if (city && city.length > 80)
    return { error: "Il comune non può superare 80 caratteri." };
  if (province && province.length > 3)
    return { error: "La provincia non può superare 3 caratteri." };
  if (!zipCode || !/^\d{5}$/.test(zipCode))
    return { error: "CAP non valido (5 cifre numeriche)." };

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) return ownershipError;

  const rateLimitResult = updateBusinessLimiter.check(
    `updateBusiness:${user.id}`,
  );
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "updateBusiness rate limit exceeded");
    return { error: "Troppi tentativi. Riprova tra qualche minuto." };
  }

  const db = getDb();
  await db
    .update(businesses)
    .set({ businessName, address, streetNumber, city, province, zipCode })
    .where(eq(businesses.id, businessId));

  revalidatePath("/dashboard/settings");
  return {};
}

export async function changePassword(
  formData: FormData,
): Promise<ProfileActionResult> {
  const user = await getAuthenticatedUser();

  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword) return { error: "Inserisci la password attuale." };
  if (!newPassword || !isStrongPassword(newPassword)) {
    return {
      error:
        "La nuova password non è sicura. Usa almeno 8 caratteri con maiuscola, minuscola, numero e carattere speciale.",
    };
  }
  if (newPassword !== confirmPassword) {
    return { error: "Le password non coincidono." };
  }

  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const rateLimitResult = changePasswordLimiter.check(`changePassword:${ip}`);
  if (!rateLimitResult.success) {
    logger.warn({ ip }, "changePassword rate limit exceeded");
    return { error: "Troppi tentativi. Riprova tra qualche minuto." };
  }

  const email = user.email;
  if (!email) return { error: "Email utente non disponibile." };

  // Re-authenticate to verify the current password before allowing a change.
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

  return {};
}
