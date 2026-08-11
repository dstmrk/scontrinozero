import type { Viewport } from "next";

/**
 * Le due superfici di sfondo, in esadecimale.
 *
 * Sono lo stesso `--background` di `src/app/globals.css` — `oklch(1 0 0)` e
 * `oklch(0.145 0 0)` — riscritto in hex perché il meta `theme-color` non
 * accetta `oklch()` su tutti i browser che ci interessano. Se cambia il tema,
 * vanno cambiati qui: il test li ancora ai valori attesi, così la divergenza
 * diventa rossa invece che silenziosa.
 */
export const LIGHT_SURFACE = "#ffffff";
export const DARK_SURFACE = "#0a0a0a";

/**
 * Viewport di default per tutto ciò che non è l'app shell.
 *
 * `theme-color` non era dichiarato da nessuna parte: c'era solo il
 * `theme_color` fisso del manifest, che il browser usa al lancio ma non per la
 * barra degli indirizzi a pagina caricata. Marketing, auth, onboarding e la
 * pagina pubblica dello scontrino montano fuori dal `ThemeProvider` e sono
 * quindi sempre chiari — qui un colore che segue lo schema di sistema sarebbe
 * *sbagliato*: darebbe barra scura sopra una pagina bianca.
 */
export const rootViewport: Viewport = {
  themeColor: LIGHT_SURFACE,
};

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
  // Il dark mode vive solo qui (il ThemeProvider è montato nel dashboard
  // layout), quindi solo qui la status bar deve seguirlo: senza queste due
  // media query resta bianca sopra un'app nera.
  //
  // Copre `system`, che è il `defaultTheme` di tutti. Chi forza il tema da
  // Impostazioni contro lo schema di sistema continua a vedere la barra del
  // colore sbagliato: allineare anche quel caso vuol dire riscrivere il meta
  // tag da client su ogni cambio di tema (next-themes non lo gestisce), e non
  // vale la complessità per una minoranza che ha scelto la discordanza.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: LIGHT_SURFACE },
    { media: "(prefers-color-scheme: dark)", color: DARK_SURFACE },
  ],
};
