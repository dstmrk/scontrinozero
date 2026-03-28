/**
 * Estrae l'IP del client dai request headers.
 *
 * Priorità: CF-Connecting-IP (Cloudflare, non falsificabile) →
 * X-Forwarded-For (primo IP) → X-Real-IP → "unknown".
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
