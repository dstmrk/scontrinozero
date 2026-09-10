import { resolveAppHostname } from "./hostname-env";

/**
 * `emailRedirectTo` dei link di conferma registrazione: dove atterra l'utente
 * dopo che Supabase ha verificato il token.
 *
 * Passa da `/callback` invece di puntare `/dashboard` direttamente: su link
 * scaduto Supabase reindirizza qui senza `code` e con l'errore reale nel
 * fragment (invisibile al server). Senza `/callback` in mezzo l'utente atterrava
 * sul login senza alcun messaggio, perché `/dashboard` è protetto e il
 * middleware lo rimbalzava a `/login` portandosi dietro il fragment che la
 * pagina di login non legge.
 *
 * Vive in `lib/` e non dentro `auth-actions.ts` perché ha due lati che devono
 * dire la stessa cosa: `signUp` (e il re-invio) lo **scrive** nel payload che
 * manda a GoTrue, e `/api/auth/send-email` lo **verifica** quando quel payload
 * torna indietro. Due copie della stessa stringa e la validazione comincerebbe
 * a rifiutare i redirect che noi stessi abbiamo chiesto.
 */
export function buildConfirmationRedirectTo(): string {
  return `https://${resolveAppHostname()}/callback?redirect=${encodeURIComponent("/dashboard")}`;
}
