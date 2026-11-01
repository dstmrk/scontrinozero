import {
  MultiWindowRateLimiter,
  RATE_LIMIT_WINDOWS,
  type RateLimitResult,
} from "@/lib/rate-limit";

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
 * Il limiter vive in memoria nel processo (si azzera al deploy) ed è appeso a
 * `globalThis`, non a una costante di modulo. Turbopack compila la server
 * action della cassa e la route `/api/v1/receipts` in layer diversi, e lo
 * stesso file diventa due moduli con due ID: misurato sulla build di
 * produzione, una costante di modulo dava due contatori, cioè un tetto doppio.
 */
export const EMIT_RATE_LIMIT = { perMinute: 8, perHour: 250 } as const;

const GLOBAL_KEY = Symbol.for("scontrinozero.emitRateLimiter");

type GlobalWithEmitLimiter = typeof globalThis & {
  [GLOBAL_KEY]?: MultiWindowRateLimiter;
};

function sharedEmitRateLimiter(): MultiWindowRateLimiter {
  const g = globalThis as GlobalWithEmitLimiter;
  g[GLOBAL_KEY] ??= new MultiWindowRateLimiter([
    {
      maxRequests: EMIT_RATE_LIMIT.perMinute,
      windowMs: RATE_LIMIT_WINDOWS.MINUTE,
    },
    {
      maxRequests: EMIT_RATE_LIMIT.perHour,
      windowMs: RATE_LIMIT_WINDOWS.HOURLY,
    },
  ]);
  return g[GLOBAL_KEY];
}

export const emitRateLimiter = sharedEmitRateLimiter();

/** Chiave del contatore: stessa stringa da cassa e da API, o non è condiviso. */
export function emitRateLimitKey(businessId: string): string {
  return `emit:${businessId}`;
}

export function checkEmitRateLimit(businessId: string): RateLimitResult {
  return emitRateLimiter.check(emitRateLimitKey(businessId));
}
