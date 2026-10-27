import { formatCurrency } from "@/lib/utils";

/**
 * Listino dei piani: l'unica fonte dei prezzi che sito e app mostrano (issue
 * #1106). Modulo puro, importabile anche dai client component.
 *
 * Stripe resta la fonte di ciò che si addebita: un cambio di prezzo tocca i
 * prezzi su Stripe e questa tabella, nient'altro. Il gate
 * `plan-prices.contract.test.ts` boccia un prezzo di listino scritto a mano
 * fuori da qui.
 */

/** I piani con un prezzo di listino. */
export type ListedPlan = "starter" | "pro" | "team";

/** In centesimi, come ogni importo del repo (skill `money-rounding`). */
export const PLAN_PRICE_CENTS: Readonly<
  Record<ListedPlan, Readonly<{ monthly: number; yearly: number }>>
> = {
  starter: { monthly: 499, yearly: 2999 },
  pro: { monthly: 899, yearly: 4999 },
  team: { monthly: 1799, yearly: 9999 },
};

/** I prezzi di un piano come li scrive il copy, già formattati. */
type PlanPriceLabels = Readonly<{
  monthly: string;
  yearly: string;
  /** L'annuale diviso per 12, arrotondato al centesimo. */
  yearlyPerMonth: string;
  /** Dodici mensili: il termine di paragone dell'annuale. */
  twelveMonthly: string;
  /** Quanto costa in meno l'annuale di dodici mensili, in punti interi. */
  yearlyDiscountPercent: number;
}>;

/** `4,99 €`: la forma italiana di Intl, con lo spazio non separabile. */
function formatPrice(cents: number): string {
  return formatCurrency(cents / 100);
}

function priceLabels(plan: ListedPlan): PlanPriceLabels {
  const { monthly, yearly } = PLAN_PRICE_CENTS[plan];
  return {
    monthly: formatPrice(monthly),
    yearly: formatPrice(yearly),
    yearlyPerMonth: formatPrice(Math.round(yearly / 12)),
    twelveMonthly: formatPrice(12 * monthly),
    yearlyDiscountPercent: Math.round(100 * (1 - yearly / (12 * monthly))),
  };
}

export const PLAN_PRICES: Readonly<Record<ListedPlan, PlanPriceLabels>> = {
  starter: priceLabels("starter"),
  pro: priceLabels("pro"),
  team: priceLabels("team"),
};

/** Il prezzo di un'offerta schema.org: punto decimale, due cifre (`"4.99"`). */
export function schemaOrgPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}
