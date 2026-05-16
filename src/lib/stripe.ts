import Stripe from "stripe";

const STRIPE_API_VERSION = "2026-04-22.dahlia" as const;

// Timeout esplicito su ogni chiamata HTTP outbound a Stripe.
// Motivazione (P2 REVIEW.md): il webhook handler chiama
// `stripe.subscriptions.retrieve` sincronicamente prima di acknoledgiare;
// senza timeout, una degradazione esterna farebbe pendere il worker
// indefinitamente (default Node ~120s socket idle), saturando il pool
// e amplificando i retry concorrenti di Stripe (deadline ack 30s).
// 10s è 3x il p99 osservato per `subscriptions.retrieve` (< 800ms) ma
// resta sotto il deadline di Stripe permettendo retry interni.
const STRIPE_REQUEST_TIMEOUT_MS = 10_000;

// maxNetworkRetries: la SDK ritenta automaticamente con exponential backoff
// errori transienti (5xx Stripe, network blip, timeout). 2 retry sono
// sufficienti per assorbire i blip senza eccedere il deadline ack del webhook.
const STRIPE_MAX_NETWORK_RETRIES = 2;

// Module-level singleton: one instance per Node.js process.
// Avoids creating a new Stripe client on every call to getStripe() which adds
// unnecessary object churn on hot paths (webhook, checkout, portal).
let _stripe: Stripe | null = null;

/**
 * Restituisce l'istanza Stripe condivisa (singleton per processo).
 * Lancia se STRIPE_SECRET_KEY non è definita (evita crash al build).
 */
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      "STRIPE_SECRET_KEY environment variable is required. " +
        "Set it to your Stripe secret key (sk_test_... or sk_live_...).",
    );
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: STRIPE_API_VERSION,
      timeout: STRIPE_REQUEST_TIMEOUT_MS,
      maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
    });
  }
  return _stripe;
}

/**
 * Resets the cached Stripe singleton. For use in tests only.
 * @internal
 */
export function _resetStripeForTest(): void {
  _stripe = null;
}

/**
 * Controlla se un priceId è uno dei 4 prezzi noti (letti da env al momento della
 * chiamata — consente override nei test tramite process.env).
 */
export function isValidPriceId(priceId: string): boolean {
  const knownIds = [
    process.env.STRIPE_PRICE_STARTER_MONTHLY,
    process.env.STRIPE_PRICE_STARTER_YEARLY,
    process.env.STRIPE_PRICE_PRO_MONTHLY,
    process.env.STRIPE_PRICE_PRO_YEARLY,
  ].filter(Boolean);
  return knownIds.includes(priceId);
}

/**
 * Lazy fail-fast getter per le 4 env var STRIPE_PRICE_*.
 * Se l'env è missing/empty al momento dell'accesso, lanciamo subito invece di
 * propagare una stringa vuota — evita revenue loss silenzioso (un checkout
 * che fallisce solo al primo utente reale che tenta l'upgrade, ore/giorni
 * dopo il deploy, senza alert su Sentry).
 */
function requirePriceEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required Stripe price env var: ${name}. ` +
        "Set the 4 STRIPE_PRICE_* variables before deploy.",
    );
  }
  return v;
}

/**
 * Price ID per piano e intervallo — acceduti dai valori correnti di env.
 * Usare `isValidPriceId()` per validazione; usare queste costanti per riferimento.
 */
export const PRICE_IDS = {
  get starterMonthly() {
    return requirePriceEnv("STRIPE_PRICE_STARTER_MONTHLY");
  },
  get starterYearly() {
    return requirePriceEnv("STRIPE_PRICE_STARTER_YEARLY");
  },
  get proMonthly() {
    return requirePriceEnv("STRIPE_PRICE_PRO_MONTHLY");
  },
  get proYearly() {
    return requirePriceEnv("STRIPE_PRICE_PRO_YEARLY");
  },
} as const;

/**
 * Ricava il nome del piano ('starter' | 'pro') da un Stripe Price ID.
 * Ritorna null se il priceId non è noto.
 */
export function planFromPriceId(priceId: string): "starter" | "pro" | null {
  if (
    priceId === PRICE_IDS.starterMonthly ||
    priceId === PRICE_IDS.starterYearly
  ) {
    return "starter";
  }
  if (priceId === PRICE_IDS.proMonthly || priceId === PRICE_IDS.proYearly) {
    return "pro";
  }
  return null;
}

/**
 * Ricava l'intervallo ('month' | 'year') da un Stripe Price ID.
 * Ritorna null se il priceId non è noto.
 */
export function intervalFromPriceId(priceId: string): "month" | "year" | null {
  if (
    priceId === PRICE_IDS.starterMonthly ||
    priceId === PRICE_IDS.proMonthly
  ) {
    return "month";
  }
  if (priceId === PRICE_IDS.starterYearly || priceId === PRICE_IDS.proYearly) {
    return "year";
  }
  return null;
}
