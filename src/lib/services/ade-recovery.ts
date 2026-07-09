import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocuments } from "@/db/schema";
import { logger } from "@/lib/logger";
import type { AdeDocumentSummary } from "@/lib/ade/types";

/**
 * Marca un documento `ERROR` best-effort dopo un fallimento in cui sappiamo che
 * AdE **non** ha registrato il documento (es. 401 reauth CIE in-flight): la riga
 * esce dallo stato PENDING così non resta un ghost perpetuo nello storico
 * (REVIEW.md #48). Da NON usare sui transient (esito ignoto → la riga deve
 * restare PENDING per la stale-recovery).
 *
 * L'errore dell'UPDATE è swallowed (solo `logger.warn`): è già un percorso di
 * degrado e non deve propagare. Condiviso fra receipt-service e void-service
 * per evitare drift e non gonfiare la cognitive complexity dei due catch (S3776).
 */
export async function markDocumentErrorBestEffort(
  documentId: string,
  warnContext: Record<string, unknown>,
  warnMessage: string,
): Promise<void> {
  try {
    await getDb()
      .update(commercialDocuments)
      .set({ status: "ERROR" })
      .where(eq(commercialDocuments.id, documentId));
  } catch (updateErr) {
    logger.warn({ ...warnContext, err: updateErr }, warnMessage);
  }
}

/**
 * Soglia oltre la quale un documento commerciale PENDING/ERROR è
 * considerato "stale" e può entrare nel recovery path (re-submit ad AdE).
 *
 * Default: 30 min. Override via env `STALE_PENDING_THRESHOLD_MINUTES`
 * (utile per i test di integrazione che non vogliono aspettare 30 min).
 *
 * Condiviso fra receipt-service e void-service per evitare drift: la
 * soglia governa lo stesso trade-off (collision window vs UX di retry) in
 * entrambi i flussi. Un drift potrebbe lasciare la sale recovery più
 * aggressiva del void recovery (o viceversa) per errore di copia.
 *
 * NB: il lookup AdE pre-retry via `searchDocuments` (vedi `ricerca.har` e
 * `reconcileSaleDocument`/`reconcileVoidDocument` sotto) riconcilia il
 * documento con AdE prima di ri-sottometterlo, chiudendo la collision window
 * sull'irreversibile (duplicato fiscale). Questa soglia resta come gate di
 * freschezza: gira solo quando un PENDING/ERROR è abbastanza vecchio da non
 * essere plausibilmente ancora in volo.
 */
export function getStalePendingThresholdMs(): number {
  const raw = process.env.STALE_PENDING_THRESHOLD_MINUTES;
  const minutes = raw ? Number.parseFloat(raw) : Number.NaN;
  const effective = Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
  return effective * 60 * 1000;
}

/**
 * Tenta di "rivendicare" (claim) un documento stale PENDING/ERROR prima di
 * rieseguire la submit ad AdE, per serializzare due retry concorrenti oltre la
 * soglia stale (P1.3).
 *
 * CAS ottimistico su `updated_at`: l'UPDATE matcha solo se `updated_at` coincide
 * ancora con lo snapshot osservato e lo stato è PENDING/ERROR, bumpando
 * `updated_at`. Il primo retry vince (ritorna `true`); ogni retry concorrente
 * con lo stesso snapshot matcha 0 righe (ritorna `false`) e deve rispondere
 * in-progress invece di ri-sottomettere (che creerebbe un documento fiscale
 * duplicato su AdE, irreversibile).
 *
 * Pool-safe: nessun lock DB tenuto durante la HTTP AdE (2-5s), a differenza di
 * `pg_advisory_xact_lock` / `SELECT ... FOR UPDATE`.
 *
 * NB: lo snapshot è confrontato come ISO string + `::timestamptz` con
 * `date_trunc('milliseconds', ...)`: dentro un raw `sql` template Drizzle non
 * ha il column-type context per bindare una JS Date (crash `Buffer.byteLength`
 * in postgres-js) e il default `NOW()` ha precisione al microsecondo mentre la
 * JS Date è al millisecondo (stesso pattern di `verifyAdeCredentials`).
 */
export async function claimStaleDocument(
  db: ReturnType<typeof getDb>,
  documentId: string,
  observedUpdatedAt: Date,
): Promise<boolean> {
  const claimed = await db
    .update(commercialDocuments)
    .set({ updatedAt: new Date() })
    .where(
      and(
        eq(commercialDocuments.id, documentId),
        inArray(commercialDocuments.status, ["PENDING", "ERROR"]),
        sql`date_trunc('milliseconds', ${commercialDocuments.updatedAt}) = ${observedUpdatedAt.toISOString()}::timestamptz`,
      ),
    )
    .returning({ id: commercialDocuments.id });
  return claimed.length === 1;
}

