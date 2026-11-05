import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTrustedAppUrl } from "@/lib/trusted-app-url";
import { isSafeRelativeRedirect } from "@/lib/validation";
import { logger } from "@/lib/logger";

/**
 * Auth callback handler per i link PKCE (`?code=`), cioè la conferma email
 * della registrazione. Crea la sessione nei cookie, poi redirige.
 *
 * Il reset password NON passa di qui: il suo token lo consuma il POST di
 * `/reset-password/confirm` (`confirmPasswordReset`), perché una GET che lo
 * spende lo lascia bruciare a qualunque scanner di link apra l'email prima
 * dell'utente (issue #1159).
 *
 * I redirect sono costruiti contro `getTrustedAppUrl()` (da `NEXT_PUBLIC_APP_URL`,
 * validata al boot — regola 24), NON contro l'origin di `request.url`. Dietro
 * Cloudflare Tunnel (es. il Pi `:dev`) `request.url` si risolve all'host interno
 * di bind (`0.0.0.0:3000`) invece del dominio pubblico, mandando i redirect su un
 * host irraggiungibile. Se per qualche motivo la env fosse rotta si degrada
 * all'origin della richiesta: meglio un host potenzialmente sbagliato che un 500
 * che bloccherebbe la conferma email.
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

  const code = searchParams.get("code");
  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(redirect, base));
  }

  // Scambio fallito o code assente: torna al login con un codice d'errore.
  return NextResponse.redirect(
    new URL("/login?error=auth_callback_failed", base),
  );
}
