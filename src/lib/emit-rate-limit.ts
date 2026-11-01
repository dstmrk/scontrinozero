import {
  MultiWindowRateLimiter,
  RATE_LIMIT_WINDOWS,
  type RateLimitResult,
} from "@/lib/rate-limit";
import { processSingleton } from "@/lib/process-singleton";

/**
 * Tetto alle emissioni di scontrino, **per attività**: cassa web,
 * collaboratori e chiavi API contano sullo stesso contatore.
 *
 * L'unità è l'attività perché è l'unità del vincolo vero: tutte le emissioni
 * di una P.IVA passano dalla stessa utenza AdE e dalla stessa coda
 * serializzata (`AdeSessionCache.run`, `src/lib/ade/session-cache.ts`). Un
 * contatore per chiave o per utente moltiplicava il tetto per il numero di
 * chiavi o di collaboratori senza aggiungere capacità. Uguale per tutti i
 * piani per la stessa ragione: il piano non cambia l'utenza AdE.
 *
 * Soglie tarate sulla produzione (25/03–01/11/2026): picco massimo 6
 * emissioni al minuto e 70 all'ora per una singola attività, latenza AdE p50
 * ~1,1 s e p90 ~1,7 s. 8/min dà margine al picco misurato, che su 60 secondi
 * mobili può superare il conteggio per minuto di orologio, e ai tentativi
 * ripetuti; 250/ora è più di tre volte l'ora più carica vista.
 *
 * Il limiter vive in memoria nel processo (si azzera al deploy) ed è un
 * `processSingleton`: con una costante di modulo, cassa e route API avevano
 * due contatori, cioè un tetto doppio (misurato sulla build di produzione).
 */
export const EMIT_RATE_LIMIT = { perMinute: 8, perHour: 250 } as const;

export const emitRateLimiter = processSingleton(
  "emitRateLimiter",
  () =>
    new MultiWindowRateLimiter([
      {
        maxRequests: EMIT_RATE_LIMIT.perMinute,
        windowMs: RATE_LIMIT_WINDOWS.MINUTE,
      },
      {
        maxRequests: EMIT_RATE_LIMIT.perHour,
        windowMs: RATE_LIMIT_WINDOWS.HOURLY,
      },
    ]),
);

/** Chiave del contatore: stessa stringa da cassa e da API, o non è condiviso. */
export function emitRateLimitKey(businessId: string): string {
  return `emit:${businessId}`;
}

export function checkEmitRateLimit(businessId: string): RateLimitResult {
  return emitRateLimiter.check(emitRateLimitKey(businessId));
}
