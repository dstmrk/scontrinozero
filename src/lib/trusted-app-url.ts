import { logger } from "@/lib/logger";
import { isValidHostnameSyntax } from "./hostname-env";

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

/**
 * Normalizza un hostname letto da env: trim, lowercase, via il punto finale
 * della forma FQDN. Ritorna `null` su valore assente, vuoto o sintatticamente
 * non valido (scheme, path, porta, spazi) — così un `.env` sbagliato non entra
 * né nell'allowlist né nella costruzione dell'URL.
 *
 * La regola di sintassi è quella canonica di `hostname-env.ts`, che la
 * esporta proprio per non duplicare il controllo per-label.
 */
function normaliseHostnameEnv(raw: string | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  if (!isValidHostnameSyntax(value)) return null;
  return value.endsWith(".") ? value.slice(0, -1) : value;
}

/**
 * Override runtime dell'hostname app. È `APP_HOSTNAME` (senza prefisso
 * `NEXT_PUBLIC_`): non finisce nel bundle client ed è quindi l'unico valore
 * che il compose di un singolo ambiente può cambiare senza rebuild.
 */
function getAppHostnameOverride(): string | null {
  return normaliseHostnameEnv(process.env.APP_HOSTNAME);
}

function getAllowedHostnames(): Set<string> {
  const set = new Set<string>();
  // Priorità: runtime override (sandbox, self-hosted) → baked at build → default.
  const fromEnv =
    getAppHostnameOverride() ??
    normaliseHostnameEnv(process.env.NEXT_PUBLIC_APP_HOSTNAME);
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
 * **Perché esiste**: gli endpoint Stripe (`checkout/route.ts`,
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
  // `?? default` NON scatta su present-but-empty (`""`): il Dockerfile bakava
  // `ENV NEXT_PUBLIC_APP_URL=` vuoto in prod/sandbox (ARG non passato), quindi
  // `new URL("")` lanciava e ogni checkout/portal Stripe rispondeva 503
  // (Sentry SCONTRINOZERO-F). Trattiamo empty/whitespace come assente. Il
  // default è prod-aware: in produzione l'host app (https + in allowlist →
  // passa la validazione qui sotto), localhost solo in dev/test. (regola 18.)
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const raw =
    fromEnv ||
    (process.env.NODE_ENV === "production"
      ? "https://app.scontrinozero.it"
      : "http://localhost:3000");
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

  // `NEXT_PUBLIC_APP_URL` è **bakata al build** e `deploy.yml` produce una sola
  // immagine per tag, che serve prod E sandbox: nel container sandbox quel
  // valore è quindi l'URL di produzione. `APP_HOSTNAME` è l'override runtime
  // che distingue i due ambienti — stessa precedenza già applicata da
  // `resolveBaseUrl()` in `marketing-to-app-href.ts`, qui mancava e mandava il
  // QR dei PDF e le `success_url`/`return_url` Stripe di sandbox su produzione
  // (REVIEW.md #93).
  //
  // Nessuna superficie di fiducia nuova: `getAllowedHostnames()` include già
  // `APP_HOSTNAME`, quindi rivalidare l'host così costruito sarebbe
  // tautologico — chi controlla l'env controlla anche la propria allowlist. Il
  // valore bakato resta comunque validato sopra, perché finisce nel bundle
  // client e nelle email.
  //
  // La sostituzione avviene solo a hostname diverso: a parità di host
  // restituire `raw` preserva la porta (`http://localhost:3000` in dev, dove
  // l'override è hostname-only).
  const runtimeHost = getAppHostnameOverride();
  if (runtimeHost && runtimeHost !== parsed.hostname) {
    return `${parsed.protocol}//${runtimeHost}`;
  }

  // Normalizza: senza trailing slash così i chiamanti possono concatenare
  // `${url}/path` senza doppio slash.
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}
