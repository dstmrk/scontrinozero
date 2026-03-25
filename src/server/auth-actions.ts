"use server";

import { createElement } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { isValidEmail, isStrongPassword } from "@/lib/validation";
import { RateLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email";
import { PasswordResetEmail } from "@/emails/password-reset";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const CURRENT_TERMS_VERSION = "v01";

const authLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

export type AuthActionResult = {
  error?: string;
  email?: string;
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

async function verifyCaptcha(token: string | null): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    logger.error("TURNSTILE_SECRET_KEY not configured");
    return false;
  }
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, response: token }),
      },
    );
    if (!response.ok) return false;
    const data = (await response.json()) as { success: boolean };
    return data.success === true;
  } catch (err) {
    logger.error({ err }, "Turnstile verification request failed");
    return false;
  }
}

export async function signUp(formData: FormData): Promise<AuthActionResult> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;
  const termsAccepted = formData.get("termsAccepted");
  const specificClausesAccepted = formData.get("specificClausesAccepted");
  const captchaToken = formData.get("captchaToken") as string | null;

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
  if (termsAccepted !== "true") {
    return {
      error: "Devi accettare i Termini di servizio e la Privacy Policy.",
    };
  }
  if (specificClausesAccepted !== "true") {
    return {
      error: "Devi accettare specificamente le clausole indicate.",
    };
  }

  const captchaOk = await verifyCaptcha(captchaToken);
  if (!captchaOk) {
    return { error: "Verifica CAPTCHA fallita. Riprova." };
  }

  const ip = await getClientIp();
  const rateLimited = checkRateLimit(ip, "signUp");
  if (rateLimited) return rateLimited;

  // Pre-check: block re-registration before hitting Supabase.
  // Supabase's behaviour for duplicate emails varies by config (anti-enumeration
  // returns null user; auto-confirm may create a new auth user with a different UUID).
  // Checking our own table by email is the only reliable guard in all cases.
  try {
    const db = getDb();
    const [existingByEmail] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.email, email))
      .limit(1);

    if (existingByEmail) {
      return {
        error:
          "Un account con questa email esiste già. Accedi oppure reimposta la password.",
      };
    }
  } catch (err) {
    logger.error({ err }, "Pre-registration email check failed");
    return { error: "Registrazione fallita. Riprova." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    logger.error({ error: error.message }, "signUp failed");
    return { error: "Registrazione fallita. Riprova." };
  }

  // Create profile in our DB (mandatory: records terms acceptance for compliance)
  if (data.user) {
    try {
      const db = getDb();

      await db.insert(profiles).values({
        authUserId: data.user.id,
        email,
        termsAcceptedAt: new Date(),
        termsVersion: CURRENT_TERMS_VERSION,
      });
    } catch (err) {
      logger.error(
        { err },
        "Failed to record terms acceptance; blocking signup",
      );
      return { error: "Registrazione fallita. Riprova." };
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
    return { error: "Email o password non corretti.", email };
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

  const supabaseAdmin = createAdminSupabaseClient();
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (error || !data.properties?.action_link) {
    logger.error(
      { error: error?.message },
      "Reset password generateLink failed",
    );
    // Always redirect to avoid email enumeration
    redirect("/verify-email");
  }

  void sendEmail({
    to: email,
    subject: "Reimposta la tua password — ScontrinoZero",
    react: createElement(PasswordResetEmail, {
      resetLink: data.properties.action_link,
    }),
  }).catch((err) => logger.warn({ err }, "Password reset email failed"));

  redirect("/verify-email");
}
