/**
 * Categorie stabili per gli errori di Supabase Auth, da mettere nei log come
 * `errorClass`. Il `message` di GoTrue può cambiare a ogni upgrade, queste no.
 *
 * Nessun valore può contenere una stringa che lo scrubbing lato server di
 * Sentry oscura ("auth", "credentials", "token", …): finirebbe su Sentry Logs
 * come `[Filtered]`. Gate: `log-scrubbing.contract.test.ts`.
 */
export const SUPABASE_AUTH_ERROR_CLASSES = [
  "invalid_login",
  "email_not_confirmed",
  "validation_error",
  "supabase_throttled",
  "supabase_5xx",
  "other",
] as const;

export type SupabaseAuthErrorClass =
  (typeof SUPABASE_AUTH_ERROR_CLASSES)[number];

export function classifySupabaseAuthError(err: {
  message?: string;
  status?: number;
}): SupabaseAuthErrorClass {
  const status = err.status ?? 0;
  const msg = (err.message ?? "").toLowerCase();
  if (status === 400 && msg.includes("invalid login")) return "invalid_login";
  if (status === 400 && msg.includes("email not confirmed"))
    return "email_not_confirmed";
  if (status === 422) return "validation_error";
  if (status === 429) return "supabase_throttled";
  if (status >= 500) return "supabase_5xx";
  return "other";
}
