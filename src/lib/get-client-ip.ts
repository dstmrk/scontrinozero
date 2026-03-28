/**
 * Estrae l'IP del client dai request headers con modello di trust esplicito.
 *
 * Trust model:
 * - `CF-Connecting-IP`: impostato da Cloudflare, non falsificabile dal client
 *   (Cloudflare strippa eventuali header omonimi in ingresso). Usato in
 *   produzione dove tutto il traffico transita da Cloudflare Tunnel.
 * - `X-Forwarded-For` (primo IP): fallback per ambienti senza Cloudflare
 *   (dev/test locale). NON trusted in produzione — può essere falsificato
 *   da un client che imposta l'header arbitrariamente.
 * - `X-Real-IP` è volutamente escluso: non-standard e non aggiunge sicurezza.
 *
 * In produzione `CF-Connecting-IP` è sempre presente, quindi il fallback
 * a `X-Forwarded-For` non viene mai raggiunto.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ||
    // Non-trusted outside Cloudflare: only used in dev/test environments
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
