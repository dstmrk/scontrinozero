import Stripe from "stripe";
import type {
  PlanChoice,
  SubscriptionInterval,
  SubscriptionPlan,
} from "@/lib/subscription-change";

const STRIPE_API_VERSION = "2026-09-30.endive" as const;

/**
 * Per-request options da applicare alle chiamate Stripe nel webhook handler.
 *
 * Motivazione: il webhook handler invoca
 * `stripe.subscriptions.retrieve` sincronicamente prima di acknoledgiare;
 * senza timeout, una degradazione esterna farebbe pendere il worker
 * indefinitamente, saturando il pool e amplificando i retry concorrenti
 * di Stripe (deadline ack 30s).
 *
 * IMPORTANTE: NON va applicato globalmente al singleton — i write delle
 * route checkout/portal (`customers.create`, `checkout.sessions.create`)
 * non passano un `Idempotency-Key` esplicito a livello applicativo. Se la
 * SDK timeoutasse client-side dopo che Stripe ha completato il write, un
 * retry utente creerebbe risorse duplicate. Quei write devono mantenere
 * il timeout di default più ampio della SDK; il webhook resta bounded
 * grazie agli override per-request qui sotto.
 *
 * 10s = ~3x p99 osservato per `subscriptions.retrieve` (< 800ms), sotto
 * il deadline ack di Stripe e con margine per i 2 retry SDK.
 */
export const STRIPE_WEBHOOK_REQUEST_OPTIONS: Stripe.RequestOptions = {
  timeout: 10_000,
  maxNetworkRetries: 2,
};

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
 * I prezzi in vendita, uno per piano e intervallo, con la variabile d'ambiente
 * che porta il Price ID. L'ordine conta: le risoluzioni sotto si fermano al
 * primo prezzo che corrisponde, quindi un prezzo Starter o Pro non legge mai
 * le variabili Team, aggiunte dopo (issue #1099). Un ambiente aggiornato
 * senza di esse continua a rinnovare gli abbonamenti esistenti.
 */
const PRICES = [
  { env: "STRIPE_PRICE_STARTER_MONTHLY", plan: "starter", interval: "month" },
  { env: "STRIPE_PRICE_STARTER_YEARLY", plan: "starter", interval: "year" },
  { env: "STRIPE_PRICE_PRO_MONTHLY", plan: "pro", interval: "month" },
  { env: "STRIPE_PRICE_PRO_YEARLY", plan: "pro", interval: "year" },
  { env: "STRIPE_PRICE_TEAM_MONTHLY", plan: "team", interval: "month" },
  { env: "STRIPE_PRICE_TEAM_YEARLY", plan: "team", interval: "year" },
] as const satisfies readonly (PlanChoice & { env: string })[];

/**
 * Controlla se un priceId è uno dei prezzi noti (letti da env al momento della
 * chiamata — consente override nei test tramite process.env).
 */
export function isValidPriceId(priceId: string): boolean {
  return PRICES.some(({ env }) => {
    const known = process.env[env];
    return Boolean(known) && known === priceId;
  });
}

/**
 * Lazy fail-fast getter per le env var STRIPE_PRICE_*.
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
        `Set all ${PRICES.length} STRIPE_PRICE_* variables before deploy.`,
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
  get teamMonthly() {
    return requirePriceEnv("STRIPE_PRICE_TEAM_MONTHLY");
  },
  get teamYearly() {
    return requirePriceEnv("STRIPE_PRICE_TEAM_YEARLY");
  },
} as const;

function priceChoice(priceId: string): PlanChoice | null {
  const price = PRICES.find(({ env }) => requirePriceEnv(env) === priceId);
  return price ? { plan: price.plan, interval: price.interval } : null;
}

/**
 * Ricava il piano da un Stripe Price ID.
 * Ritorna null se il priceId non è noto.
 */
export function planFromPriceId(priceId: string): SubscriptionPlan | null {
  return priceChoice(priceId)?.plan ?? null;
}

/**
 * Ricava l'intervallo ('month' | 'year') da un Stripe Price ID.
 * Ritorna null se il priceId non è noto.
 */
export function intervalFromPriceId(
  priceId: string,
): SubscriptionInterval | null {
  return priceChoice(priceId)?.interval ?? null;
}
