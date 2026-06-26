/**
 * Mappa i codici `?error=` impostati dal route handler `/callback`
 * (`src/app/(auth)/callback/route.ts`) nel messaggio mostrato sulla pagina
 * `/login`.
 *
 * Perché esiste: l'errore reale di Supabase (es. `otp_expired`) viaggia nel
 * **fragment** `#` dell'URL, invisibile al server. Il `/callback` non può
 * leggerlo, ma sa (a) che lo scambio del code è fallito / assente e (b) verso
 * quale flusso puntava il link, dal parametro `redirect` (server-visible). Da
 * questi due fatti deriva un codice d'errore stabile che qui traduciamo in copy
 * utente. Funzione pura → testabile a sé (la pagina /login è esclusa dalla
 * coverage).
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
