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
import {
  isStrongPassword,
  isValidItalianZipCode,
  ITALIAN_ZIP_MESSAGE,
} from "@/lib/validation";
import { getClientIp } from "@/lib/get-client-ip";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { ERROR_MESSAGES } from "@/lib/error-messages";
import { getFormString, getFormStringOrNull } from "@/lib/form-utils";

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

export async function updateProfile(
  formData: FormData,
): Promise<ProfileActionResult> {
  const user = await getAuthenticatedUser();

  const firstName = getFormString(formData, "firstName");
  const lastName = getFormString(formData, "lastName");

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

  const businessId = getFormString(formData, "businessId");
  const businessName = getFormStringOrNull(formData, "businessName");
  const address = getFormString(formData, "address");
  const streetNumber = getFormStringOrNull(formData, "streetNumber");
  const city = getFormStringOrNull(formData, "city");
  const province = getFormStringOrNull(formData, "province");
  const zipCode = getFormString(formData, "zipCode");

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
  if (!isValidItalianZipCode(zipCode)) return { error: ITALIAN_ZIP_MESSAGE };

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) return ownershipError;

  const rateLimitResult = updateBusinessLimiter.check(
    `updateBusiness:${user.id}`,
  );
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "updateBusiness rate limit exceeded");
    return { error: ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES };
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

  const currentPassword = getFormString(formData, "currentPassword");
  const newPassword = getFormString(formData, "newPassword");
  const confirmPassword = getFormString(formData, "confirmPassword");

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
