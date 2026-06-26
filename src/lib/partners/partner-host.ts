import { isValidHostnameSyntax } from "../hostname-env";

const DEFAULT_APP_HOSTNAME = "app.scontrinozero.it";

/**
 * Hostname dell'app effettivo, con la stessa precedenza usata altrove
 * (`getAcceptedTurnstileHostnames` in auth-actions, `appHref`):
 * `APP_HOSTNAME` (runtime override) > `NEXT_PUBLIC_APP_HOSTNAME` (baked) >
 * default produzione.
 *
 * Empty-safe (regola 18): un `??` non scatterebbe su una env presente ma
 * vuota (`""`), quindi scartiamo esplicitamente le stringhe vuote — altrimenti
 * un build-arg dimenticato bakerebbe un suffisso vuoto e ogni hostname
 * verrebbe interpretato come partner.
 */
export function getAppHostname(): string {
  const candidates = [
    process.env.APP_HOSTNAME,
    process.env.NEXT_PUBLIC_APP_HOSTNAME,
  ];
  for (const candidate of candidates) {
    const normalised = candidate?.trim().toLowerCase();
    if (normalised) return normalised;
  }
  return DEFAULT_APP_HOSTNAME;
}

/**
 * Estrae lo slug del partner da un hostname `<slug>-<appHostname>`.
 *
 * Esempi (appHostname = `app.scontrinozero.it`):
 * - `nds-app.scontrinozero.it`      → `nds`
 * - `app.scontrinozero.it`          → `null` (è l'app hostname, niente prefisso)
 * - `app-dev.scontrinozero.it`      → `null` (non termina con `-app.scontrino…`)
 *
 * In dev l'appHostname è `app-dev.scontrinozero.it`, quindi un partner dev è
 * `nds-app-dev.scontrinozero.it` → `nds` (gestito senza casi speciali, basta
 * passare il giusto `appHostname`).
 *
 * Funzione **pura**: `appHostname` è iniettabile per i test. Lo slug deve
 * essere una **singola label** hostname valida (niente punti → niente
 * subdomain annidati tipo `a.b-app.scontrinozero.it`).
 */
export function extractPartnerSlug(
  host: string | null | undefined,
  appHostname: string = getAppHostname(),
): string | null {
  if (!host) return null;
  // Dietro Cloudflare Tunnel l'header Host può includere la porta: la togliamo
  // come in `resolvePublicHostname` (src/proxy.ts).
  const normalisedHost = host.trim().toLowerCase().replace(/:\d+$/, "");
  if (!normalisedHost) return null;

  const suffix = `-${appHostname.trim().toLowerCase()}`;
  if (!normalisedHost.endsWith(suffix)) return null;

  const slug = normalisedHost.slice(0, normalisedHost.length - suffix.length);
  if (!slug || slug.includes(".")) return null;
  if (!isValidHostnameSyntax(slug)) return null;
  return slug;
}
