/**
 * Feature detection per la stampa via Web Bluetooth.
 *
 * Serve a scegliere il messaggio giusto *prima* di far toccare qualcosa
 * all'utente: un bottone che apre un chooser vuoto perché il Bluetooth è spento
 * sembra un bug dell'app, non una condizione del telefono.
 *
 * Copertura reale dell'API (MDN BCD):
 *  - Chrome/Edge/Samsung Internet su Android ≥ 6 → ok;
 *  - Safari e Firefox (desktop e iOS) → `navigator.bluetooth` assente,
 *    nessun flag lo abilita;
 *  - **WebView Android** (il browser in-app di Instagram, Facebook, ecc.) →
 *    `requestDevice` non esiste. È un caso a parte perché è recuperabile:
 *    basta riaprire il link in Chrome.
 */

export type BluetoothPrintSupport =
  | { readonly status: "supported" }
  /** Il browser non implementa Web Bluetooth (iOS, Firefox, desktop Safari). */
  | { readonly status: "unsupported-browser" }
  /** Pagina aperta in una webview in-app: si risolve aprendo in Chrome. */
  | { readonly status: "in-app-webview" }
  /** API presente ma adattatore Bluetooth spento o assente. */
  | { readonly status: "adapter-off" };

/**
 * Marcatori di webview in-app. `; wv)` è il token che Android aggiunge allo
 * user agent delle WebView; gli altri coprono i browser in-app che lo omettono.
 */
const IN_APP_WEBVIEW_MARKERS = [
  "; wv)",
  "FBAN",
  "FBAV",
  "Instagram",
  "Line/",
  "MicroMessenger",
];

function isInAppWebView(userAgent: string): boolean {
  return IN_APP_WEBVIEW_MARKERS.some((marker) => userAgent.includes(marker));
}

/**
 * Determina se e come questo browser può stampare via Bluetooth.
 * Non lancia mai: ogni fallimento degrada a uno stato descrittivo.
 */
export async function getBluetoothPrintSupport(): Promise<BluetoothPrintSupport> {
  const nav = globalThis.navigator as Navigator | undefined;

  if (!nav?.bluetooth) {
    return {
      status:
        nav?.userAgent && isInAppWebView(nav.userAgent)
          ? "in-app-webview"
          : "unsupported-browser",
    };
  }

  // getAvailability è arrivata in Chrome 78: se manca, si prova comunque
  // invece di negare la feature a priori.
  if (typeof nav.bluetooth.getAvailability !== "function") {
    return { status: "supported" };
  }

  try {
    const available = await nav.bluetooth.getAvailability();
    return { status: available ? "supported" : "adapter-off" };
  } catch {
    // Tipicamente un SecurityError da Permissions-Policy che nega `bluetooth`:
    // l'API c'è ma è inutilizzabile, quindi vale come non supportata.
    return { status: "unsupported-browser" };
  }
}
