/**
 * Pure helpers per le server actions di analytics. NO "use server" — questo
 * file e' importabile sia da modulo server-action sia direttamente dai test
 * con tutte le funzioni esportate (anche quelle sync).
 *
 * **Timezone:** tutta l'aggregazione e' ancorata al fuso fiscale italiano
 * (Europe/Rome). Un scontrino emesso alle 00:30 ora italiana del 19 maggio
 * viene memorizzato come 22:30Z del 18 maggio, ma per scopi fiscali e di UX
 * deve apparire nel giorno "2026-05-19". I bounds di range, i bucket
 * giornalieri e fillMissingDays usano quindi sempre il calendario Rome.
 */

export type AnalyticsRange = "7d" | "30d" | "90d" | "ytd";

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
  /** Data nel formato yyyy-MM-dd (giorno fiscale italiano, Europe/Rome). */
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
  "ytd",
]);

// I range fixed-window hanno un numero costante di giorni. YTD e' variabile
// (1..366), quindi gestito separatamente in rangeToBounds.
const RANGE_DAYS: Record<Exclude<AnalyticsRange, "ytd">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const ROME_TZ = "Europe/Rome";
const ROME_DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: ROME_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const ROME_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: ROME_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/**
 * Ritorna il giorno fiscale italiano (yyyy-MM-dd) per l'istante dato.
 * Internamente usa Intl con timeZone "Europe/Rome" per gestire DST in
 * modo corretto senza libreria esterna.
 */
export function formatRomeDay(d: Date): string {
  // en-CA produce direttamente "yyyy-MM-dd".
  return ROME_DAY_FORMATTER.format(d);
}

/**
 * Restituisce l'instant UTC che corrisponde alla mezzanotte (00:00:00)
 * Europe/Rome del giorno fiscale `romeDay`.
 *
 * Algoritmo: prendi noon UTC dello stesso giorno calendar (sicuro per DST,
 * non e' mai 02:00-03:00 di transizione), chiedi a Intl quali sono ore/min/sec
 * a Rome in quell'instant, sottrai quell'offset da noon → ottieni l'instant
 * UTC di mezzanotte Rome. Gestisce automaticamente CET e CEST.
 */
export function romeMidnightUtc(romeDay: string): Date {
  const year = Number(romeDay.slice(0, 4));
  const month = Number(romeDay.slice(5, 7)) - 1;
  const day = Number(romeDay.slice(8, 10));
  const noonUtcMs = Date.UTC(year, month, day, 12, 0, 0);

  const parts = ROME_TIME_FORMATTER.formatToParts(new Date(noonUtcMs));
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? "0");
  // en-GB con hour12:false puo' restituire "24" a mezzanotte: normalizza.
  const h = get("hour") % 24;
  const m = get("minute");
  const s = get("second");

  return new Date(noonUtcMs - (h * 3600 + m * 60 + s) * 1000);
}

/**
 * Aggiunge `n` giorni di calendario a una data nel formato yyyy-MM-dd.
 * Usa aritmetica UTC sulla data nominale (non un instant temporale), quindi
 * e' insensibile a DST.
 */
