/**
 * Pulizia dei cookie AdE dal telefono dopo la cattura SPID (issue #1041).
 *
 * L'InAppBrowser tiene i cookie del portale anche dopo la chiusura, e il
 * bridge Capacitor li legge da qualunque script dell'app, HttpOnly compresi:
 * un XSS sull'origine dell'app diventerebbe furto della sessione AdE. Letti i
 * cookie, quindi, li si cancella.
 *
 * Le due piattaforme non hanno uno strumento comune:
 *
 * - **iOS** — `clearCookies` del plugin cancella per suffisso di dominio, e
 *   lavora sul data store del browser aperto. Su iOS 15/16 quel data store è
 *   il `default()` dell'app, e a browser chiuso il plugin rifiuta: va chiamato
 *   **prima** di `close`.
 * - **Android** — `clearCookies` del plugin non cancella (scrive `NOME=del`
 *   sull'URL) e `clearAllCookies` svuota il `CookieManager` di processo,
 *   Supabase compreso. Si fa scadere ogni nome con `CapacitorCookies`, che è
 *   nel runtime di Capacitor. `getCookies` non dice Domain e Path, quindi si
 *   scrive ogni chiave possibile su `Path=/`.
 *
 * I due helper esportati non rigettano mai: la cattura li attende con in mano
 * cookie costati all'utente un secondo fattore.
 */

import * as Sentry from "@sentry/nextjs";
import type { CapacitorBridge } from "./native-shell";

const BROWSER_PLUGIN = "CapgoInAppBrowser";
const COOKIES_PLUGIN = "CapacitorCookies";

const ADE_DOMAIN = "agenziaentrate.gov.it";

/** Su iOS il plugin confronta per suffisso: il dominio registrabile li prende tutti. */
const ADE_DOMAIN_URL = `https://${ADE_DOMAIN}/`;

/**
 * Gli host del portale che il login attraversa (`real-client.ts`,
 * `docs/api-spec.md`). Su Android `getCookies` torna solo i cookie che il
 * browser manderebbe a quell'URL, quindi si legge host per host.
 */
const ADE_HOST_URLS = [
  "ivaservizi",
  "iampe",
  "portale",
  "sp",
  "telematici",
].map((host) => `https://${host}.${ADE_DOMAIN}/`);

/** Documento Commerciale Online: la cattura scatta all'arrivo qui. */
export const ADE_DCO_URL = `https://ivaservizi.${ADE_DOMAIN}/ser/documenticommercialionline/`;

const EXPIRED = "Thu, 01 Jan 1970 00:00:00 GMT";

type Platform = "ios" | "android";

function nativePlatform(bridge: CapacitorBridge): Platform | null {
  try {
    const platform = bridge.getPlatform?.();
    return platform === "ios" || platform === "android" ? platform : null;
  } catch {
    return null;
  }
}

/** Una chiamata al bridge, sempre come promessa: rigetta se il bridge manca. */
function callNative(
  bridge: CapacitorBridge,
  plugin: string,
  method: string,
  options: unknown,
): Promise<unknown> {
  const call = bridge.nativePromise;
  if (!call) return Promise.reject(new Error("Bridge nativo non disponibile."));
  return call.call(bridge, plugin, method, options);
}

async function readCookieNames(
  bridge: CapacitorBridge,
  url: string,
): Promise<string[]> {
  const cookies = (await callNative(bridge, BROWSER_PLUGIN, "getCookies", {
    url,
    includeHttpOnly: true,
  })) as Record<string, string> | undefined;
  return Object.keys(cookies ?? {}).filter(Boolean);
}

