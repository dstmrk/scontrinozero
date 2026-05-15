import { logger } from "@/lib/logger";

/**
 * Errore lanciato quando `NEXT_PUBLIC_APP_URL` non passa la validazione runtime
 * (formato malformato, protocollo non `https:` in produzione, hostname fuori
 * allowlist). I route handler che costruiscono URL di redirect verso terze
 * parti (Stripe checkout/portal, ecc.) catturano questo errore e ritornano
 * 503 — fail-closed.
 */
export class TrustedAppUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrustedAppUrlError";
  }
}

function getAllowedHostnames(): Set<string> {
  const set = new Set<string>();
  // Priorità: runtime override (sandbox, self-hosted) → baked at build → default.
  const fromEnv =
    process.env.APP_HOSTNAME ?? process.env.NEXT_PUBLIC_APP_HOSTNAME;
  if (fromEnv) set.add(fromEnv);
  set.add("app.scontrinozero.it");
  if (process.env.NODE_ENV !== "production") {
    set.add("localhost");
    set.add("127.0.0.1");
  }
  return set;
}

/**
 * Restituisce la base URL dell'app, validata.
 *
 * In produzione richiede `https:` e hostname in allowlist (derivata da
 * `APP_HOSTNAME` / `NEXT_PUBLIC_APP_HOSTNAME` + default `app.scontrinozero.it`).
 * In dev/test ammette anche `http://localhost`.
 *
 * **Perché esiste** (P1-02): gli endpoint Stripe (`checkout/route.ts`,
 * `portal/route.ts`) costruiscono `success_url`, `cancel_url`, `return_url`
 * concatenando `NEXT_PUBLIC_APP_URL`. Una misconfigurazione env (o pipeline
 * compromessa) può produrre redirect Stripe verso domini non fidati dopo
 * checkout/portal. Validare l'URL alla sorgente è defense-in-depth: il danno
 * si ferma al 503 prima che la sessione Stripe parta.
 *
 * @throws TrustedAppUrlError se l'URL è malformato, non https in prod, o host
 *         non in allowlist. Il chiamante deve gestire con 503.
 */
export function getTrustedAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    logger.error(
      { critical: true, raw },
      "NEXT_PUBLIC_APP_URL malformed — refusing to build redirect URLs",
    );
    throw new TrustedAppUrlError("NEXT_PUBLIC_APP_URL malformed");
  }

  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    logger.error(
      { critical: true, protocol: parsed.protocol },
      "NEXT_PUBLIC_APP_URL is not https in production — refusing to build redirect URLs",
    );
    throw new TrustedAppUrlError(
      "NEXT_PUBLIC_APP_URL must use https in production",
    );
  }

  const allowed = getAllowedHostnames();
  if (!allowed.has(parsed.hostname)) {
    logger.error(
      {
        critical: true,
        hostname: parsed.hostname,
        allowed: [...allowed],
      },
      "NEXT_PUBLIC_APP_URL hostname not in allowlist — refusing to build redirect URLs",
    );
    throw new TrustedAppUrlError(
      "NEXT_PUBLIC_APP_URL hostname not in allowlist",
    );
  }

  // Normalizza: senza trailing slash così i chiamanti possono concatenare
  // `${url}/path` senza doppio slash.
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}
