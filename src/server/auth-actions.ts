"use server";

import { createElement } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import {
  isValidEmail,
  isStrongPassword,
  normalizeEmail,
} from "@/lib/validation";
import { getClientIp, hashIp } from "@/lib/get-client-ip";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email";
import { PasswordResetEmail } from "@/emails/password-reset";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ERROR_MESSAGES } from "@/lib/error-messages";
import { getFormString, getFormStringRaw } from "@/lib/form-utils";
import { isUniqueConstraintViolation } from "@/lib/db-errors";

const CURRENT_TERMS_VERSION = "v01";

const authLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: RATE_LIMIT_WINDOWS.AUTH_15_MIN,
});

export type AuthActionResult = {
  error?: string;
  email?: string;
};

async function getClientIpFromNextHeaders(): Promise<string> {
  const hdrs = await headers();
  return getClientIp(hdrs);
}

function checkRateLimit(ip: string, action: string): AuthActionResult | null {
  const key = `${action}:${ip}`;
  const result = authLimiter.check(key);
  if (!result.success) {
    logger.warn({ ip, action }, "Auth rate limit exceeded");
    return { error: ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES };
  }
  return null;
}

async function verifyCaptcha(
  token: string | null,
  remoteIp?: string,
): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    logger.error("TURNSTILE_SECRET_KEY not configured");
    return false;
  }
  try {
    // Forwarding `remoteip` lets Cloudflare correlate the verify call with the
    // visitor that solved the challenge (extra protection against token replay
    // from a different IP). We only send a non-empty trusted IP — see
    // CLAUDE.md §15: "CF-Connecting-IP is the only trusted source".
    const payload: Record<string, string> = { secret, response: token };
    if (remoteIp && remoteIp !== "unknown") {
      payload.remoteip = remoteIp;
    }

    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return false;
    const data = (await response.json()) as {
      success: boolean;
      hostname: string;
    };
    if (!data.success) return false;
    const expectedHostname =
      process.env.APP_HOSTNAME ?? // runtime override (sandbox, self-hosted)
      process.env.NEXT_PUBLIC_APP_HOSTNAME ?? // baked at build time
      "app.scontrinozero.it";
    if (data.hostname !== expectedHostname) {
      logger.warn(
        {
          captchaHostname: data.hostname,
          errorClass: "captcha_hostname_mismatch",
        },
        "Turnstile hostname mismatch",
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, "Turnstile verification request failed");
    return false;
  }
}

function validateSignUpInput(
  email: string,
  password: string,
  confirmPassword: string,
  termsAccepted: FormDataEntryValue | null,
  specificClausesAccepted: FormDataEntryValue | null,
): string | null {
  if (!email || !isValidEmail(email)) return "Email non valida.";
  if (!password || !isStrongPassword(password))
    return ERROR_MESSAGES.PASSWORD_NOT_STRONG;
  if (password !== confirmPassword) return ERROR_MESSAGES.PASSWORDS_MISMATCH;
  if (termsAccepted !== "true")
    return "Devi accettare i Termini di servizio e la Privacy Policy.";
  if (specificClausesAccepted !== "true")
    return "Devi accettare specificamente le clausole indicate.";
  return null;
}

async function insertProfileOrRollback(
  authUserId: string,
  email: string,
): Promise<AuthActionResult | null> {
  try {
    const db = getDb();
    await db.insert(profiles).values({
      authUserId,
      email,
      termsAcceptedAt: new Date(),
      termsVersion: CURRENT_TERMS_VERSION,
    });
    return null;
  } catch (err) {
    // Unique-constraint violation on lower(email): two concurrent signups raced.
    // Return the same user-friendly message as the pre-check to avoid disclosing
    // which constraint fired (prevents timing-based enumeration).
    if (isUniqueConstraintViolation(err)) {
      return {
        error:
          "Un account con questa email esiste già. Accedi oppure reimposta la password.",
      };
    }
    logger.error({ err }, "Failed to record terms acceptance; blocking signup");
    // Compensating delete: remove the auth user just created to avoid
    // zombie accounts (Supabase user without a profile in our DB).
    // Manual cleanup if retries fail: delete from auth.users by UUID in Supabase dashboard.
    const adminClient = createAdminSupabaseClient();
    try {
      const { error: deleteErr } =
        await adminClient.auth.admin.deleteUser(authUserId);
      if (deleteErr) {
        logger.error(
          { deleteErr },
          "Failed to delete auth user after profile creation failure",
        );
      }
    } catch (deleteErr) {
      logger.error(
        { deleteErr },
        "Failed to delete auth user after profile creation failure",
      );
    }
    return { error: "Registrazione fallita. Riprova." };
  }
}