// ---------------------------------------------------------------------------
// Lookup AdE pre-retry: riconciliazione del documento PENDING con la fonte di
// verità (AdE) prima di ri-sottometterlo, per evitare un duplicato fiscale
// irreversibile quando AdE aveva già accettato ma la response si era persa
// (REVIEW.md #4, HAR: ricerca.har).
// ---------------------------------------------------------------------------

/** Fuso orario del portale AdE: i `data` di risposta sono wall-clock italiani. */
const ADE_TZ = "Europe/Rome";

/**
 * Finestra di prossimità temporale (ms) entro cui un documento AdE è
 * considerato lo stesso del nostro PENDING. Il match primario è sull'importo
 * esatto in cents; la finestra è un tiebreaker per ridurre i falsi positivi
 * quando lo stesso importo ricorre più volte nello stesso giorno.
 */
const RECONCILE_PROXIMITY_MS = 10 * 60 * 1000;

export type AdeReconcileResult =
  | { kind: "match"; idtrx: string; numeroProgressivo: string }
  | { kind: "none" }
  | { kind: "ambiguous" };

/**
 * Offset (wall-clock − UTC, in ms) del fuso `timeZone` per un dato istante.
 * Usato per convertire fra istante UTC e ora locale italiana senza dipendenze.
 */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0; // Intl può emettere "24" a mezzanotte
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return asUtc - date.getTime();
}

/** Pad a 2 cifre. */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Formatta un istante UTC come data query AdE (MM/DD/YYYY) in ora italiana.
 * ⚠️ I query param `dataDal`/`dataInvioAl` usano MM/DD/YYYY, mentre il `data`
 * di risposta è DD/MM/YYYY HH:MM:SS (asimmetria reale — vedi AdeDocumentSummary).
 */
export function formatAdeQueryDate(date: Date): string {
  // Sposta l'istante nel "wall-clock" italiano, poi leggi i componenti in UTC.
  const local = new Date(date.getTime() + tzOffsetMs(date, ADE_TZ));
  return `${pad2(local.getUTCMonth() + 1)}/${pad2(local.getUTCDate())}/${local.getUTCFullYear()}`;
}

/**
 * Parsea il `data` di un risultato AdE ("DD/MM/YYYY HH:MM:SS", ora italiana)
 * nell'istante UTC corrispondente. Ritorna `null` se il formato non combacia.
 */
export function parseAdeResultDate(value: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(
    value.trim(),
  );
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m.map(Number);
  // Interpreta i componenti come UTC, poi sottrai l'offset italiano per
  // ottenere l'istante reale (trucco standard wall-clock → instant).
  const guess = Date.UTC(yyyy, mm - 1, dd, hh, mi, ss);
  const offset = tzOffsetMs(new Date(guess), ADE_TZ);
  return new Date(guess - offset);
}

/**
 * Finestra date [createdAt−1g, createdAt+1g] in MM/DD/YYYY (ora italiana) per
 * la query `searchDocuments`. ±1 giorno copre il boundary UTC↔Rome (un PENDING
 * creato a cavallo di mezzanotte UTC cade in due date italiane diverse).
 */
export function buildAdeSearchWindow(createdAt: Date): {
  dataDal: string;
  dataInvioAl: string;
} {
  const day = 24 * 60 * 60 * 1000;
  return {
    dataDal: formatAdeQueryDate(new Date(createdAt.getTime() - day)),
    dataInvioAl: formatAdeQueryDate(new Date(createdAt.getTime() + day)),
  };
}

/**
 * Importo del summary AdE (euro number) confrontato in cents.
 *
 * Match primario: `expectedCents` = totale canonico per-riga
 * (round(price*qty*100) sommato). `legacyFloatCents` è un secondo comparatore
 * per i documenti emessi PRIMA di REVIEW.md #57: il vecchio mapper trasmetteva
 * `ammontareComplessivo` come somma float dei lordi (8 decimali), che su
 * quantità frazionarie diverge di 1 cent dal canonico. Accettarlo evita che la
 * recovery ri-sottometta un documento che AdE aveva già registrato col totale
 * legacy → duplicato fiscale irreversibile. Si passa solo quando differisce dal
 * canonico (nessun allargamento del match nel caso normale, quantità intere).
 */
function matchesAmount(
  doc: AdeDocumentSummary,
  expectedCents: number,
  legacyFloatCents?: number,
): boolean {
  const docCents = Math.round(doc.ammontareComplessivo * 100);
  return (
    docCents === expectedCents ||
    (legacyFloatCents !== undefined && docCents === legacyFloatCents)
  );
}

/** Prossimità temporale fra il `data` del summary e il nostro createdAt. */
function withinProximity(doc: AdeDocumentSummary, createdAt: Date): boolean {
  const parsed = parseAdeResultDate(doc.data);
  if (!parsed) return false;
  return (
    Math.abs(parsed.getTime() - createdAt.getTime()) <= RECONCILE_PROXIMITY_MS
  );
}

