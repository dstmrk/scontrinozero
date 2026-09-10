/**
 * Verifica manuale di uno scontrino rimasto `PENDING` a esito AdE ignoto
 * (REVIEW.md #103, slice 2).
 *
 * **Perché serve una strada a parte, e non basta il recovery esistente.** La
 * stale-recovery è pull-based: il suo unico ingresso è il ramo `alreadyExists`
 * dell'INSERT, cioè una collisione sul vincolo UNIQUE
 * `(business_id, idempotency_key)`. Senza collisione non c'è claim, non c'è
 * `searchDocuments`, non c'è finalize — e una riga che nessuno ritenta con la
 * *stessa* chiave non viene riconciliata mai.
 *
 * **Perché qui e non in uno sweep di `instrumentation.ts`.** Uno sweep non ha
 * una sessione AdE: dovrebbe decifrare le credenziali fuori da una richiesta
 * utente e fare un login per ogni business con righe orfane. E soprattutto
 * sposterebbe la decisione lontano dall'unica persona che sa se quella vendita
 * è avvenuta davvero. Dentro la sessione dell'esercente le credenziali ci sono
 * già, e c'è anche chi sa rispondere.
 *
 * **Verifica, non ri-sottomissione.** A differenza di `recoverStaleReceipt`,
 * qui un "nessun match" NON porta a un nuovo `submitSale`: porta a `ERROR` e
 * all'invito a riemettere. Ri-sottomettere è irreversibile e la decisione
 * spetta all'esercente, che a quel punto riemette dalla cassa come per una
 * vendita qualunque.
 */
import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocuments } from "@/db/schema";
import { withAdeSession, isCieSessionMissing } from "@/lib/ade";
import { logAdeFailure } from "@/lib/ade/log-failure";
import type { AdeDocumentSummary } from "@/lib/ade/types";
import { logger } from "@/lib/logger";
import {
  calcLineTotalCents,
  fetchLinesByDocIds,
} from "@/lib/receipts/document-lines";
import { fetchAdePrerequisites, toAdeSessionParams } from "@/lib/server-auth";
import {
  buildAdeSearchWindow,
  claimStaleDocument,
  findClaimedTransactionIds,
  isStaleUpdatedAt,
  parseAdeResultDate,
  reconcileSaleDocument,
  staleUpdatedBefore,
} from "./ade-recovery";
import { finalizeSaleOnly } from "./receipt-service";

/** Una vendita in attesa di verifica, per il banner. */
export type PendingSaleSummary = {
  readonly id: string;
  readonly createdAt: string;
  readonly totalCents: number;
};

/** Un documento AdE che il match non sa distinguere dagli altri. */
export type PendingCandidate = {
  readonly idtrx: string;
  readonly numeroProgressivo: string;
  /** Data/ora AdE così com'è, `DD/MM/YYYY HH:MM:SS` in ora italiana. */
  readonly data: string;
  readonly totalCents: number;
};

export type VerifyPendingSaleResult =
  /** AdE aveva registrato: la riga è ora ACCEPTED. */
  | {
      outcome: "accepted";
      documentId: string;
      adeProgressive?: string;
      adeRegisteredAt?: string;
    }
  /** AdE non ha nulla: la riga passa a ERROR, la vendita va riemessa. */
  | { outcome: "not-registered"; documentId: string }
  /** Più documenti AdE compatibili: sceglie l'esercente, mai il codice. */
  | { outcome: "ambiguous"; documentId: string; candidates: PendingCandidate[] }
  /** Un'altra sessione ha il claim, o la riga è ancora fresca. */
  | { outcome: "in-progress" }
  /** Qualcun altro l'ha già chiusa: alla UI basta ricaricare. */
  | { outcome: "settled" }
  | { error: string; reauthRequired?: true };

const IN_PROGRESS: VerifyPendingSaleResult = { outcome: "in-progress" };

const NOT_FOUND_ERROR = "Scontrino non trovato. Ricarica la pagina e riprova.";
/**
 * Il claim ha già bumpato `updated_at`, quindi la riga esce dalla soglia stale
 * e sparisce dall'elenco finché non ci rientra. È voluto — impedisce di
 * martellare AdE durante un disservizio — ma va detto, altrimenti l'esercente
 * cerca un pulsante che per un po' non c'è.
 */
const ADE_UNREACHABLE_ERROR =
  "Agenzia delle Entrate non raggiungibile: non è stato possibile verificare. Lo scontrino resta in sospeso e tornerà nell'elenco da solo: riprova più tardi.";

