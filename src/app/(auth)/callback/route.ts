import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTrustedAppUrl } from "@/lib/trusted-app-url";
import { logger } from "@/lib/logger";

/**
 * Auth callback handler for Supabase email confirmation / magic link / OAuth /
 * password recovery. Exchanges the `code` query parameter for a session, then
 * redirects.
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

  const code = searchParams.get("code");
  // Only allow relative redirects to prevent open redirect attacks.
  // Reject protocol-relative URLs like //evil.com (they inherit the protocol from origin).
  const rawRedirect = searchParams.get("redirect") ?? "";
  const redirect =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : "/dashboard";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(redirect, base));
    }
  }

  // If code exchange failed or no code, redirect to login with error
  return NextResponse.redirect(
    new URL("/login?error=auth_callback_failed", base),
  );
}
