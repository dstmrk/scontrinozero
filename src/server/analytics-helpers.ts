/**
 * Pure helpers per le server actions di analytics. NO "use server" — questo
 * file e' importabile sia da modulo server-action sia direttamente dai test
 * con tutte le funzioni esportate (anche quelle sync).
 */

export type AnalyticsRange = "7d" | "30d" | "90d";

export type AnalyticsKpis = {
  /** Totale ricavi (solo SALE ACCEPTED) espresso in centesimi. */
  revenueCents: number;
  /** Numero scontrini SALE ACCEPTED. */
  count: number;
  /** Average Order Value in centesimi. Ritorna 0 se count == 0. */
  aovCents: number;
  /** Numero scontrini annullati (SALE con status VOID_ACCEPTED). */
  voidCount: number;
};

export type RevenuePoint = {
  /** Data nel formato yyyy-MM-dd (UTC). */
  date: string;
  /** Ricavi della giornata in centesimi (solo ACCEPTED). */
  revenueCents: number;
};

export type PaymentBreakdownEntry = {
  /** "PC" | "PE" | "other". */
  method: string;
  count: number;
  revenueCents: number;
};

export const VALID_RANGES: ReadonlySet<AnalyticsRange> = new Set([
  "7d",
  "30d",
  "90d",
]);

const RANGE_DAYS: Record<AnalyticsRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/**
 * Mappa una range string a [from, to) UTC.
 * `to` e' il giorno SUCCESSIVO al reference (midnight UTC) per includere
 * tutto il "today".
 */
export function rangeToBounds(
  range: AnalyticsRange,
  reference: Date = new Date(),
): { from: Date; to: Date } {
  const days = RANGE_DAYS[range];
  const to = new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate() + 1,
    ),
  );
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - days);
  return { from, to };
}

/**
 * Normalizza un valore di paymentMethod proveniente da publicRequest jsonb.
 * Riconosce "PC" e "PE"; ogni altra cosa diventa "other".
 */
export function normalizePaymentMethod(value: unknown): string {
  if (typeof value !== "string") return "other";
  if (value === "PC" || value === "PE") return value;
  return "other";
}

/**
 * Espande una Map<date, cents> in un array continuo coprendo tutti i giorni
 * del range [from, to). I giorni mancanti sono riempiti con `revenueCents: 0`.
 */
export function fillMissingDays(
  byDay: ReadonlyMap<string, number>,
  from: Date,
  to: Date,
): RevenuePoint[] {
  const out: RevenuePoint[] = [];
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
  );
  while (cursor < end) {
    const key = cursor.toISOString().slice(0, 10);
    out.push({ date: key, revenueCents: byDay.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}