/**
 * Le vendite `PENDING` di un business ferme oltre la soglia stale.
 *
 * La stessa soglia del gate del recovery (`staleUpdatedBefore`): mostrare una
 * riga che la verifica non può ancora toccare darebbe all'esercente un
 * pulsante che risponde solo "ancora in elaborazione".
 *
 * Degrada a lista vuota su errore DB (regola 19): è un avviso accessorio
 * montato nel layout del dashboard, non deve poter sostituire l'intera app con
 * un error boundary.
 */
export async function listStalePendingSales(
  businessId: string,
): Promise<PendingSaleSummary[]> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: commercialDocuments.id,
        createdAt: commercialDocuments.createdAt,
      })
      .from(commercialDocuments)
      .where(
        and(
          eq(commercialDocuments.businessId, businessId),
          eq(commercialDocuments.kind, "SALE"),
          eq(commercialDocuments.status, "PENDING"),
          lt(commercialDocuments.updatedAt, staleUpdatedBefore()),
        ),
      );
    if (rows.length === 0) return [];

    const lines = await fetchLinesByDocIds(
      rows.map((row) => row.id),
      db,
    );
    const centsByDoc = new Map<string, number>();
    for (const line of lines) {
      centsByDoc.set(
        line.documentId,
        (centsByDoc.get(line.documentId) ?? 0) + calcLineTotalCents(line),
      );
    }

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      totalCents: centsByDoc.get(row.id) ?? 0,
    }));
  } catch (err) {
    logger.warn({ err, businessId }, "Elenco scontrini in sospeso fallito");
    return [];
  }
}

