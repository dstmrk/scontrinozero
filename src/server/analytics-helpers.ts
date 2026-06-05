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

/** Range di default quando l'URL non specifica `?range=` o il valore è invalido. */
export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = "30d";

const ANALYTICS_RANGES: ReadonlySet<AnalyticsRange> = new Set([
  "7d",
  "30d",
  "90d",
  "ytd",
]);

/**
 * Valida un valore grezzo (es. da `?range=` nell'URL) contro l'allowlist dei
 * range supportati. Un valore mancante o non valido ricade sul default invece
 * di lanciare: il deep link è una comodità, non deve mai rompere il render
 * (coerente con regola 19 — degradare, non lanciare).
 */
export function parseAnalyticsRange(raw: string | undefined): AnalyticsRange {
  return raw && ANALYTICS_RANGES.has(raw as AnalyticsRange)
    ? (raw as AnalyticsRange)
    : DEFAULT_ANALYTICS_RANGE;
}

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

export type ProductBreakdownEntry = {
  /** Variante "display" della descrizione (la più frequente nei dati). */
  description: string;
  /** Ricavo totale del prodotto/servizio in centesimi. */
  revenueCents: number;
  /** Numero di righe (occorrenze) che mappano su questa descrizione. */
  count: number;
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

type AnalyticsLineRow = {
  description: string;
  quantity: string;
  grossUnitPrice: string;
};

const EMPTY_DESCRIPTION_LABEL = "(senza descrizione)";
const OTHER_BUCKET_LABEL = "Altro";

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

/**
 * Aggrega ricavo per descrizione di prodotto/servizio dalle righe degli
 * scontrini ACCEPTED. La chiave di raggruppamento e' case-insensitive +
 * trim: l'utente che scrive "Caffè" e "caffè" non vede due voci separate.
 *
 * Restituisce i top `topN` per ricavo decrescente. Se restano voci oltre
 * il top, vengono aggregate in un bucket finale "Altro" (descrizione
 * letterale "Altro" — collide visivamente solo se il negoziante usa
 * davvero la parola "Altro" come nome prodotto, caso raro).
 */
type ProductAgg = {
  /**
   * Somma `qty * price` in float, NON ancora arrotondata: per coerenza con
   * `calcDocTotal` (`src/lib/receipts/document-lines.ts`) la conversione a
   * centesimi avviene una sola volta in fondo. Arrotondare per riga produce
   * drift osservabile (es. 3 × 0.333 × 1.00 = 99 cents per-line vs 100 cents
   * doc-level), facendo non quadrare la somma del breakdown prodotti col
   * ricavo KPI sullo stesso range.
   */
  revenueFloat: number;
  count: number;
  variants: Map<string, number>;
};

function aggregateProductLines(
  docs: readonly AnalyticsDocRow[],
  linesByDoc: ReadonlyMap<string, readonly AnalyticsLineRow[]>,
): Map<string, ProductAgg> {
  const byKey = new Map<string, ProductAgg>();
  for (const doc of docs) {
    if (doc.status !== "ACCEPTED") continue;
    const lines = linesByDoc.get(doc.id);
    if (!lines) continue;
    for (const line of lines) {
      addLineToAggregate(byKey, line);
    }
  }
  return byKey;
}

function addLineToAggregate(
  byKey: Map<string, ProductAgg>,
  line: AnalyticsLineRow,
): void {
  const trimmed = line.description.trim();
  const key = trimmed === "" ? "" : trimmed.toLowerCase();
  const qty = Number.parseFloat(line.quantity);
  const price = Number.parseFloat(line.grossUnitPrice);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return;

  const agg = byKey.get(key) ?? {
    revenueFloat: 0,
    count: 0,
    variants: new Map<string, number>(),
  };
  agg.revenueFloat += qty * price;
  agg.count++;
  if (trimmed !== "") {
    agg.variants.set(trimmed, (agg.variants.get(trimmed) ?? 0) + 1);
  }
  byKey.set(key, agg);
}

/**
 * Sceglie la variante "display" per un gruppo. Su tie di frequenza prende
 * la prima in ordine alfabetico per garantire label deterministica.
 */
function pickDisplayLabel(key: string, variants: Map<string, number>): string {
  if (key === "") return EMPTY_DESCRIPTION_LABEL;
  let best: string | null = null;
  let bestCount = -1;
  for (const [variant, count] of variants) {
    const isBetter =
      count > bestCount ||
      (count === bestCount && best !== null && variant < best);
    if (isBetter) {
      best = variant;
      bestCount = count;
    }
  }
  return best ?? key;
}

function aggregateTail(
  tail: readonly ProductBreakdownEntry[],
): ProductBreakdownEntry {
  return tail.reduce<ProductBreakdownEntry>(
    (acc, e) => ({
      description: OTHER_BUCKET_LABEL,
      revenueCents: acc.revenueCents + e.revenueCents,
      count: acc.count + e.count,
    }),
    { description: OTHER_BUCKET_LABEL, revenueCents: 0, count: 0 },
  );
}

export function computeProductBreakdown(
  docs: readonly AnalyticsDocRow[],
  linesByDoc: ReadonlyMap<string, readonly AnalyticsLineRow[]>,
  topN: number = 10,
): ProductBreakdownEntry[] {
  const byKey = aggregateProductLines(docs, linesByDoc);

  // Materializziamo `sortKey` (chiave normalizzata) per il tiebreak: l'ordine
  // di iterazione del Map dipende dall'insertion order, che a sua volta
  // dipende dall'ordine delle righe DB (non garantito). Senza tiebreak, due
  // prodotti con stesso revenue potrebbero apparire in posizioni diverse a
  // ogni refresh — e il taglio topN potrebbe includere/escludere prodotti
  // diversi tra chiamate.
  const entries = Array.from(byKey.entries()).map(([key, agg]) => ({
    description: pickDisplayLabel(key, agg.variants),
    revenueCents: toCents(agg.revenueFloat),
    count: agg.count,
    sortKey: key,
  }));

  entries.sort((a, b) => {
    if (b.revenueCents !== a.revenueCents)
      return b.revenueCents - a.revenueCents;
    // Byte-wise Unicode comparison (NO localeCompare): in container Linux
    // il locale di default può essere C / en_US.UTF-8 / it_IT.UTF-8 a
    // seconda dell'image e dell'host, e su tiebreak con accenti il sort
    // risulterebbe diverso fra dev/CI/prod/sandbox. Con topN=10 questo
    // includerebbe/escluderebbe prodotti diversi tra request consecutive.
    if (a.sortKey < b.sortKey) return -1;
    if (a.sortKey > b.sortKey) return 1;
    return 0;
  });

  const stripped: ProductBreakdownEntry[] = entries.map(
    ({ description, revenueCents, count }) => ({
      description,
      revenueCents,
      count,
    }),
  );

  if (stripped.length <= topN) return stripped;
  return [...stripped.slice(0, topN), aggregateTail(stripped.slice(topN))];
}
