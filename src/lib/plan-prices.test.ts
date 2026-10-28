import { describe, expect, it } from "vitest";
import { PLAN_PRICE_CENTS, PLAN_PRICES, schemaOrgPrice } from "./plan-prices";

/** Intl separa importo e simbolo con uno spazio non separabile. */
const norm = (s: string) => s.replaceAll(" ", " ");

describe("PLAN_PRICE_CENTS", () => {
  it("è il listino in centesimi di Starter, Pro e Team", () => {
    expect(PLAN_PRICE_CENTS).toEqual({
      starter: { monthly: 499, yearly: 2999 },
      pro: { monthly: 899, yearly: 4999 },
      team: { monthly: 1799, yearly: 9999 },
    });
  });
});

describe("PLAN_PRICES", () => {
  it.each([
    ["starter", "4,99 €", "29,99 €"],
    ["pro", "8,99 €", "49,99 €"],
    ["team", "17,99 €", "99,99 €"],
  ] as const)("%s: mensile %s, annuale %s", (plan, monthly, yearly) => {
    expect(norm(PLAN_PRICES[plan].monthly)).toBe(monthly);
    expect(norm(PLAN_PRICES[plan].yearly)).toBe(yearly);
  });

  it.each([
    // 2999/12 = 249,92 → 250; 4999/12 = 416,58 → 417; 9999/12 = 833,25 → 833
    ["starter", "2,50 €"],
    ["pro", "4,17 €"],
    ["team", "8,33 €"],
  ] as const)(
    "%s: l'annuale diviso per 12 si arrotonda al centesimo (%s)",
    (plan, perMonth) => {
      expect(norm(PLAN_PRICES[plan].yearlyPerMonth)).toBe(perMonth);
    },
  );

  it.each([
    ["starter", "59,88 €"],
    ["pro", "107,88 €"],
    ["team", "215,88 €"],
  ] as const)("%s: dodici mensili costano %s", (plan, twelve) => {
    expect(norm(PLAN_PRICES[plan].twelveMonthly)).toBe(twelve);
  });

  it.each([
    // 1 − 2999/5988 = 49,9%; 1 − 4999/10788 = 53,7%; 1 − 9999/21588 = 53,7%
    ["starter", 50],
    ["pro", 54],
    ["team", 54],
  ] as const)(
    "%s: l'annuale costa il %i% in meno di dodici mensili",
    (plan, percent) => {
      expect(PLAN_PRICES[plan].yearlyDiscountPercent).toBe(percent);
    },
  );

  it("tiene importo e simbolo sulla stessa riga", () => {
    expect(PLAN_PRICES.starter.yearly).toBe("29,99 €");
  });
});

describe("schemaOrgPrice", () => {
  it("scrive l'importo col punto e due decimali, come vuole schema.org", () => {
    expect(schemaOrgPrice(499)).toBe("4.99");
    expect(schemaOrgPrice(2999)).toBe("29.99");
    expect(schemaOrgPrice(9999)).toBe("99.99");
  });

  it("tiene i due decimali anche su un importo tondo", () => {
    expect(schemaOrgPrice(3000)).toBe("30.00");
  });
});
