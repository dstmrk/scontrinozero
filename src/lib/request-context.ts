/**
 * Contesto della richiesta HTTP corrente, letto da chiunque logghi durante la
 * richiesta senza che il chiamante debba passarlo a mano.
 *
 * Esiste per il `requestId` della Developer API: il client lo riceve in ogni
 * risposta (`X-Request-Id`) e ce lo gira in una segnalazione, quindi deve
 * comparire su ogni riga di log della richiesta, comprese quelle scritte in
 * profondità da `receipt-service.ts` o dalla cache di sessione AdE. Il 10/11/2026
 * un esercente ci ha mandato due `requestId` che non comparivano in nessun log.
 *
 * Lo storage è un `processSingleton`: il logger che lo legge è duplicato fra il
 * layer action e il layer `rsc` come ogni modulo, e con un'istanza per copia le
 * righe dell'altro layer resterebbero senza contesto.
 */
import { AsyncLocalStorage } from "node:async_hooks";
// Relativo, non `@/lib/...`: il logger che importa questo file è caricato
// anche da `next.config.ts` (via `hostname-env.ts`), dove l'alias non si
// risolve e la build fallisce con "Cannot find module".
import { processSingleton } from "./process-singleton";

export type RequestContext = {
  requestId: string;
  apiKeyId?: string;
  businessId?: string;
};

const storage = processSingleton(
  "requestContext",
  () => new AsyncLocalStorage<RequestContext>(),
);

/** Esegue `fn` con un contesto nuovo per la richiesta `requestId`. */
export function runWithRequestContext<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/** Il contesto della richiesta in corso, `undefined` fuori da una richiesta. */
export function getRequestContext(): Readonly<RequestContext> | undefined {
  return storage.getStore();
}

/** Aggiunge chi chiama alla richiesta in corso, una volta autenticato. */
export function annotateRequestContext(fields: {
  apiKeyId: string;
  businessId: string;
}): void {
  const store = storage.getStore();
  if (!store) return;
  store.apiKeyId = fields.apiKeyId;
  store.businessId = fields.businessId;
}
