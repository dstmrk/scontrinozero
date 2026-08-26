import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/**
 * Messaggio lanciato da Next.js/undici quando un POST con body non-FormData
 * colpisce l'handler delle Server Actions. In pratica generato solo da bot che
 * sondano path inesistenti (es. `POST /RSC/<random>.txt` → `/_not-found/page`):
 * non è mai un flusso legittimo dell'app, la richiesta finirebbe comunque in
 * 404 e l'errore non è azionabile. Lo filtriamo per non inquinare Sentry
 * (issue SCONTRINOZERO-E).
 */
const FORMDATA_PARSE_MESSAGE = "Failed to parse body as FormData";

function extractErrorMessage(event: ErrorEvent, hint?: EventHint): string {
  const original = hint?.originalException;
  if (original instanceof Error) {
    return original.message;
  }
  if (typeof original === "string") {
    return original;
  }
  return event.exception?.values?.[0]?.value ?? "";
}

/**
 * Messaggi nativi del browser per fallimenti di rete a livello di trasporto
 * (TCP/TLS drop, nessuna connessione, app iOS in background).
 * Non vengono mai generati da codice applicativo — sono sempre non azionabili.
 */
const NETWORK_FAILURE_MESSAGES = ["Load failed", "Failed to fetch"];

/**
 * True se l'evento è un fallimento di rete client-side — il browser non è
 * riuscito a completare la chiamata fetch() prima di ricevere una risposta.
 * Tipico su mobile con connessione instabile (issue SCONTRINOZERO-J).
 *
 * La fetch-instrumentation di Sentry (`@sentry/core/instrument/fetch.ts`)
 * arricchisce il messaggio col suffisso `(<host>)` — es.
 * `"Failed to fetch (safesearchinc.com)"` da uno script iniettato da
 * un'estensione browser (issue SCONTRINOZERO-R), o `(app.scontrinozero.it)`
 * su un `fetchServerAction` caduto. Matchiamo quindi sia la forma nuda sia
 * quella col suffisso, restando stretti (`base` seguita da ` (`) per non
 * catturare messaggi applicativi che iniziano per caso con la stessa base.
 */
export function isClientNetworkFailure(
  event: ErrorEvent,
  hint?: EventHint,
): boolean {
  const message = extractErrorMessage(event, hint);
  return NETWORK_FAILURE_MESSAGES.some(
    (base) => message === base || message.startsWith(`${base} (`),
  );
}

/**
 * Frasi dei `DOMException: NetworkError` prodotti dal GATT di Web Bluetooth
 * quando la stampante termica non risponde (spenta, batteria esaurita, fuori
 * portata): "GATT operation failed for unknown reason.", "GATT Server is
 * disconnected…", "Bluetooth Device is no longer in range.".
 */
const BLUETOOTH_GATT_PHRASES = ["GATT", "Bluetooth Device"];

/**
 * True se l'evento è una scrittura GATT fallita verso la stampante Bluetooth.
 *
 * Perché filtrarla: è una **condizione ordinaria d'uso** — la stampantina al
 * banco viene spenta, si scarica o esce dal raggio — che l'utente vede già
 * come "Stampante non raggiungibile…" e risolve con "Ricollega" (regola 20:
 * errori prevedibili dall'input → nessuna issue Sentry).
 *
 * Perché arriva comunque come `unhandledrejection`: la coda interna di
 * `@point-of-sale/webbluetooth-receipt-printer@2` fa `await job()` senza
 * catch, quindi il rigetto della `writeValueWithResponse` non passa mai dal
 * nostro `try/catch` — `printBytes` lo intercetta solo col timeout
 * (`PRINT_TIMEOUT_MS` in `src/lib/printing/bluetooth-printer.ts`), mentre il
 * rigetto originale finisce a `window.onunhandledrejection`.
 *
 * Lo scope è stretto — tipo `NetworkError` **e** frase GATT — così un
 * `NetworkError` di altra origine resta visibile.
 */
export function isBluetoothGattFailure(
  event: ErrorEvent,
  hint?: EventHint,
): boolean {
  const original = hint?.originalException;
  const type =
    original instanceof DOMException
      ? original.name
      : event.exception?.values?.[0]?.type;
  if (type !== "NetworkError") return false;

  const message = extractErrorMessage(event, hint);
  return BLUETOOTH_GATT_PHRASES.some((phrase) => message.includes(phrase));
}

/**
 * Funzioni del runtime di streaming SSR iniettato da React (Fizz): `$RS`
 * (completeSegment), `$RC` (completeBoundary) e simili spostano i nodi DOM dei
 * boundary Suspense man mano che lo stream arriva dal server. Sono codice
 * generato da React, non frame applicativi.
 */
const REACT_STREAM_RUNTIME_FUNCTIONS = new Set([
  "$RS",
  "$RC",
  "$RM",
  "$RR",
  "$RB",
  "$RT",
  "$RX",
]);

