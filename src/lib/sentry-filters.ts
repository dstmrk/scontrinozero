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