export async function signUp(formData: FormData): Promise<AuthActionResult> {
  // Centralised email normalisation — consistent across signUp / signIn /
  // magicLink / resetPassword (CLAUDE.md regola 22).
  const email = normalizeEmail(getFormString(formData, "email"));
  // CRITICAL: passwords must NOT be trimmed — trimming changes credential
  // semantics and breaks login for users registered with leading/trailing
  // whitespace. See `getFormStringRaw` doc.
  const password = getFormStringRaw(formData, "password");
  const confirmPassword = getFormStringRaw(formData, "confirmPassword");
  const termsAccepted = formData.get("termsAccepted");
  const specificClausesAccepted = formData.get("specificClausesAccepted");
  const captchaToken = getFormString(formData, "captchaToken");

  const validationError = validateSignUpInput(
    email,
    password,
    confirmPassword,
    termsAccepted,
    specificClausesAccepted,
  );
  if (validationError) return { error: validationError };

  const ip = await getClientIpFromNextHeaders();
  const captchaOk = await verifyCaptcha(captchaToken, ip);
  if (!captchaOk) return { error: "Verifica CAPTCHA fallita. Riprova." };

  const rateLimited = checkRateLimit(ip, "signUp");
  if (rateLimited) return rateLimited;

  // Pre-check: block re-registration before hitting Supabase.
  // Supabase's behaviour for duplicate emails varies by config (anti-enumeration
  // returns null user; auto-confirm may create a new auth user with a different UUID).
  // Checking our own table by email is the only reliable guard in all cases.
  // Uses lower() for case-insensitive comparison, consistent with DB unique index.
  try {
    const db = getDb();
    const [existingByEmail] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(sql`lower(${profiles.email}) = ${email}`)
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
  const hostname =
    process.env.APP_HOSTNAME ??
    process.env.NEXT_PUBLIC_APP_HOSTNAME ??
    "app.scontrinozero.it";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `https://${hostname}/dashboard` },
  });

  if (error) {
    logger.error({ error: error.message }, "signUp failed");
    return { error: "Registrazione fallita. Riprova." };
  }

  // Create profile in our DB (mandatory: records terms acceptance for compliance)
  if (data.user) {
    const profileError = await insertProfileOrRollback(data.user.id, email);
    if (profileError) return profileError;
  }

  redirect("/verify-email");
}

export async function signIn(formData: FormData): Promise<AuthActionResult> {
  const email = normalizeEmail(getFormString(formData, "email"));
  // Raw read: trimming would break login for users whose password has
  // significant whitespace (see `getFormStringRaw`).
  const password = getFormStringRaw(formData, "password");

  if (!email || !isValidEmail(email)) {
    return { error: "Email non valida." };
  }
  if (!password) {
    return { error: "Inserisci la password." };
  }

  const ip = await getClientIpFromNextHeaders();
  const rateLimited = checkRateLimit(ip, "signIn");
  if (rateLimited) return rateLimited;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Structured failure log: classify the Supabase error so dashboards can
    // separate "user typed wrong password" from "auth provider down" without
    // reading raw messages, and correlate floods via ipHash without leaking PII.
    logger.warn(
      {
        action: "signIn",
        ipHash: hashIp(ip),
        errorClass: classifySupabaseAuthError(error),
      },
      "signIn failed",
    );
    return { error: "Email o password non corretti.", email };
  }

  redirect("/dashboard");
}

/**
 * Maps a Supabase Auth error to a small, machine-readable category.
 * The category names are stable across deploys and safe to put on a dashboard;
 * the underlying error.message is not (it can change with Supabase upgrades).
 */
function classifySupabaseAuthError(err: {
  message?: string;
  status?: number;
}): string {
  const status = err.status ?? 0;
  const msg = (err.message ?? "").toLowerCase();
  if (status === 400 && msg.includes("invalid login"))
    return "invalid_credentials";
  if (status === 400 && msg.includes("email not confirmed"))
    return "email_not_confirmed";
  if (status === 422) return "validation_error";
  if (status === 429) return "auth_provider_throttled";
  if (status >= 500) return "auth_provider_5xx";
  return "other";
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function resetPassword(
  formData: FormData,
): Promise<AuthActionResult> {
  const email = normalizeEmail(getFormString(formData, "email"));

  if (!email || !isValidEmail(email)) {
    return { error: "Email non valida." };
  }

  const ip = await getClientIpFromNextHeaders();
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

  // Defensive check: ensure the generated link points to our own domain.
  // Parse the URL explicitly instead of using startsWith — a prefix check can be
  // bypassed via subdomain spoofing (e.g., https://app.scontrinozero.it.evil.tld/).
  const expectedHostname =
    process.env.APP_HOSTNAME ?? // runtime override (sandbox, self-hosted)
    process.env.NEXT_PUBLIC_APP_HOSTNAME ?? // baked at build time
    "app.scontrinozero.it";
  const actionLink = data.properties.action_link;
  let parsedActionLink: URL | null = null;
  try {
    parsedActionLink = new URL(actionLink);
  } catch {
    // Malformed URL — treat as mismatch
  }
  if (
    parsedActionLink?.protocol !== "https:" ||
    parsedActionLink?.hostname !== expectedHostname
  ) {
    logger.error(
      {
        hostname: parsedActionLink?.hostname ?? null,
        expectedHostname,
        hasToken: true,
      },
      "Reset password: action_link hostname mismatch or invalid URL — email not sent",
    );
    redirect("/verify-email");
  }

  void sendEmail({
    to: email,
    subject: "Reimposta la tua password — ScontrinoZero",
    react: createElement(PasswordResetEmail, {
      resetLink: actionLink,
    }),
  }).catch((err) => logger.warn({ err }, "Password reset email failed"));

  redirect("/verify-email");
}
