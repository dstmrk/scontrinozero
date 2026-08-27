import { sql } from "drizzle-orm";

import { type DrizzleTx, withStatementTimeout } from "@/lib/db-timeout";
import { type AnalyticsRange, rangeToBounds } from "./analytics-helpers";

/**
 * Primitive condivise dalle letture del pannello operatore
 * (`admin-metrics.ts`, `admin-directory.ts`).
 *
 * Stanno insieme perché sono lo stesso contratto verso Postgres: come si
 * leggono i risultati grezzi di postgres-js e come si somma il denaro. Averle
 * duplicate nei due moduli significherebbe che un incasso calcolato bene nelle
 * card e male nelle classifiche esercenti — o viceversa — è un refuso invisibile.
 */

/**
 * Budget di latenza per singola lettura del pannello.
 *
 * Più largo dei 5s dell'analytics esercente (`ANALYTICS_QUERY_TIMEOUT_MS`)
 * perché qui non c'è un filtro per tenant: si scandiscono le tabelle intere.
 * Ma un budget ci vuole: senza, una scansione degenere terrebbe occupata una
 * connessione del pool da 10 che serve gli scontrini di tutti — un pannello
 * interno non deve mai poter rallentare la cassa. Oltre la soglia Postgres
 * aborta (57014), la connessione torna al pool e il blocco che dipendeva da
 * quella query mostra il suo avviso — gli altri cinque restano.
 */
export const ADMIN_QUERY_TIMEOUT_MS = 10_000;

/**
 * Totale di UNA riga di scontrino in centesimi interi, al netto dello sconto —
 * gemello SQL di `lineTotalCents` in `src/lib/receipts/receipt-totals.ts`.
 *
 * Assume che le righe siano aliasate `l` nella query chiamante.
 *
 * `round()` di Postgres su `numeric` è esatto e arrotonda half away from zero;
 * su importi non negativi coincide con `Math.round` di JS, che invece parte da
 * un float64. Dove differiscono, è Postgres ad avere ragione.
 *
 * Il `greatest(0, …)` replica il `Math.max(0, …)` dell'originale: uno sconto
 * scritto a mano in DB oltre il lordo di riga non deve produrre un incasso
 * negativo.
 *
 * ⚠️ Nessun test può confrontare questa formula con quella JS — una gira nel
 * database, l'altra nel processo. Si modificano insieme (skill
 * `money-rounding`, voce sul gemello SQL).
 */
export const lineCentsSql = sql`greatest(
  0,
  round(l.quantity * l.gross_unit_price * 100) - round(l.line_discount * 100)
)`;

/**
 * Estremi del range come parametri già castati, più i `Date` che servono a
 * costruire l'asse delle sparkline.
 *
 * Le date sono legate come ISO string con cast esplicito: un oggetto `Date`
 * passato a un template sql`` viene serializzato dal driver in una forma che
 * Postgres non riconosce come timestamptz — è la regressione che fece
 * crollare "Verifica connessione" (skill db-migrations).
 *
 * Sta qui e non nei due moduli di lettura perché entrambi ne hanno bisogno e
 * due copie del cast sono due modi di sbagliarlo separatamente.
 */
export function adminRangeParams(range: AnalyticsRange, reference: Date) {
  const { from, to } = rangeToBounds(range, reference);
  return {
    from,
    to,
    rangeStart: sql`${from.toISOString()}::timestamptz`,
    rangeEnd: sql`${to.toISOString()}::timestamptz`,
  };
}

export type RawRow = Record<string, unknown>;

/**
 * `count(*)` e `sum(…)::bigint` arrivano da postgres-js come **stringhe** (un
 * bigint non entra in un Number in sicurezza). Un `as number` diretto darebbe
 * `"120"` in pagina, o `NaN` appena qualcuno ci fa un'addizione.
 */
export function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * `json_agg` torna già come array da postgres-js, ma un pooler o un driver
 * diverso può consegnarlo come testo: il pannello degrada a elenco vuoto invece
 * di far esplodere il render (regola 19).
 */
export function toRows(value: unknown): RawRow[] {
  if (Array.isArray(value)) return value as RawRow[];
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as RawRow[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Testo di una colonna che può essere NULL, senza propagare `undefined`. */
export function toNullableText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Testo di una colonna NOT NULL; stringa vuota se il driver sorprende. */
export function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Quante letture del pannello possono tenere una connessione del pool
 * CONTEMPORANEAMENTE. **Una.**
 *
 * Il pannello è composto da sei letture indipendenti che React monta in
 * altrettanti boundary Suspense: senza tetto partirebbero tutte insieme e
 * admin occuperebbe 6 delle 10 connessioni di `src/db/index.ts` — proprio
 * mentre nessuna delle sue query può usare un indice (sono tutti prefissati
 * `business_id`, che qui non si filtra mai) e quindi ognuna scandisce tabelle
 * intere. Un pannello interno aperto da una persona sola non deve poter
 * rallentare la cassa di tutti gli altri.
 *
 * Il costo è che le sei letture si accodano invece di parallelizzare: il tempo
 * totale resta la somma, com'era prima di questo lavoro. Quello che cambia è
 * che ogni blocco compare appena la SUA query è pronta, invece di aspettare
 * l'ultima. Il tetto compra prevedibilità sul pool, non latenza.
 *
 * Alzarlo è il rimedio se un giorno il pannello risultasse troppo lento: è
 * l'unica manopola, e va girata guardando la saturazione del pool.
 */
export const ADMIN_MAX_CONCURRENT_READS = 1;

/** Posti occupati adesso; non supera mai `ADMIN_MAX_CONCURRENT_READS`. */
let activeReads = 0;

/** Letture in attesa di un posto, in ordine di arrivo. */
const waitingReads: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeReads < ADMIN_MAX_CONCURRENT_READS) {
    activeReads++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waitingReads.push(resolve);
  });
}

function releaseSlot(): void {
  const next = waitingReads.shift();
  // Il posto passa di mano SENZA tornare libero. Decrementare qui e lasciare
  // che il prossimo se lo riprenda aprirebbe una finestra fra i due
  // microtask in cui una lettura appena arrivata scavalca chi è in coda — e
  // con un solo posto quella finestra basta a far attendere il primo blocco
  // della pagina dietro l'ultimo.
  if (next) {
    next();
    return;
  }
  activeReads--;
}

/**
 * Esegue UNA query di lettura del pannello dentro il budget di timeout, dopo
 * aver ottenuto l'unico posto disponibile (`ADMIN_MAX_CONCURRENT_READS`).
 *
 * Il contatore è di modulo, quindi il tetto vale per l'intera istanza server e
 * non per la singola richiesta: due operatori collegati insieme condividono lo
 * stesso posto, invece di raddoppiare la pressione sul pool.
 *
 * Il rilascio è in `finally`: una query che lancia — timeout Postgres incluso
 * — non deve poter lasciare il pannello bloccato per sempre.
 */
export async function runAdminRead<T>(
  fn: (tx: DrizzleTx) => Promise<T>,
): Promise<T> {
  await acquireSlot();
  try {
    return await withStatementTimeout(ADMIN_QUERY_TIMEOUT_MS, fn);
  } finally {
    releaseSlot();
  }
}