/** Riga letta per la verifica: solo i campi che servono a decidere. */
type PendingRow = {
  id: string;
  status: string;
  adeTransactionId: string | null;
  adeProgressive: string | null;
  lotteryCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

async function loadPendingSale(
  businessId: string,
  documentId: string,
): Promise<PendingRow | null> {
  const [row] = await getDb()
    .select({
      id: commercialDocuments.id,
      status: commercialDocuments.status,
      adeTransactionId: commercialDocuments.adeTransactionId,
      adeProgressive: commercialDocuments.adeProgressive,
      lotteryCode: commercialDocuments.lotteryCode,
      createdAt: commercialDocuments.createdAt,
      updatedAt: commercialDocuments.updatedAt,
    })
    .from(commercialDocuments)
    .where(
      and(
        eq(commercialDocuments.id, documentId),
        // Il filtro per business è la sola autorizzazione di questo modulo: il
        // chiamante ha già verificato che l'utente possieda `businessId`.
        eq(commercialDocuments.businessId, businessId),
        eq(commercialDocuments.kind, "SALE"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Somma canonica per riga in centesimi (regola 17, skill money-rounding). */
async function expectedTotalCents(documentId: string): Promise<number> {
  const lines = await fetchLinesByDocIds([documentId]);
  return lines.reduce((sum, line) => sum + calcLineTotalCents(line), 0);
}

function toCandidate(doc: AdeDocumentSummary): PendingCandidate {
  return {
    idtrx: doc.idtrx,
    numeroProgressivo: doc.numeroProgressivo,
    data: doc.data,
    totalCents: Math.round(doc.ammontareComplessivo * 100),
  };
}

/**
 * Traduce l'esito di `finalizeSaleOnly` — che parla la lingua dell'emissione —
 * nel vocabolario della verifica.
 */
function toVerifyResult(
  documentId: string,
  finalized: Awaited<ReturnType<typeof finalizeSaleOnly>>,
): VerifyPendingSaleResult {
  // `SubmitReceiptResult` ha ogni campo opzionale: il discriminante vero è la
  // presenza di `error`, non la sua chiave.
  if (finalized.error) return { error: finalized.error };
  return {
    outcome: "accepted",
    documentId,
    adeProgressive: finalized.adeProgressive,
    adeRegisteredAt: finalized.adeRegisteredAt,
  };
}

/**
 * Carica la riga e scarta gli stati che non ammettono la verifica.
 * **Nessun effetto collaterale**: qui non si rivendica niente.
 */
async function loadVerifiableSale(
  businessId: string,
  documentId: string,
): Promise<{ row: PendingRow } | { done: VerifyPendingSaleResult }> {
  const row = await loadPendingSale(businessId, documentId);
  if (!row) return { done: { error: NOT_FOUND_ERROR } };

  // Un'altra sessione (o il recovery dell'emit) l'ha già chiusa: alla UI basta
  // ricaricare, non c'è niente da verificare.
  if (row.status !== "PENDING") return { done: { outcome: "settled" } };

  // Fresca: potrebbe essere ancora in volo. Verificare adesso rischierebbe di
  // dichiarare "non registrato" un documento che AdE sta accettando.
  if (!isStaleUpdatedAt(row.updatedAt)) return { done: IN_PROGRESS };

  return { row };
}

/**
 * Risolve la sessione AdE dell'esercente. **Nessun effetto collaterale**:
 * va prima del claim, perché il claim bumpa `updated_at` e una riga bumpata
 * esce dalla soglia stale — sparirebbe dal banner per mezz'ora senza che sia
 * successo niente.
 */
async function resolveAdeSession(
  businessId: string,
): Promise<
  | { params: ReturnType<typeof toAdeSessionParams> }
  | { done: VerifyPendingSaleResult }
> {
  const prerequisites = await fetchAdePrerequisites(businessId);
  if ("error" in prerequisites) return { done: { error: prerequisites.error } };
  if (prerequisites.method === "cie" && isCieSessionMissing(businessId)) {
    return {
      done: {
        error:
          "Sessione CIE scaduta: rifai l'accesso per verificare lo scontrino.",
        reauthRequired: true,
      },
    };
  }
  return { params: toAdeSessionParams(businessId, prerequisites) };
}

/**
 * Interroga AdE per una riga già rivendicata e ritorna i candidati compatibili.
 *
 * Separata dalla decisione perché la usano due strade: la verifica e la
 * conferma di un candidato scelto dall'esercente, che deve ri-cercare invece di
 * fidarsi dell'`idtrx` arrivato dal client.
 */
async function searchAdeCandidates(
  adeClient: Parameters<Parameters<typeof withAdeSession>[1]>[0],
  ctx: { documentId: string; businessId: string; row: PendingRow },
): Promise<
  | { documents: AdeDocumentSummary[]; claimedIdtrx: ReadonlySet<string> }
  | { error: string }
> {
  const { documentId, businessId, row } = ctx;
  try {
    const list = await adeClient.searchDocuments({
      ...buildAdeSearchWindow(row.createdAt),
      tipoOperazione: "V",
    });
    const documents = list.elencoRisultati;
    const claimedIdtrx = await findClaimedTransactionIds(getDb(), {
      businessId,
      excludeDocumentId: documentId,
      idtrxs: documents.map((doc) => doc.idtrx),
    });
    return { documents, claimedIdtrx };
  } catch (err) {
    logAdeFailure(
      err,
      { documentId, businessId, recovery: true, flow: "verify-pending" },
      {
        transient: "Verifica PENDING: searchDocuments fallita (transient)",
        failure: "Verifica PENDING: searchDocuments fallita",
      },
    );
    return { error: ADE_UNREACHABLE_ERROR };
  }
}

/** Contesto che le due strade ricevono per decidere. */
type ReconciledContext = {
  readonly documentId: string;
  readonly businessId: string;
  readonly documents: readonly AdeDocumentSummary[];
  readonly result: ReturnType<typeof reconcileSaleDocument>;
};

/**
 * Ossatura condivisa dalle due strade: gate → sessione → claim →
 * `searchDocuments` → riconciliazione. Il chiamante fornisce solo `decide`,
 * cioè cosa fare dell'esito — ed è lì che le due strade divergono davvero.
 *
 * L'ordine non è arbitrario. Il claim viene **dopo** la risoluzione della
 * sessione e **prima** della chiamata ad AdE: prima, perché bumpare
 * `updated_at` su una riga che poi non tocchiamo la nasconderebbe dal banner
 * per mezz'ora; dopo, perché è il CAS a serializzare due verifiche concorrenti
 * — due schede aperte, o una verifica mentre un retry dell'emit sta girando.
 */
async function reconcileUnderUserSession(
  params: { businessId: string; documentId: string },
  decide: (ctx: ReconciledContext) => Promise<VerifyPendingSaleResult>,
): Promise<VerifyPendingSaleResult> {
  const { businessId, documentId } = params;

  const loaded = await loadVerifiableSale(businessId, documentId);
  if ("done" in loaded) return loaded.done;
  const { row } = loaded;

  // Già trasmesso ad AdE e persistito: manca solo la UPDATE finale, e non c'è
  // niente da cercare né da scegliere. Vale per entrambe le strade.
  if (row.adeTransactionId && row.adeProgressive) {
    if (!(await claimStaleDocument(getDb(), row.id, row.updatedAt))) {
      return IN_PROGRESS;
    }
    return toVerifyResult(
      documentId,
      await finalizeSaleOnly(
        documentId,
        row.adeTransactionId,
        row.adeProgressive,
      ),
    );
  }

  const session = await resolveAdeSession(businessId);
  if ("done" in session) return session.done;

  // Letto prima del claim: è una SELECT, e se fallisse dopo lascerebbe la riga
  // rivendicata — quindi fuori dalla soglia stale — senza aver fatto nulla.
  const expectedCents = await expectedTotalCents(row.id);

  if (!(await claimStaleDocument(getDb(), row.id, row.updatedAt))) {
    return IN_PROGRESS;
  }

  return withAdeSession(session.params, async (adeClient) => {
    const found = await searchAdeCandidates(adeClient, {
      documentId,
      businessId,
      row,
    });
    if ("error" in found) return { error: found.error };

    return decide({
      documentId,
      businessId,
      documents: found.documents,
      result: reconcileSaleDocument({
        documents: found.documents,
        expectedTotalCents: expectedCents,
        createdAt: row.createdAt,
        lotteryCode: row.lotteryCode,
        claimedIdtrx: found.claimedIdtrx,
      }),
    });
  });
}

/**
 * Verifica su AdE una vendita rimasta `PENDING` e chiude la riga.
 *
 * - match singolo → `ACCEPTED` con l'istante autorevole di AdE (REVIEW.md #91);
 * - nessun match → `ERROR`, la vendita va riemessa;
 * - più candidati → li ritorna e non tocca niente: sceglie l'esercente.
 */
export async function verifyPendingSale(params: {
  businessId: string;
  documentId: string;
}): Promise<VerifyPendingSaleResult> {
  return reconcileUnderUserSession(params, async (ctx) => {
    const { documentId, businessId, result } = ctx;

    if (result.kind === "match") {
      logger.info(
        { documentId, businessId, idtrx: result.idtrx },
        "Verifica PENDING: match su AdE → finalize",
      );
      return toVerifyResult(
        documentId,
        await finalizeSaleOnly(
          documentId,
          result.idtrx,
          result.numeroProgressivo,
          result.registeredAt,
        ),
      );
    }

    if (result.kind === "ambiguous") {
      logger.warn(
        { documentId, businessId, candidates: result.candidates.length },
        "Verifica PENDING: candidati multipli → sceglie l'esercente",
      );
      return {
        outcome: "ambiguous",
        documentId,
        candidates: result.candidates.map(toCandidate),
      };
    }

    return markNotRegistered(documentId, businessId);
  });
}

/**
 * Nessun documento compatibile su AdE: il corrispettivo non è mai stato
 * trasmesso. La riga esce da `PENDING` — così smette di comparire nel banner e
 * nel rilevatore — e l'esercente riemette dalla cassa.
 *
 * L'UPDATE è ristretta a `PENDING`: se nel frattempo qualcuno ha finalizzato la
 * riga, non deve poter tornare indietro.
 */
async function markNotRegistered(
  documentId: string,
  businessId: string,
): Promise<VerifyPendingSaleResult> {
  logger.warn(
    { documentId, businessId },
    "Verifica PENDING: nessun documento su AdE → ERROR, da riemettere",
  );
  await getDb()
    .update(commercialDocuments)
    .set({ status: "ERROR" })
    .where(
      and(
        eq(commercialDocuments.id, documentId),
        eq(commercialDocuments.kind, "SALE"),
        eq(commercialDocuments.status, "PENDING"),
      ),
    );
  return { outcome: "not-registered", documentId };
}

/**
 * Finalizza la vendita sul documento AdE che l'esercente ha riconosciuto fra i
 * candidati ambigui.
 *
 * **Ri-cerca invece di fidarsi dell'`idtrx` ricevuto.** Il client potrebbe
 * mandarne uno arbitrario, e finalizzare su un `idtrx` non verificato
 * collegherebbe la nostra riga a un documento fiscale di qualcun altro. La
 * scelta dell'esercente restringe fra i candidati, non li sostituisce.
 */
export async function confirmPendingSaleCandidate(params: {
  businessId: string;
  documentId: string;
  idtrx: string;
}): Promise<VerifyPendingSaleResult> {
  const { idtrx } = params;

  return reconcileUnderUserSession(params, async (ctx) => {
    const { documentId, businessId, documents, result } = ctx;

    // Un solo candidato: l'ambiguità si è risolta da sé fra la verifica e la
    // conferma. Si finalizza quello, purché sia il documento scelto.
    let candidates: readonly AdeDocumentSummary[] = [];
    if (result.kind === "ambiguous") {
      candidates = result.candidates;
    } else if (result.kind === "match") {
      candidates = documents.filter((doc) => doc.idtrx === result.idtrx);
    }

    const chosen = candidates.find((doc) => doc.idtrx === idtrx);
    if (!chosen) {
      logger.warn(
        { documentId, businessId },
        "Conferma PENDING: idtrx non più fra i candidati → nessun finalize",
      );
      return { error: NOT_FOUND_ERROR };
    }

    logger.info(
      { documentId, businessId, idtrx },
      "Conferma PENDING: candidato scelto dall'esercente → finalize",
    );
    return toVerifyResult(
      documentId,
      await finalizeSaleOnly(
        documentId,
        chosen.idtrx,
        chosen.numeroProgressivo,
        parseAdeResultDate(chosen.data),
      ),
    );
  });
}
