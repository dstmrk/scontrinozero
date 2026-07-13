"use server";

import { createElement } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getStripe } from "@/lib/stripe";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { authErrorResult } from "@/lib/auth-errors";
import { getClientIp } from "@/lib/get-client-ip";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { ERROR_MESSAGES } from "@/lib/error-messages";
import { getFormStringRaw } from "@/lib/form-utils";
import { sendEmail } from "@/lib/email";
import { AccountDeletionEmail } from "@/emails/account-deletion";
import { purgeUserById } from "@/lib/services/purge-user";

/**
 * True se l'errore della Stripe SDK indica che il customer non esiste già più
 * (già cancellato). Rende `customers.del` idempotente: se un tentativo
 * precedente aveva cancellato il customer ma il purge era poi fallito, il retry
 * di `deleteAccount` non deve bloccarsi su un customer inesistente.
 */
function isStripeCustomerAlreadyGone(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { statusCode, code } = error as {
    statusCode?: unknown;
    code?: unknown;
  };
  return statusCode === 404 || code === "resource_missing";
}

export type AccountActionResult = {
  error?: string;
};

// Rate limit per user.id (non per IP: utenti dietro lo stesso NAT non si
// bloccano a vicenda). Impedisce che la re-autenticazione richiesta prima
// del purge diventi un oracle di brute-force sulla password.
const deleteAccountLimiter = new RateLimiter({
  maxRequests: 5,
  // stessa soglia delle altre auth action (changePassword)
  windowMs: RATE_LIMIT_WINDOWS.AUTH_15_MIN,
});

/**
 * Permanently deletes the authenticated user's account and all associated data.
 *
 * The actual purge (auth-first delete + profile FK cascade, with retries) lives
 * in the shared `purgeUserById` helper, reused by the GDPR inactive-user prune
 * sweep. This action wraps it with the session-specific concerns: re-auth gate,
 * sign-out, confirmation email and redirect.
 *
 * Re-autenticazione server-side (REVIEW.md #62): la conferma "ELIMINA" del
 * dialog vive solo nel client, quindi una chiamata diretta alla server action
 * (sessione rubata, XSS, estensione malevola) cancellerebbe l'account —
 * l'azione più distruttiva dell'app — senza alcun attrito. Richiediamo la
 * password corrente e la verifichiamo con `signInWithPassword`, stesso pattern
 * (meno distruttivo) di `changePassword`.
 */
export async function deleteAccount(
  formData: FormData,
): Promise<AccountActionResult> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, "deleteAccount");
  }

  // Raw read: ogni byte della password è significativo (vedi getFormStringRaw).
  const currentPassword = getFormStringRaw(formData, "currentPassword");
  if (!currentPassword) return { error: "Inserisci la tua password." };

  const email = user.email;
  if (!email) return { error: "Email utente non disponibile." };

  // Rate limit prima del tentativo di verifica password (anti brute-force).
  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const rateLimitResult = deleteAccountLimiter.check(
    `deleteAccount:${user.id}`,
  );
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id, ip }, "deleteAccount rate limit exceeded");
    return { error: ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES };
  }

  // Verifica la password corrente. signInWithPassword ruota il refresh token
  // corrente (riscritto nel cookie store SSR), ma è irrilevante qui: la
  // sessione viene comunque distrutta dal purge subito sotto.
  const supabase = await createServerSupabaseClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (signInError) {
    // Password sbagliata = errore prevedibile dell'input utente: warn, non
    // Sentry (regola 20).
    logger.warn(
      { userId: user.id, ip },
      "deleteAccount: password verification failed",
    );
    return { error: "Password non corretta." };
  }

  // 0. Annulla l'abbonamento Stripe PRIMA del purge (REVIEW.md #63). Un utente
  //    cancellato non può più accedere né al Billing Portal (richiede login),
  //    quindi se lasciassimo la subscription attiva Stripe continuerebbe ad
  //    addebitare la carta senza modo di fermarlo. `customers.del` cancella
  //    immediatamente le subscription attive e rimuove i dati anagrafici da
  //    Stripe (chiude anche il punto GDPR). Fail-safe: se Stripe non risponde
  //    NON procediamo col purge — meglio un account non cancellato che un
  //    addebito fantasma non più fermabile.
  const db = getDb();
  const [sub] = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1);

  if (sub?.stripeCustomerId) {
    try {
      await getStripe().customers.del(sub.stripeCustomerId);
    } catch (err) {
      if (isStripeCustomerAlreadyGone(err)) {
        // Customer già rimosso da un tentativo precedente: obiettivo raggiunto,
        // delete idempotente → warn (regola 20) e prosegui col purge.
        logger.warn(
          { userId: user.id },
          "deleteAccount: Stripe customer già cancellato — delete idempotente, procedo col purge",
        );
      } else {
        // Regola 10: SDK esterno wrappato, log strutturato, degradazione.
        logger.error(
          { userId: user.id, err },
          "deleteAccount: Stripe customer deletion failed — aborting purge",
        );
        return {
          error:
            "Non è stato possibile annullare l'abbonamento. Riprova o gestiscilo dal portale prima di eliminare l'account.",
        };
      }
    }
  }

  // 1-2. Delete auth user (retry) then the profile cascade (+ subscription row).
  //      If the auth delete fails after retries the profile is untouched →
  //      surface an error so the user can log in and retry. If auth succeeded but
  //      the profile delete failed, purgeUserById has already logged a critical
  //      error; we still proceed to sign out/redirect because the user can no
  //      longer log in.
  const { authDeleted } = await purgeUserById(user.id);
  if (!authDeleted) {
    return {
      error:
        "Eliminazione account fallita. Riprova oppure contatta il supporto.",
    };
  }

  // 3. Sign out current session (best-effort: auth user is already deleted;
  //    cookies may linger but cannot be used for re-authentication).
  await supabase.auth
    .signOut()
    .catch((err) =>
      logger.warn(
        { err },
        "signOut after account deletion failed (non-critical)",
      ),
    );

  logger.info({ userId: user.id }, "Account deleted");

  // 4. Send deletion confirmation email (fire-and-forget)
  if (user.email) {
    void sendEmail({
      to: user.email,
      subject: "Il tuo account ScontrinoZero è stato eliminato",
      react: createElement(AccountDeletionEmail, { email: user.email }),
    }).catch((err) => logger.warn({ err }, "Account deletion email failed"));
  }

  redirect("/");
}
