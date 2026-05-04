import { createHash } from "node:crypto";
import { logger } from "@/lib/logger";

/**
 * Estrae l'IP del client dai request headers con modello di trust esplicito.
 *
 * Trust model:
 * - `CF-Connecting-IP`: impostato da Cloudflare, non falsificabile dal client
 *   (Cloudflare strippa eventuali header omonimi in ingresso). Unica fonte
 *   trusted in produzione, dove tutto il traffico transita da Cloudflare Tunnel.
 * - `X-Forwarded-For` (primo IP): fallback SOLO in ambienti non-produzione
 *   (dev/test locale). NON trusted in produzione — può essere falsificato
 *   da un client che imposta l'header arbitrariamente.
 * - `X-Real-IP` è volutamente escluso: non-standard e senza trust model.
 *
 * In produzione, se CF-Connecting-IP è assente (misconfiguration), si
 * restituisce "unknown" anziché cadere sul fallback falsificabile — il
 * rate limiting costruito su un IP spoofable sarebbe inefficace.
 * In questo caso viene emesso un log di warning per rilevare rapidamente
 * la misconfiguration Cloudflare.
 */
export function getClientIp(headers: Headers): string {
  const cfIp = headers.get("cf-connecting-ip");

  if (cfIp) return cfIp;

  // In production: trust only CF-Connecting-IP. If it's absent (Cloudflare
  // misconfiguration), return "unknown" rather than fall back to the
  // spoofable X-Forwarded-For header. Log a warning so ops can detect the
  // misconfiguration quickly (all rate-limit buckets would otherwise share
  // the same "unknown" key, making per-IP limiting ineffective).
  if (process.env.NODE_ENV === "production") {
    logger.warn(
      "CF-Connecting-IP header missing in production — Cloudflare misconfiguration? Rate-limit buckets will be shared under 'unknown'",
    );
    return "unknown";
  }

  // Dev / test fallback: X-Forwarded-For is acceptable when Cloudflare is not present.
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * Returns a short non-reversible-by-rainbow-table-alone tag for an IP.
 *
 * Useful for structured logs where we want to correlate events from the same
 * source (rate-limit floods, brute-force) without writing the raw IP — keeping
 * logs out of the GDPR "personal data" classification by default.
 *
 * The salt is `LOG_HASH_SALT` (env). If unset we still return a stable hash
 * (no salt), which is enough for correlation in a single deploy. Logs should
 * not be retained long-term anyway.
 */
export function hashIp(ip: string): string {
  if (!ip || ip === "unknown") return "unknown";
  const salt = process.env.LOG_HASH_SALT ?? "";
  return createHash("sha256")
    .update(salt + ip)
    .digest("hex")
    .slice(0, 12);
}
