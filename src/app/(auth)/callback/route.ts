import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTrustedAppUrl } from "@/lib/trusted-app-url";
import { isSafeRelativeRedirect } from "@/lib/validation";
import { logger } from "@/lib/logger";

/**
 * Crea la sessione dai parametri del link: `token_hash` per il reset (solo
 * `type=recovery`, l'unico che le nostre email generano), `code` PKCE per il
 * resto. `true` se la sessione è stata creata.
 */
async function establishSession(searchParams: URLSearchParams) {
  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  if (tokenHash && searchParams.get("type") === "recovery") {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    return !error;
  }
  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return !error;
  }
  return false;
}

/**
 * Auth callback handler: conferma email (PKCE, `?code=`) e reset password
 * (`?token_hash=…&type=recovery`). Crea la sessione nei cookie, poi redirige.
 *
 * Il reset ha un ramo suo perché il link nasce da `admin.generateLink`, che
 * non usa PKCE: passando da GoTrue `/verify` la sessione tornerebbe nel
 * fragment `#access_token=…`, invisibile al server, e qui non arriverebbe mai
 * un `code`. Con il `token_hash` la verifica la facciamo noi con `verifyOtp`.
 *
 * I redirect sono costruiti contro `getTrustedAppUrl()` (da `NEXT_PUBLIC_APP_URL`,
 * validata al boot — regola 24), NON contro l'origin di `request.url`. Dietro
 * Cloudflare Tunnel (es. il Pi `:dev`) `request.url` si risolve all'host interno
 * di bind (`0.0.0.0:3000`) invece del dominio pubblico, mandando i redirect su un
 * host irraggiungibile. Se per qualche motivo la env fosse rotta si degrada
 * all'origin della richiesta: meglio un host potenzialmente sbagliato che un 500
 * che bloccherebbe conferma email / OAuth / reset password.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  let base: string;
  try {
    base = getTrustedAppUrl();
  } catch {
    logger.error(
      { critical: true },
      "auth callback: getTrustedAppUrl failed, falling back to request origin",
    );
    base = origin;
  }

  // Only allow relative redirects to prevent open redirect attacks
  // (predicato condiviso con `signIn` — vedi `isSafeRelativeRedirect`).
  const rawRedirect = searchParams.get("redirect") ?? "";
  const redirect = isSafeRelativeRedirect(rawRedirect)
    ? rawRedirect
    : "/dashboard";

  if (await establishSession(searchParams)) {
    return NextResponse.redirect(new URL(redirect, base));
  }

  // Verifica fallita o parametri assenti: torna al login con un codice d'errore.
  // Un link di reset (type=recovery, o redirect=/reset-password* sui link
  // GoTrue già spediti prima di questo ramo) prende il codice mirato, così
  // /login indirizza a "Password dimenticata?".
  const failureError =
    searchParams.get("type") === "recovery" ||
    redirect.startsWith("/reset-password")
      ? "reset_link_invalid"
      : "auth_callback_failed";
  return NextResponse.redirect(new URL(`/login?error=${failureError}`, base));
}
