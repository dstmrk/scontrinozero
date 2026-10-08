/**
 * Cattura della sessione SPID nell'app nativa (docs/mobile-v2.md, slice 3b).
 *
 * Apre il portale AdE in un InAppBrowser, dove l'utente fa il login SPID e
 * sceglie l'utenza di lavoro come farebbe nel browser. Quando arriva a
 * Documento Commerciale Online la sessione è completa: si leggono i cookie del
 * portale (HttpOnly compresi), li si cancella dal telefono (issue #1041), si
 * chiude il browser e si restituisce l'header `Cookie` che
 * `connectAdeWithSpid` adotta sul server.
 *
 * Il plugin è `@capgo/capacitor-inappbrowser`, installato nel guscio
 * (`mobile/`). Lo si chiama attraverso il bridge e non importandone il
 * wrapper JS: il bundle web resta senza dipendenze native, e un deploy del web
 * non può portare un wrapper più nuovo del plugin compilato nell'app.
 */

import {
  ADE_DCO_URL,
  clearAdeCookies,
  reportAdeCookieResidue,
} from "./ade-cookie-cleanup";
import type { CapacitorBridge } from "./native-shell";

const PLUGIN = "CapgoInAppBrowser";

/** Pagina di accesso a Fatture e Corrispettivi: offre SPID fra i metodi. */
export const ADE_PORTAL_LOGIN_URL =
  "https://ivaservizi.agenziaentrate.gov.it/portale/";

/** I cookie si leggono per host: `getCookies` include i domini padre. */
const ADE_COOKIE_URL = "https://ivaservizi.agenziaentrate.gov.it/";

/** True quando il browser è arrivato a Documento Commerciale Online. */
export function isDcoUrl(url: string): boolean {
  return url.startsWith(ADE_DCO_URL);
}

export function toCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .filter(([name, value]) => name && value)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

/**
 * Restituisce l'header `Cookie` della sessione, oppure `null` se l'utente ha
 * chiuso il browser prima di arrivare al DCO (o se non c'è nessun cookie).
 * Lancia se il bridge o il plugin mancano: è un errore di installazione.
 */
export async function captureSpidCookieHeader(
  bridge: CapacitorBridge | null,
): Promise<string | null> {
  const call = bridge?.nativePromise;
  const listen = bridge?.addListener;
  if (!bridge || !call || !listen) {
    throw new Error("Bridge nativo non disponibile.");
  }

  return new Promise<string | null>((resolve, reject) => {
    let settled = false;
    const handles: { remove: () => unknown }[] = [];
    const detach = () => {
      for (const handle of handles) handle.remove();
    };
    // Su ogni uscita, a browser chiuso, si cancella di nuovo: l'utente può
    // aver fatto il login e poi chiuso, e il DCO può scrivere cookie mentre la
    // pagina finisce di caricare. Il residuo si controlla solo a cattura
    // riuscita: lì una sessione c'era di sicuro.
    const finish = (outcome: () => Promise<string | null>) => {
      if (settled) return;
      settled = true;
      outcome()
        .finally(() => clearAdeCookies(bridge))
        .then(
          async (value) => {
            if (value) await reportAdeCookieResidue(bridge);
            detach();
            resolve(value);
          },
          (err: unknown) => {
            detach();
            reject(err);
          },
        );
    };

    handles.push(
      listen.call(bridge, PLUGIN, "urlChangeEvent", ({ url }) => {
        if (!url || !isDcoUrl(url)) return;
        finish(async () => {
          try {
            const cookies = (await call.call(bridge, PLUGIN, "getCookies", {
              url: ADE_COOKIE_URL,
              includeHttpOnly: true,
            })) as Record<string, string>;
            return toCookieHeader(cookies ?? {}) || null;
          } finally {
            // Prima di close: su iOS 15/16 il plugin cancella solo a browser
            // aperto.
            await clearAdeCookies(bridge);
            // Chiusura best-effort: i cookie sono già in mano, e l'utente ha
            // già speso il secondo fattore per ottenerli.
            await call.call(bridge, PLUGIN, "close", {}).catch(() => undefined);
          }
        });
      }),
      listen.call(bridge, PLUGIN, "closeEvent", () => {
        finish(() => Promise.resolve(null));
      }),
    );

    call
      .call(bridge, PLUGIN, "openWebView", {
        url: ADE_PORTAL_LOGIN_URL,
        title: "Accedi con SPID e apri Documento commerciale online",
        isPresentAfterPageLoad: false,
      })
      .catch((err: unknown) => {
        finish(() => Promise.reject(err));
      });
  });
}
