"use client";

import { Turnstile } from "@marsidev/react-turnstile";

/**
 * Widget Turnstile riusabile per i form auth (signUp, signIn, resetPassword).
 *
 * Incapsula la lettura della env `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, il fallback
 * (nessun rendering se la key non è configurata, per non rompere ambienti
 * self-hosted o test) e il binding degli handler success/expire/error a una
 * singola callback `onToken(string | null)`. Riduce la duplicazione tra le
 * pagine auth (SonarCloud P3 — duplicated lines).
 *
 * Il prop `action` è la categoria stabile del flow (es. "signin", "signup",
 * "reset-password") riflessa nel token e verificata server-side da
 * `verifyCaptcha`. Impedisce il replay cross-flow di un token catturato su
 * un endpoint (es. signup) verso un altro (es. signin).
 */
export function TurnstileWidget({
  onToken,
  action,
}: {
  readonly onToken: (token: string | null) => void;
  readonly action?: string;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey) return null;
  return (
    <Turnstile
      siteKey={siteKey}
      onSuccess={(token) => onToken(token)}
      onExpire={() => onToken(null)}
      onError={() => onToken(null)}
      options={{ theme: "auto", action }}
    />
  );
}
