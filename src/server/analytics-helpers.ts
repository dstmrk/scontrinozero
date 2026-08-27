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

import {
  parsePublicRequest,
  readRawPaymentMethod,
} from "@/lib/receipts/public-request";

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
 *
 * `fallback` esiste perché il pannello operatore apre su 7 giorni mentre
 * l'analytics esercente resta su 30: due default, un solo vocabolario di
 * periodi. Senza il parametro l'unico modo di differenziarli sarebbe una
 * seconda funzione di parsing, cioè una seconda allowlist da tenere allineata.
 */
export function parseAnalyticsRange(
  raw: string | undefined,
  fallback: AnalyticsRange = DEFAULT_ANALYTICS_RANGE,
): AnalyticsRange {
  return raw && ANALYTICS_RANGES.has(raw as AnalyticsRange)
    ? (raw as AnalyticsRange)
    : fallback;
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
  return eachRomeDay(from, to).map((date) => ({
    date,
    revenueCents: byDay.get(date) ?? 0,
  }));
}

/**
 * Elenca i giorni fiscali italiani (yyyy-MM-dd) coperti da `[from, to)`, in
 * ordine crescente.
 *
 * È l'asse temporale condiviso da ogni serie giornaliera: `fillMissingDays`
 * (analytics dell'esercente) e le sparkline del pannello operatore
 * (`src/server/admin-metrics.ts`) devono produrre lo stesso numero di punti
 * per lo stesso range, altrimenti due grafici affiancati raccontano periodi
 * diversi.
 */
export function eachRomeDay(from: Date, to: Date): string[] {
  const out: string[] = [];
  let cursor = formatRomeDay(from);
  const end = formatRomeDay(to);
  while (cursor < end) {
    out.push(cursor);
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
  /**
   * Sconto di riga (`line_discount`), lordo e già comprensivo della quantità.
   * Assente/`null` sulle righe emesse prima della migrazione 0034.
   */
  lineDiscount?: string | null;
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

/**
 * Ripartisce il ricavo di un documento fra i metodi che lo hanno incassato,
 * in proporzione agli importi pagati.
 *
 * **Si ripartisce il ricavo, non l'incassato.** I pagamenti sommano
 * all'incassato, che con uno sconto a pagare è minore del corrispettivo
 * (`HAR.md` voce #3b): attribuire gli importi così come sono scollegherebbe il
 * grafico dal KPI ricavo che gli sta sopra, e la riconciliazione fra le due
 * viste — l'invariante della skill `money-rounding` — salterebbe su ogni
 * scontrino abbuonato. La proporzione invece regge in entrambi i casi.
 *
 * Il resto della divisione **si assegna, non si butta**: due arrotondamenti
 * indipendenti su un 1:2 darebbero 99 o 101 centesimi su 100. Va a chi ha il
 * resto più grande, e a parità al primo — deterministico, quindi testabile.
 */
function splitRevenueByPayments(
  revenueCents: number,
  payments: readonly { type: string; amountCents: number }[],
): { method: string; cents: number }[] {
  const paidCents = payments.reduce((acc, p) => acc + p.amountCents, 0);
  if (paidCents === 0) return [];

  const parts = payments.map((p) => {
    const exact = (revenueCents * p.amountCents) / paidCents;
    const floor = Math.floor(exact);
    return { method: p.type, cents: floor, remainder: exact - floor };
  });

  let leftover = revenueCents - parts.reduce((acc, p) => acc + p.cents, 0);
  const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder);
  for (const part of byRemainder) {
    if (leftover <= 0) break;
    part.cents++;
    leftover--;
  }

  return parts.map(({ method, cents }) => ({ method, cents }));
}

/**
 * Ricavo e numero di scontrini per metodo di pagamento.
 *
 * ⚠️ **`count` conta il documento una volta per ogni metodo che lo ha
 * incassato**, quindi su un pagamento misto la somma dei `count` supera il
 * numero di scontrini emessi. È voluto: il grafico risponde a "quanto ho
 * incassato per metodo", e un misto ha davvero incassato su due metodi.
 * Il numero di scontrini è un KPI a sé, non la somma di questa colonna.
 */
export function computeBreakdown(
  docs: readonly AnalyticsDocRow[],
  totalsByDoc: ReadonlyMap<string, number>,
): PaymentBreakdownEntry[] {
  const byMethod = new Map<string, { count: number; revenueCents: number }>();

  const add = (method: string, cents: number): void => {
    const entry = byMethod.get(method) ?? { count: 0, revenueCents: 0 };
    entry.count++;
    entry.revenueCents += cents;
    byMethod.set(method, entry);
  };

  for (const doc of docs) {
    if (doc.status !== "ACCEPTED") continue;
    const revenueCents = toCents(totalsByDoc.get(doc.id) ?? 0);
    const { payments } = parsePublicRequest(doc.publicRequest);

    if (payments) {
      for (const part of splitRevenueByPayments(revenueCents, payments)) {
        add(part.method, part.cents);
      }
      continue;
    }

    // Ramo a metodo singolo. `readRawPaymentMethod` e non
    // `parsePublicRequest.paymentMethod`: quello degrada a `"PC"` per la
    // stampa, mentre qui una riga storica priva del campo deve restare
    // `"other"` — attribuirla ai contanti inventerebbe un dato in un grafico
    // che l'esercente legge come misurazione.
    add(
      normalizePaymentMethod(readRawPaymentMethod(doc.publicRequest)),
      revenueCents,
    );
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
   * Somma in centesimi interi, arrotondati PER RIGA e **al netto dello sconto
   * di riga** (`round(qty * price * 100) - round(lineDiscount * 100)`),
   * strategia canonica del progetto (REVIEW.md #1) coerente con `calcDocTotal`
   * e `computeReceiptTotals` (`src/lib/receipts/document-lines.ts`). Poiché sia
   * il ricavo KPI (somma di `calcDocTotal` sui documenti) sia questo breakdown
   * (somma per prodotto) partono dalle stesse righe con la stessa formula,
   * riconciliano alla cifra indipendentemente dal raggruppamento
   * documento↔prodotto.
   *
   * ⚠️ Lo sconto va sottratto QUI e non solo in `calcDocTotal`: le due viste
   * sono somme indipendenti sulle stesse righe, e appena una delle due ignora
   * un campo che l'altra usa, il ricavo totale e la ripartizione per prodotto
   * divergono in silenzio (nessun test le confronta se non si scrive apposta).
   *
   * Lo sconto a pagare invece NON entra: non riduce il corrispettivo
   * (`HAR.md` voce #3b) e vive a livello di documento, non di riga.
   */
  revenueCents: number;
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
    revenueCents: 0,
    count: 0,
    variants: new Map<string, number>(),
  };
  // `Math.max(0, …)`: difesa in profondità come in `receipt-totals.ts`. Una
  // riga con sconto oltre il proprio lordo (import/fix manuale in DB) darebbe
  // un ricavo negativo, che falserebbe il ranking dei prodotti.
  agg.revenueCents += Math.max(
    0,
    Math.round(qty * price * 100) -
      Math.round(Number.parseFloat(line.lineDiscount ?? "0") * 100 || 0),
  );
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
    revenueCents: agg.revenueCents,
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
