/**
 * Mappa i codici `?error=` con cui i link delle email riportano a `/login`
 * nel messaggio mostrato sulla pagina.
 *
 * - `auth_callback_failed` — lo imposta `/callback`
 *   (`src/app/(auth)/callback/route.ts`) quando lo scambio del `code` PKCE
 *   della conferma email fallisce o il `code` manca. L'errore reale di
 *   Supabase (es. `otp_expired`) viaggia nel fragment `#`, invisibile al
 *   server: il codice stabile lo sostituisce.
 * - `reset_link_invalid` — lo imposta `confirmPasswordReset`
 *   (`src/server/auth-actions.ts`) quando il token del reset manca o GoTrue lo
 *   rifiuta (scaduto, già usato).
 *
 * Funzione pura → testabile a sé (la pagina /login è esclusa dalla coverage).
 */
export function mapAuthCallbackError(code: string | null): string | null {
  switch (code) {
    case "reset_link_invalid":
      return "Il link per reimpostare la password è scaduto o è già stato usato. Richiedine uno nuovo qui sotto.";
    case "auth_callback_failed":
      return "Non siamo riusciti a verificare il link. Riprova ad accedere.";
    default:
      return null;
  }
}
