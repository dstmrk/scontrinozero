"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useEffect, type Ref } from "react";

/**
 * Token sentinella emesso quando Turnstile è disabilitato in dev
 * (`NEXT_PUBLIC_TURNSTILE_DISABLED`). Valore arbitrario: il server lo ignora
 * del tutto — `verifyCaptcha` esce prima via `isCaptchaDisabled` in
 * `auth-actions.ts`. Serve solo a rendere `captchaToken` non-null lato client,
 * così il submit (gated su `captchaToken === null`) si abilita senza dover
 * toccare le pagine auth.
 */
const DISABLED_CAPTCHA_TOKEN = "dev-captcha-disabled";

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
 *
 * Il prop `ref` espone l'istanza Turnstile (`reset()`, ...) ai form auth: il
 * token è single-use, quindi dopo un errore il parent fa `ref.current?.reset()`
 * per ri-emettere subito un nuovo token e riabilitare il pulsante di submit
 * (altrimenti `captchaToken` resterebbe `null` fino alla scadenza ~5 min). Se
 * la siteKey manca il widget non si monta: il ref resta `null` e il reset è un
 * no-op sicuro (self-hosted/test).
 *
 * **Bypass dev** (`NEXT_PUBLIC_TURNSTILE_DISABLED === "true"`): il widget non si
 * monta ed emette subito un token sentinella per sbloccare il submit, speculare
 * al gate server `isCaptchaDisabled`. Riservato a dev/sandbox — in produzione il
 * captcha resta sempre attivo. Nota: dopo un login *fallito* il parent azzera
 * `captchaToken` e, non essendoci widget da resettare, il submit resta
 * disabilitato fino a un reload (limite cosmetico, solo in modalità disabled).
 */
export function TurnstileWidget({
  onToken,
  action,
  ref,
}: {
  readonly onToken: (token: string | null) => void;
  readonly action?: string;
  readonly ref?: Ref<TurnstileInstance | null>;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const disabled = process.env.NEXT_PUBLIC_TURNSTILE_DISABLED === "true";

  // Bypass dev: emette il sentinella all'avvio → sblocca il submit.
  useEffect(() => {
    if (disabled) onToken(DISABLED_CAPTCHA_TOKEN);
  }, [disabled, onToken]);

  if (disabled || !siteKey) return null;
  return (
    <Turnstile
      ref={ref}
      siteKey={siteKey}
      onSuccess={(token) => onToken(token)}
      onExpire={() => onToken(null)}
      onError={() => onToken(null)}
      options={{ theme: "auto", action }}
    />
  );
}
