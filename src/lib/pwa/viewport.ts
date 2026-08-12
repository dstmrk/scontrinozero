import type { Viewport } from "next";

/**
 * Viewport dell'app shell (segmento `/dashboard`).
 *
 * `viewportFit: "cover"` non è una preferenza estetica: senza di esso
 * `env(safe-area-inset-*)` risolve a `0px` in ogni browser, e il
 * `pb-[env(safe-area-inset-bottom)]` che `bottom-nav.tsx` porta dalla nascita
 * è padding morto. Con "cover" il layout arriva al bordo fisico dello schermo e
 * le inset diventano reali: la nav fissa appoggia il proprio sfondo al bordo e
 * spinge le voci sopra la home indicator — esattamente il comportamento che
 * quel padding dava già per scontato.
 *
 * Scoped al solo `/dashboard` di proposito. Sul marketing "cover" farebbe
 * scivolare il testo sotto il notch in landscape, dove nessun contenitore
 * compensa le inset left/right.
 *
 * Zoom utente lasciato libero (niente `maximumScale`/`userScalable`): bloccarlo
 * è il modo più veloce per rendere l'app inutilizzabile a chi ha bisogno di
 * ingrandire.
 */
export const dashboardViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
