import Stripe from "stripe";

const STRIPE_API_VERSION = "2026-02-25.clover" as const;

/**
 * Restituisce un'istanza Stripe autenticata.
 * Lancia se STRIPE_SECRET_KEY non è definita (evita crash al build).
 */
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      "STRIPE_SECRET_KEY environment variable is required. " +
        "Set it to your Stripe secret key (sk_test_... or sk_live_...).",
    );
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
  });
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
 * Price ID per piano e intervallo — acceduti dai valori correnti di env.
 * Usare `isValidPriceId()` per validazione; usare queste costanti per riferimento.
 */
export const PRICE_IDS = {
  get starterMonthly() {
    return process.env.STRIPE_PRICE_STARTER_MONTHLY ?? "";
  },
  get starterYearly() {
    return process.env.STRIPE_PRICE_STARTER_YEARLY ?? "";
  },
  get proMonthly() {
    return process.env.STRIPE_PRICE_PRO_MONTHLY ?? "";
  },
  get proYearly() {
    return process.env.STRIPE_PRICE_PRO_YEARLY ?? "";
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