/**
 * Fra gli `idtrx` passati, ritorna quelli già collegati come `adeTransactionId`
 * a un ALTRO documento dello stesso business (id ≠ `excludeDocumentId`).
 *
 * Disambigua il lookup pre-retry: un documento AdE il cui idtrx è già
 * rivendicato da un'altra riga è una vendita/annullo diverso e già
 * contabilizzato → NON è il nostro orfano e va escluso dai candidati. Chiude
 * due buchi: (1) l'`ambiguous` su vendite identiche quando la "gemella" è già
 * andata a buon fine; (2) il falso `match` quando l'unico candidato appartiene
 * in realtà a una vendita diversa già registrata (il nostro submit era stato
 * rifiutato e non aveva creato nulla).
 *
 * `excludeDocumentId` evita di auto-escludersi in un raro TOCTOU (un retry
 * concorrente che avesse già finalizzato la nostra stessa riga).
 */
export async function findClaimedTransactionIds(
  db: ReturnType<typeof getDb>,
  params: { businessId: string; excludeDocumentId: string; idtrxs: string[] },
): Promise<Set<string>> {
  const { businessId, excludeDocumentId, idtrxs } = params;
  if (idtrxs.length === 0) return new Set();
  const rows = await db
    .select({ adeTransactionId: commercialDocuments.adeTransactionId })
    .from(commercialDocuments)
    .where(
      and(
        eq(commercialDocuments.businessId, businessId),
        ne(commercialDocuments.id, excludeDocumentId),
        inArray(commercialDocuments.adeTransactionId, idtrxs),
      ),
    );
  const claimed = new Set<string>();
  for (const row of rows) {
    if (row.adeTransactionId) claimed.add(row.adeTransactionId);
  }
  return claimed;
}

/** Riduce una lista di candidati a un esito match/none/ambiguous. */
function decide(candidates: AdeDocumentSummary[]): AdeReconcileResult {
  if (candidates.length === 0) return { kind: "none" };
  if (candidates.length > 1) return { kind: "ambiguous" };
  const [doc] = candidates;
  return {
    kind: "match",
    idtrx: doc.idtrx,
    numeroProgressivo: doc.numeroProgressivo,
  };
}

/**
 * Riconcilia una VENDITA PENDING con i risultati di `searchDocuments`.
 *
 * Match: `tipoOperazione === "V"` + importo esatto (cents) + prossimità
 * temporale (±10 min) dal createdAt. Quando il codice lotteria è presente,
 * `cfCliente === lotteryCode` è una chiave secondaria che restringe ulteriormente.
 *
 * `claimedIdtrx` esclude i documenti AdE già collegati ad altre righe del DB
 * (vedi `findClaimedTransactionIds`): riduce l'ambiguous e previene i falsi match.
 *
 * 0 candidati → none (procedi col re-submit); 1 → match (finalize-only);
 * >1 → ambiguous (conservativo: non finalizzare, resta PENDING).
 */
export function reconcileSaleDocument(params: {
  documents: AdeDocumentSummary[];
  expectedTotalCents: number;
  createdAt: Date;
  lotteryCode?: string | null;
  claimedIdtrx?: ReadonlySet<string>;
  /**
   * Totale legacy (somma float dei lordi) di un documento emesso prima di
   * REVIEW.md #57. Comparatore di fallback in `matchesAmount`: passarlo solo
   * quando differisce da `expectedTotalCents`.
   */
  expectedLegacyTotalCents?: number;
}): AdeReconcileResult {
  const {
    documents,
    expectedTotalCents,
    createdAt,
    lotteryCode,
    claimedIdtrx,
    expectedLegacyTotalCents,
  } = params;
  const candidates = documents.filter(
    (doc) =>
      doc.tipoOperazione === "V" &&
      !claimedIdtrx?.has(doc.idtrx) &&
      matchesAmount(doc, expectedTotalCents, expectedLegacyTotalCents) &&
      withinProximity(doc, createdAt) &&
      (!lotteryCode || doc.cfCliente === lotteryCode),
  );
  return decide(candidates);
}

/**
 * Riconcilia un ANNULLO PENDING con i risultati di `searchDocuments`.
 *
 * Chiave forte: `tipoOperazione === "A"` + `annulli === saleProgressivo` (il
 * progressivo della vendita annullata, univoco per cedente). Non serve la
 * finestra temporale: l'annullo è legato in modo univoco alla vendita.
 *
 * `claimedIdtrx` esclude gli annulli già collegati ad altre righe del DB (vedi
 * `findClaimedTransactionIds`), per simmetria con la vendita.
 */
export function reconcileVoidDocument(params: {
  documents: AdeDocumentSummary[];
  saleProgressivo: string;
  claimedIdtrx?: ReadonlySet<string>;
}): AdeReconcileResult {
  const { documents, saleProgressivo, claimedIdtrx } = params;
  const candidates = documents.filter(
    (doc) =>
      doc.tipoOperazione === "A" &&
      !claimedIdtrx?.has(doc.idtrx) &&
      doc.annulli === saleProgressivo,
  );
  return decide(candidates);
}
