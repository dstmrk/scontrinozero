import { z } from "zod/v4";

import { normalizeEmail } from "./validation";

/**
 * Gate del pannello operatore (`/admin`).
 *
 * L'allowlist vive in `ADMIN_EMAILS` (env **runtime**, non `NEXT_PUBLIC_*`:
 * l'elenco non deve finire nel bundle del browser) come lista di indirizzi
 * separati da virgola. È l'unica cosa che separa il pannello — che legge dati
 * di TUTTI gli utenti — dal resto degli utenti autenticati, quindi:
 *
 * - **fail-closed**: env assente, vuota o composta di sole voci non valide →
 *   nessun amministratore, il pannello risponde 404 a chiunque. È il default
 *   corretto per sandbox e self-hosted, che non hanno un operatore (stesso
 *   pattern di `NEW_SIGNUP_NOTIFICATION_EMAIL`, regola 18: un `?? default` non
 *   scatterebbe sulla stringa vuota);
 * - **niente cache di modulo**: la env viene riletta a ogni chiamata. Un
 *   allowlist memoizzato al primo import resterebbe quello del boot anche dopo
 *   una rotazione, e in test renderebbe l'ordine dei file significativo.
 *
 * Server-only per costruzione: nessun componente client deve importare questo
 * modulo (leggerebbe `process.env.ADMIN_EMAILS` a build time e la inlinerebbe
 * come `undefined`, cioè un gate sempre chiuso e silenzioso).
 *
 * Il nome è `admin-gate` e non `admin` per non confondersi con
 * `src/lib/supabase/admin.ts`, dove "admin" significa il client service-role
 * che bypassa la RLS: cose diverse, e sbagliare import qui è pericoloso.
 */
const ADMIN_EMAILS_ENV = "ADMIN_EMAILS";

const emailSchema = z.email();

/**
 * Espande il valore grezzo di `ADMIN_EMAILS` nell'insieme normalizzato degli
 * indirizzi ammessi. Ogni voce passa da `normalizeEmail()` (regola 9) e dalla
 * validazione Zod: una voce malformata viene scartata, non fa cadere l'intera
 * allowlist — ma non essendoci fallback, un'allowlist interamente malformata
 * chiude il pannello invece di aprirlo.
 */
export function parseAdminEmails(raw: string | undefined): ReadonlySet<string> {
  if (!raw) return new Set();
  const entries = raw
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter((entry) => emailSchema.safeParse(entry).success);
  return new Set(entries);
}

/**
 * True se `email` (tipicamente `user.email` della sessione Supabase) è nella
 * allowlist operatore. Confronto su forma normalizzata da entrambi i lati.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = parseAdminEmails(process.env[ADMIN_EMAILS_ENV]);
  if (allowlist.size === 0) return false;
  return allowlist.has(normalizeEmail(email));
}
