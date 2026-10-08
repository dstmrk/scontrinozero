/**
 * Cattura della sessione SPID nell'app nativa (docs/mobile-v2.md, slice 3b).
 *
 * Apre il portale AdE in un InAppBrowser, dove l'utente fa il login SPID e
 * sceglie l'utenza di lavoro come farebbe nel browser. Quando arriva a
 * Documento Commerciale Online, a pagina caricata, la sessione è completa: si
 * leggono i cookie (HttpOnly compresi), li si cancella dal telefono (issue
 * #1041), si chiude il browser e si restituisce l'header `Cookie` che
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

/**
 * I cookie si leggono per l'URL che il server chiama nell'adozione
 * (`RealAdeClient.adoptSession`, `dati/fiscali`), non per la radice: su
 * Android `getCookies` filtra per path come farebbe il browser, e un cookie
 * con `Path=/ser` alla radice non torna (issue #1043). Su iOS il plugin filtra
 * solo per dominio, e l'URL non cambia niente.
 */
export const SPID_COOKIE_URL =
  "https://ivaservizi.agenziaentrate.gov.it/ser/api/documenti/v1/doc/documenti/dati/fiscali";

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
    // Su ogni uscita, a browser chiuso, si cancella di nuovo e si controlla
    // cosa resta: il DCO può scrivere cookie mentre la pagina finisce di
    // caricare. Non si aspetta: connectAdeWithSpid parte subito.
    const finish = (outcome: () => Promise<string | null>) => {
      if (settled) return;
      settled = true;
      const afterClose = () =>
        clearAdeCookies(bridge).then(() => reportAdeCookieResidue(bridge));
      outcome().then(
        (value) => {
          detach();
          resolve(value);
          void afterClose();
        },
        (err: unknown) => {
          detach();
          reject(err);
          void afterClose();
        },
      );
    };
    // Prima di close: su iOS 15/16 il plugin cancella solo a browser aperto.
    // La chiusura è best-effort: i cookie letti valgono un secondo fattore.
    const clearThenClose = async () => {
      await clearAdeCookies(bridge);
      await call.call(bridge, PLUGIN, "close", {}).catch(() => undefined);
    };

    // L'ultimo URL visto è il DCO. Si legge solo quando quella pagina finisce
    // di caricare: su iOS l'URL cambia all'inizio della navigazione, prima che
    // arrivino i cookie della risposta (issue #1043). `browserPageLoaded` non
    // porta l'URL, per questo lo si ricorda qui.
    let atDco = false;

    handles.push(
      listen.call(bridge, PLUGIN, "urlChangeEvent", ({ url }) => {
        atDco = Boolean(url && isDcoUrl(url));
      }),
      listen.call(bridge, PLUGIN, "browserPageLoaded", () => {
        if (!atDco) return;
        finish(async () => {
          try {
            const cookies = (await call.call(bridge, PLUGIN, "getCookies", {
              url: SPID_COOKIE_URL,
              includeHttpOnly: true,
            })) as Record<string, string>;
            return toCookieHeader(cookies ?? {}) || null;
          } finally {
            await clearThenClose();
          }
        });
      }),
      // La X della toolbar nasconde invece di chiudere (`closeAction: "hide"`):
      // il browser resta registrato, e su iOS 15/16 lo si può ancora pulire.
      // Chi fa il login SPID e rinuncia prima del DCO ha già una sessione.
      listen.call(bridge, PLUGIN, "hideEvent", () => {
        finish(async () => {
          await clearThenClose();
          return null;
        });
      }),
      // Chiusure che non passano dalla X (indietro di sistema, gesto).
      listen.call(bridge, PLUGIN, "closeEvent", () => {
        finish(() => Promise.resolve(null));
      }),
    );

    call
      .call(bridge, PLUGIN, "openWebView", {
        url: ADE_PORTAL_LOGIN_URL,
        title: "Accedi con SPID e apri Documento commerciale online",
        isPresentAfterPageLoad: false,
        closeAction: "hide",
      })
      .catch((err: unknown) => {
        finish(() => Promise.reject(err));
      });
  });
}