/**
 * Le chiavi sotto cui `CookieManager` può tenere un cookie con `Path=/` che il
 * browser manda a `url`: host-only, `Domain` uguale all'host, `Domain` del
 * dominio registrabile. Ognuna esce come `[identità, opzioni di setCookie]`:
 * un cookie di `.agenziaentrate.gov.it` torna da ogni host, e l'identità fa
 * sì che lo si scriva una volta sola (ogni setCookie fa anche un flush).
 *
 * Il Domain viaggia nel campo `path`: `CapacitorCookies` lo concatena tale e
 * quale nell'header `Set-Cookie` (Capacitor 8,
 * `CapacitorCookieManager.setCookie`). Se un aggiornamento lo cambiasse, lo
 * dice `reportAdeCookieResidue`. `Secure` serve ai nomi `__Secure-`/`__Host-`,
 * che Chromium non lascia sovrascrivere senza; per gli altri è indifferente.
 */
function expiries(url: string, key: string): [string, object][] {
  const host = new URL(url).host;
  const expire = (path: string) => ({
    url,
    key,
    value: "",
    expires: EXPIRED,
    path,
  });
  return [
    [`${host} ${key}`, expire("/; secure")],
    [`.${host} ${key}`, expire(`/; domain=${host}; secure`)],
    [`.${ADE_DOMAIN} ${key}`, expire(`/; domain=.${ADE_DOMAIN}; secure`)],
  ];
}

async function clearOnAndroid(bridge: CapacitorBridge): Promise<void> {
  const reads = await Promise.allSettled(
    ADE_HOST_URLS.map(async (url) => ({
      url,
      names: await readCookieNames(bridge, url),
    })),
  );
  const writes = new Map(
    reads.flatMap((read) =>
      read.status === "fulfilled"
        ? read.value.names.flatMap((key) => expiries(read.value.url, key))
        : [],
    ),
  );
  await Promise.allSettled(
    [...writes.values()].map((options) =>
      callNative(bridge, COOKIES_PLUGIN, "setCookie", options),
    ),
  );
}

/**
 * Cancella dal telefono i cookie del dominio AdE. Non rigetta mai: i cookie
 * sono già stati letti, e un collegamento SPID costa all'utente un secondo
 * fattore.
 */
export async function clearAdeCookies(bridge: CapacitorBridge): Promise<void> {
  const platform = nativePlatform(bridge);
  try {
    if (platform === "ios") {
      await callNative(bridge, BROWSER_PLUGIN, "clearCookies", {
        url: ADE_DOMAIN_URL,
      });
    } else if (platform === "android") {
      await clearOnAndroid(bridge);
    }
  } catch {
    // Best-effort: cosa resta lo misura reportAdeCookieResidue.
  }
}

async function residueNames(
  bridge: CapacitorBridge,
  platform: Platform,
): Promise<string[]> {
  const urls =
    platform === "ios" ? [ADE_DOMAIN_URL] : [...ADE_HOST_URLS, ADE_DCO_URL];
  const reads = await Promise.allSettled(
    urls.map((url) => readCookieNames(bridge, url)),
  );
  const names = reads.flatMap((read) =>
    read.status === "fulfilled" ? read.value : [],
  );
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

/**
 * Rilegge i cookie AdE dopo la pulizia e, se ne resta qualcuno, apre un
 * warning Sentry con i soli nomi. È il controllo che rende visibile una
 * pulizia rotta: un aggiornamento di Capacitor o del plugin, un cookie scritto
 * dopo la cancellazione. Su Android vede anche i cookie con un Path sotto
 * quello del DCO, non quelli con un Path che il DCO non attraversa.
 */
export async function reportAdeCookieResidue(
  bridge: CapacitorBridge,
): Promise<void> {
  try {
    const platform = nativePlatform(bridge);
    if (!platform) return;
    const names = await residueNames(bridge, platform);
    if (names.length === 0) return;
    Sentry.captureMessage("Cattura SPID: cookie AdE rimasti sul telefono", {
      level: "warning",
      tags: { flow: "spid-capture", platform },
      extra: { cookieNames: names },
    });
  } catch {
    // Telemetria: un suo errore non tocca la cattura.
  }
}
