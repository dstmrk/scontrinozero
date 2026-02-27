"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { isValidEmail, isStrongPassword } from "@/lib/validation";
import { RateLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const authLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

export type AuthActionResult = {
  error?: string;
};

async function getClientIp(): Promise<string> {
  const hdrs = await headers();
  // CF-Connecting-IP: trusted Cloudflare header (not forgeable via x-forwarded-for)
  return (
    hdrs.get("cf-connecting-ip") ||
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown"
  );
}

function checkRateLimit(ip: string, action: string): AuthActionResult | null {
  const key = `${action}:${ip}`;
  const result = authLimiter.check(key);
  if (!result.success) {
    logger.warn({ ip, action }, "Auth rate limit exceeded");
    return { error: "Troppi tentativi. Riprova tra qualche minuto." };
  }
  return null;
}

export async function signUp(formData: FormData): Promise<AuthActionResult> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!email || !isValidEmail(email)) {
    return { error: "Email non valida." };
  }
  if (!password || !isStrongPassword(password)) {
    return {
      error:
        "Password non sicura. Usa almeno 8 caratteri con maiuscola, minuscola, numero e carattere speciale.",
    };
  }
  if (password !== confirmPassword) {
    return { error: "Le password non coincidono." };
  }

  const ip = await getClientIp();
  const rateLimited = checkRateLimit(ip, "signUp");
  if (rateLimited) return rateLimited;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    logger.error({ error: error.message }, "signUp failed");
    return { error: "Registrazione fallita. Riprova." };
  }

  // Create profile in our DB
  if (data.user) {
    try {
      const db = getDb();
      await db.insert(profiles).values({
        authUserId: data.user.id,
        email,
      });
    } catch (err) {
      logger.error({ err }, "Failed to create profile after signUp");
    }
  }

  redirect("/verify-email");
}

export async function signIn(formData: FormData): Promise<AuthActionResult> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !isValidEmail(email)) {
    return { error: "Email non valida." };
  }
  if (!password) {
    return { error: "Inserisci la password." };
  }

  const ip = await getClientIp();
  const rateLimited = checkRateLimit(ip, "signIn");
  if (rateLimited) return rateLimited;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    logger.warn("signIn failed");
    return { error: "Email o password non corretti." };
  }

  redirect("/dashboard");
}

export async function signInWithMagicLink(
  formData: FormData,
): Promise<AuthActionResult> {
  const email = formData.get("email") as string;

  if (!email || !isValidEmail(email)) {
    return { error: "Email non valida." };
  }

  const ip = await getClientIp();
  const rateLimited = checkRateLimit(ip, "magicLink");
  if (rateLimited) return rateLimited;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    logger.error({ error: error.message }, "Magic link failed");
    return { error: "Invio link fallito. Riprova." };
  }

  redirect("/verify-email");
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function resetPassword(
  formData: FormData,
): Promise<AuthActionResult> {
  const email = formData.get("email") as string;

  if (!email || !isValidEmail(email)) {
    return { error: "Email non valida." };
  }

  const ip = await getClientIp();
  const rateLimited = checkRateLimit(ip, "resetPassword");
  if (rateLimited) return rateLimited;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    logger.error({ error: error.message }, "Reset password failed");
  }

  // Always redirect to avoid email enumeration
  redirect("/verify-email");
}
