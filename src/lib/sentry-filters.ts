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

export function extractErrorMessage(
  event: ErrorEvent,
  hint?: EventHint,
): string {
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
const NETWORK_FAILURE_MESSAGES = new Set(["Load failed", "Failed to fetch"]);

/**
 * True se l'evento è un fallimento di rete client-side — il browser non è
 * riuscito a completare la chiamata fetch() prima di ricevere una risposta.
 * Tipico su mobile con connessione instabile (issue SCONTRINOZERO-J).
 */
export function isClientNetworkFailure(
  event: ErrorEvent,
  hint?: EventHint,
): boolean {
  const message = extractErrorMessage(event, hint);
  return NETWORK_FAILURE_MESSAGES.has(message);
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