function addCalendarDays(romeDay: string, n: number): string {
  const d = new Date(`${romeDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Mappa una range string a [from, to) — entrambi instant UTC che
 * corrispondono alla mezzanotte Europe/Rome del rispettivo giorno fiscale.
 *
 * - `to` = mezzanotte Rome del giorno successivo al reference (upper
 *   bound exclusive che include il giorno corrente per intero).
 * - `from`:
 *   - per i range fixed-window (`7d`/`30d`/`90d`) = `to` - `days` giorni di
 *     calendario fiscale italiano.
 *   - per `ytd` = mezzanotte Rome del 1° gennaio dell'anno fiscale italiano
 *     della reference. La lunghezza varia tra 1 giorno (1° gennaio) e
 *     366 giorni (31 dicembre di anno bisestile).
 */
export function rangeToBounds(
  range: AnalyticsRange,
  reference: Date = new Date(),
): { from: Date; to: Date } {
  const todayRome = formatRomeDay(reference);
  const toDay = addCalendarDays(todayRome, 1);
  const fromDay =
    range === "ytd"
      ? `${todayRome.slice(0, 4)}-01-01`
      : addCalendarDays(toDay, -RANGE_DAYS[range]);
  return {
    from: romeMidnightUtc(fromDay),
    to: romeMidnightUtc(toDay),
  };
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
 * Espande una Map<romeDay, cents> in un array continuo coprendo tutti i
 * giorni fiscali italiani del range [from, to). I giorni mancanti sono
 * riempiti con `revenueCents: 0`.
 */
export function fillMissingDays(
  byDay: ReadonlyMap<string, number>,
  from: Date,
  to: Date,
): RevenuePoint[] {
  const out: RevenuePoint[] = [];
  let cursor = formatRomeDay(from);
  const end = formatRomeDay(to);
  while (cursor < end) {
    out.push({ date: cursor, revenueCents: byDay.get(cursor) ?? 0 });
    cursor = addCalendarDays(cursor, 1);
  }
  return out;
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

// ---------------------------------------------------------------------------
// Pure aggregations: derivano KPI/timeseries/breakdown da un dataset gia'
// fetchato (docs + totalsByDoc). Estratte qui per testabilita' diretta e per
// permettere a getAnalyticsDataset di fetchare i dati una volta sola e
// derivare i 3 risultati in memoria invece di triplicare le query DB.
// ---------------------------------------------------------------------------

type AnalyticsDocRow = {
  id: string;
  status: string;
  createdAt: Date;
  publicRequest?: unknown;
};

export function computeKpis(
  docs: readonly AnalyticsDocRow[],
  totalsByDoc: ReadonlyMap<string, number>,
): AnalyticsKpis {
  let revenueCents = 0;
  let count = 0;
  let voidCount = 0;
  for (const doc of docs) {
    if (doc.status === "ACCEPTED") {
      count++;
      revenueCents += toCents(totalsByDoc.get(doc.id) ?? 0);
    } else if (doc.status === "VOID_ACCEPTED") {
      voidCount++;
    }
  }
  const aovCents = count === 0 ? 0 : Math.round(revenueCents / count);
  return { revenueCents, count, aovCents, voidCount };
}

export function computeTimeseries(
  docs: readonly AnalyticsDocRow[],
  totalsByDoc: ReadonlyMap<string, number>,
  from: Date,
  to: Date,
): RevenuePoint[] {
  const byDay = new Map<string, number>();
  for (const doc of docs) {
    if (doc.status !== "ACCEPTED") continue;
    // Bucket per giorno fiscale italiano (Europe/Rome), non UTC: uno
    // scontrino emesso alle 00:30 ora locale del 19 maggio deve apparire
    // nel giorno "2026-05-19", anche se internamente e' 22:30Z del 18.
    const key = formatRomeDay(doc.createdAt);
    byDay.set(
      key,
      (byDay.get(key) ?? 0) + toCents(totalsByDoc.get(doc.id) ?? 0),
    );
  }
  return fillMissingDays(byDay, from, to);
}

export function computeBreakdown(
  docs: readonly AnalyticsDocRow[],
  totalsByDoc: ReadonlyMap<string, number>,
): PaymentBreakdownEntry[] {
  const byMethod = new Map<string, { count: number; revenueCents: number }>();
  for (const doc of docs) {
    if (doc.status !== "ACCEPTED") continue;
    const method = normalizePaymentMethod(
      doc.publicRequest && typeof doc.publicRequest === "object"
        ? (doc.publicRequest as { paymentMethod?: unknown }).paymentMethod
        : null,
    );
    const entry = byMethod.get(method) ?? { count: 0, revenueCents: 0 };
    entry.count++;
    entry.revenueCents += toCents(totalsByDoc.get(doc.id) ?? 0);
    byMethod.set(method, entry);
  }
  return Array.from(byMethod.entries()).map(([method, agg]) => ({
    method,
    ...agg,
  }));
}
