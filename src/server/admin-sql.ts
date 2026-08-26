import { sql } from "drizzle-orm";

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
 * Budget di latenza per transazione di lettura del pannello.
 *
 * Più largo dei 5s dell'analytics esercente (`ANALYTICS_QUERY_TIMEOUT_MS`)
 * perché qui non c'è un filtro per tenant: si scandiscono le tabelle intere.
 * Ma un budget ci vuole: senza, una scansione degenere terrebbe occupata una
 * connessione del pool da 10 che serve gli scontrini di tutti — un pannello
 * interno non deve mai poter rallentare la cassa. Oltre la soglia Postgres
 * aborta (57014), la connessione torna al pool e la pagina mostra l'avviso.
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