/**
 * True se l'evento è la benigna race del runtime di streaming SSR di React:
 * `TypeError: null is not an object (evaluating 'b.parentNode')` (frase Safari;
 * su Chrome `Cannot read properties of null (reading 'parentNode')`) lanciato da
 * `$RS`/`$RC`. Accade su Mobile Safari quando il nodo placeholder di un boundary
 * Suspense è già stato rimosso dal DOM (navigazione rapida, bfcache, estensione)
 * prima che lo stream lo risolva: `b.parentNode` è `null`. È codice generato da
 * React — non nostro e non azionabile (issue SCONTRINOZERO-K). Lo scope è stretto
 * (messaggio su `parentNode` null + frame del runtime Fizz nello stack) per non
 * filtrare un eventuale bug applicativo reale che tocchi `parentNode`.
 */
export function isReactStreamingDomError(
  event: ErrorEvent,
  hint?: EventHint,
): boolean {
  const message = extractErrorMessage(event, hint);
  if (!message.includes("parentNode") || !message.includes("null")) {
    return false;
  }

  const frames = event.exception?.values?.flatMap(
    (value) => value.stacktrace?.frames ?? [],
  );
  return Boolean(
    frames?.some(
      (frame) =>
        frame.function != null &&
        REACT_STREAM_RUNTIME_FUNCTIONS.has(frame.function),
    ),
  );
}

/**
 * Script iniettato dal browser in-app di Facebook/Instagram (Android WebView)
 * per il proprio navigation performance logging. Tenta di richiamare il
 * bridge nativo Java dopo che l'Activity ospite è già stata distrutta
 * (l'utente ha chiuso l'in-app browser o è navigato altrove): "Java object is
 * gone" segnala che l'oggetto JS-to-Java non esiste più lato nativo. Non è
 * codice nostro — lo stack è interamente `app://navigation_performance_logger_android`,
 * un file che l'app non serve mai — e non è azionabile (issue
 * SCONTRINOZERO-10).
 */
const IN_APP_BROWSER_BRIDGE_SCRIPT = "navigation_performance_logger_android";

/**
 * True se l'evento è il fallimento benigno del bridge nativo dell'in-app
 * browser Facebook/Instagram. Lo scope combina messaggio ("Java object is
 * gone") e frame dello stack (`navigation_performance_logger_android`) per
 * non filtrare un eventuale errore applicativo che citi per caso lo stesso
 * messaggio.
 */
export function isInAppBrowserBridgeError(
  event: ErrorEvent,
  hint?: EventHint,
): boolean {
  const message = extractErrorMessage(event, hint);
  if (!message.includes("Java object is gone")) {
    return false;
  }

  const frames = event.exception?.values?.flatMap(
    (value) => value.stacktrace?.frames ?? [],
  );
  return Boolean(
    frames?.some((frame) =>
      frame.filename?.includes(IN_APP_BROWSER_BRIDGE_SCRIPT),
    ),
  );
}

/**
 * Dominio pubblico di ScontrinoZero.
 *
 * **Hardcoded di proposito**: non può derivare da `APP_HOSTNAME` o dalle
 * `NEXT_PUBLIC_*_HOSTNAME` come fanno `parseTrustedHostnameEnv()` e
 * `getAppHostname()`, perché un'istanza self-hosted quelle env le imposta col
 * **proprio** dominio — ed è esattamente l'istanza da cui non vogliamo eventi.
 * Derivarla dall'ambiente renderebbe il filtro un no-op proprio dove serve.
 */
const OWN_APEX_DOMAIN = "scontrinozero.it";

/**
 * Host di sviluppo locale: chi lavora con un DSN in `.env.local` deve
 * continuare a vedere i propri eventi. In CI e su `:dev` Sentry è comunque
 * spento (`deploy-dev.yml` non passa il DSN), quindi qui non passa nulla.
 */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isOwnHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (LOCAL_HOSTNAMES.has(host)) return true;
  // Confronto per label, non per suffisso nudo: `notscontrinozero.it` e
  // `scontrinozero.it.evil.example` NON sono nostri.
  return host === OWN_APEX_DOMAIN || host.endsWith(`.${OWN_APEX_DOMAIN}`);
}

/**
 * True se l'evento arriva da un host che non è nostro — in pratica da
 * un'**istanza self-hosted** di ScontrinoZero.
 *
 * Perché serve: `deploy.yml` passa `NEXT_PUBLIC_SENTRY_DSN` come build-arg e
 * il `Dockerfile` lo fissa con `ENV` nell'immagine finale, che è pubblica su
 * GHCR (self-hosting è un piano supportato, €0). Chiunque esegua
 * `ghcr.io/dstmrk/scontrinozero:latest` ha quindi Sentry **attivo e puntato su
 * questo progetto** senza saperlo: i suoi errori diventano nostre issue.
 *
 * Due danni, uno peggiore dell'altro:
 * 1. Telemetria inquinata. SCONTRINOZERO-11 — un allarme `CF-Connecting-IP`
 *    mancante, taggato `environment: production` — veniva da una macchina di
 *    terzi (boot time, core e RAM diversi dal nostro VPS) e ci è costato un'ora
 *    di indagine su un attacco che non esisteva.
 * 2. Dati personali altrui. La regola 22 lega l'utente allo scope con
 *    `Sentry.setUser({ id })`: un'istanza self-hosted ci manda gli ID dei
 *    **suoi** utenti, di cui il titolare è un altro.
 *
 * ⚠️ Fail-open deliberato: un evento **senza** host determinabile passa. Gli
 * errori fuori da una request — cron, migrazioni, fallimenti al boot — non
 * hanno `request.url`, e sono proprio quelli che non possiamo permetterci di
 * perdere dalla nostra produzione. Il filtro scarta solo ciò che riconosce
 * positivamente come estraneo; il grosso della perdita è comunque
 * request-scoped.
 */
export function isForeignHostEvent(event: ErrorEvent): boolean {
  const url = event.request?.url;
  if (!url) return false;

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // URL relativo o malformato: non sappiamo dire, quindi non scartiamo.
    return false;
  }
  if (!hostname) return false;

  return !isOwnHostname(hostname);
}

/**
 * `beforeSend` del client Sentry: scarta le classi di rumore browser
 * riconosciute, lascia passare tutto il resto.
 *
 * Vive qui e non inline in `instrumentation-client.ts` perché
 * `sonar.sources=src`: la logica dei filtri resta coperta dai test e
 * analizzata, mentre il file di bootstrap in root resta pura configurazione.
 *
 * ⚠️ Il bootstrap client è **solo** `instrumentation-client.ts`: il legacy
 * `sentry.client.config.ts` viene iniettato unicamente dal path webpack del
 * SDK (`@sentry/nextjs/build/cjs/config/webpack.js`) e con Turbopack — il
 * bundler di default di Next 16, quello con cui buildiamo — non viene mai
 * incluso nel bundle. Ci è costato il rumore di SCONTRINOZERO-V: i filtri
 * erano scritti e testati ma non giravano in produzione.
 */
export function clientBeforeSend(
  event: ErrorEvent,
  hint?: EventHint,
): ErrorEvent | null {
  // Istanza self-hosted che riporta nel nostro progetto (issue SCONTRINOZERO-11)
  if (isForeignHostEvent(event)) {
    return null;
  }
  // Rumore di rete transiente su mobile e fetch di estensioni browser
  // (issue SCONTRINOZERO-J, SCONTRINOZERO-R, SCONTRINOZERO-V)
  if (isClientNetworkFailure(event, hint)) {
    return null;
  }
  // Race benigna del runtime di streaming SSR di React su Mobile Safari
  // (issue SCONTRINOZERO-K)
  if (isReactStreamingDomError(event, hint)) {
    return null;
  }
  // Stampante termica spenta o fuori portata: condizione ordinaria al banco,
  // già mostrata all'utente come "Stampante non raggiungibile…" (regola 20)
  if (isBluetoothGattFailure(event, hint)) {
    return null;
  }
  // Bridge nativo dell'in-app browser Facebook/Instagram morto dopo la
  // chiusura dell'Activity ospite (issue SCONTRINOZERO-10)
  if (isInAppBrowserBridgeError(event, hint)) {
    return null;
  }
  return event;
}

/**
 * True se l'evento è il benigno `TypeError: Failed to parse body as FormData`
 * generato da una richiesta verso la route not-found (sonda bot). Lo scope è
 * volutamente limitato alla transaction `/_not-found`: su una Server Action
 * reale lo stesso messaggio potrebbe segnalare un bug e va lasciato passare.
 */
export function isBenignFormDataParseError(
  event: ErrorEvent,
  hint?: EventHint,
): boolean {
  const message = extractErrorMessage(event, hint);
  if (!message.includes(FORMDATA_PARSE_MESSAGE)) {
    return false;
  }

  const transaction = event.transaction ?? "";
  return transaction.includes("/_not-found");
}

/**
 * Messaggio lanciato dall'App Router di Next.js quando un POST con body
 * colpisce la route not-found: non trovando una Server Action registrata,
 * l'handler lancia questo errore. Come per il FormData sopra, è generato solo
 * da bot/scanner che sondano path inesistenti con POST (es. Python Requests su
 * `/index.php?option=com_sppagebuilder&task=asset.uploadCustomIcon`, uno
 * scanner di vulnerabilità Joomla). Non è mai un flusso legittimo dell'app: la
 * richiesta finisce comunque in 404 e l'errore non è azionabile. Lo filtriamo
 * per non inquinare Sentry (issue SCONTRINOZERO-T).
 */
const SERVER_ACTION_NOT_FOUND_MESSAGE = "Failed to find Server Action";

/**
 * True se l'evento è il benigno `Failed to find Server Action` generato da un
 * POST verso la route not-found (sonda bot). Lo scope è volutamente limitato
 * alla transaction `/_not-found`: sulle Server Action reali lo stesso messaggio
 * può segnalare un deploy skew genuino (client vecchio verso build nuova) e va
 * lasciato passare per essere investigato.
 */
export function isBenignServerActionNotFound(
  event: ErrorEvent,
  hint?: EventHint,
): boolean {
  const message = extractErrorMessage(event, hint);
  if (!message.includes(SERVER_ACTION_NOT_FOUND_MESSAGE)) {
    return false;
  }

  const transaction = event.transaction ?? "";
  return transaction.includes("/_not-found");
}
