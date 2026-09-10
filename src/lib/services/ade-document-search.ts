/**
 * Ricerca dei documenti commerciali sull'archivio AdE, per lo storico Pro
 * (v1.8.0).
 *
 * **Cosa c'è in quell'archivio.** `GET /doc/documenti/` è l'archivio del
 * servizio *Documento Commerciale Online*: contiene i documenti emessi
 * attraverso quel servizio — portale web AdE, app AdE, e qualunque software
 * che lo piloti, ScontrinoZero compreso. NON contiene i corrispettivi
 * trasmessi da un registratore telematico. La feature va raccontata così.
 *
 * **Perché questo modulo non conosce il database.** Fa due cose — impaginare
 * la chiamata AdE e tradurre i risultati in righe — e nessuna delle due ha
 * bisogno di Postgres. La deduplica contro i nostri documenti resta al
 * chiamante, che una connessione ce l'ha già; qui dentro entrerebbe solo per
 * costringere ogni test a mockare Drizzle.
 */
import type { AdeClient } from "@/lib/ade/client";
import type { AdeDocumentList, AdeDocumentSummary } from "@/lib/ade/types";
import { ADE_SEARCH_MAX_DAYS, type AdeReceiptListItem } from "@/types/storico";
import { parseAdeResultDate } from "./ade-recovery";

/**
 * Quanti documenti chiedere per pagina.
 *
 * Il portale nelle catture reali usa `perPage=10` (`ricerca.har`): non sappiamo
 * se accetti valori alti o li ricapi in silenzio. Non serve saperlo — il ciclo
 * qui sotto avanza contando gli elementi **davvero ricevuti**, mai quelli
 * richiesti. Se AdE ricapa, paghiamo più round-trip e nient'altro.
 */
const ADE_SEARCH_PAGE_SIZE = 100;

/** Tetto sui documenti raccolti: oltre, la risposta si dichiara troncata. */
export const MAX_ADE_SEARCH_DOCUMENTS = 1000;

/** Guardia anti-loop, indipendente dal tetto sui documenti. */
const MAX_ADE_SEARCH_PAGES = 50;

export type AdeSaleRowsResult = {
  readonly rows: AdeReceiptListItem[];
  /**
   * `true` quando l'archivio AdE aveva più documenti di quanti ne abbiamo
   * raccolti. Va detto a schermo: un elenco tagliato in silenzio è peggio di
   * un elenco assente, perché sembra completo.
   */
  readonly truncated: boolean;
};

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Converte un giorno ISO (`yyyy-MM-dd`) nel formato dei query param AdE
 * (`MM/DD/YYYY`).
 *
 * ⚠️ L'asimmetria è reale e documentata (`AdeDocumentSummary`): la query vuole
 * MM/DD/YYYY, la risposta torna DD/MM/YYYY HH:MM:SS. Qui si trasformano
 * stringhe di calendario, mai istanti: `dataDal`/`dataInvioAl` sono giorni del
 * calendario italiano e passare da `Date` introdurrebbe un fuso da riallineare
 * per poi buttarlo via.
 */
export function toAdeQueryDay(isoDay: string): string | null {
  const m = ISO_DAY.exec(isoDay);
  if (!m) return null;
  const [, year, month, day] = m;
  return `${month}/${day}/${year}`;
}

/** Giorni inclusivi fra due date ISO, o `null` se una delle due è malformata. */
export function inclusiveDaySpan(from: string, to: string): number | null {
  const a = ISO_DAY.exec(from);
  const b = ISO_DAY.exec(to);
  if (!a || !b) return null;
  const start = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const end = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.floor((end - start) / 86_400_000) + 1;
}

/**
 * Traduce il periodo scelto nello storico nella finestra di query AdE, o
 * spiega perché non si può.
 *
 * Sta qui e non fra le validazioni della server action perché è la stessa
 * conoscenza: come si passa dal nostro filtro alla query del portale, tetto
 * compreso. Il periodo è **obbligatorio** — una ricerca AdE senza estremi
 * scaricherebbe l'archivio intero.
 */
export function buildAdeSearchRange(
  dateFrom: string | undefined,
  dateTo: string | undefined,
): { dataDal: string; dataInvioAl: string } | { error: string } {
  if (!dateFrom || !dateTo) {
    return {
      error:
        "Per cercare anche sull'Agenzia delle Entrate serve un periodo con data di inizio e di fine.",
    };
  }
  const span = inclusiveDaySpan(dateFrom, dateTo);
  if (span === null) return { error: "Filtro data non valido." };
  if (span <= 0) {
    return {
      error: "La data di inizio non può essere successiva alla data di fine.",
    };
  }
  if (span > ADE_SEARCH_MAX_DAYS) {
    return {
      error: `La ricerca sull'Agenzia delle Entrate copre al massimo ${ADE_SEARCH_MAX_DAYS} giorni per volta. Restringi il periodo.`,
    };
  }
  const dataDal = toAdeQueryDay(dateFrom);
  const dataInvioAl = toAdeQueryDay(dateTo);
  if (!dataDal || !dataInvioAl) return { error: "Filtro data non valido." };
  return { dataDal, dataInvioAl };
}

/**
 * Traduce un risultato della ricerca AdE in una riga dello storico.
 *
 * Ritorna `null` per ciò che non sappiamo collocare: le righe che non sono
 * vendite (chiediamo `tipoOperazione: "V"`, ma la difesa costa una riga) e
 * quelle con un `data` illeggibile, che non potremmo né ordinare né filtrare.
 *
 * `annulli` è polisemico (`HAR.md` #16c): su una riga `V` vale la stringa
 * fissa `"A"` ed è un **flag** "documento annullato"; su una riga `A` è invece
 * il progressivo dell'annullato. Leggerlo come progressivo qui scriverebbe
 * `"A"` dove ci si aspetta un numero documento — ed è anche il motivo per cui
 * ci basta interrogare le sole vendite: lo stato è già su di loro.
 */
export function toAdeReceiptListItem(
  doc: AdeDocumentSummary,
): AdeReceiptListItem | null {
  if (doc.tipoOperazione !== "V") return null;
  const adeRegisteredAt = parseAdeResultDate(doc.data);
  if (!adeRegisteredAt) return null;

  // `ammontareComplessivo` arriva come number JSON (es. 1.7): in centesimi
  // interi subito, prima di qualunque somma o confronto (regola 17).
  const totalCents = Math.round(doc.ammontareComplessivo * 100);

  return {
    origin: "ade",
    idtrx: doc.idtrx,
    adeProgressive: doc.numeroProgressivo,
    adeRegisteredAt,
    status: doc.annulli === "A" ? "VOID_ACCEPTED" : "ACCEPTED",
    total: (totalCents / 100).toFixed(2),
  };
}

/**
 * Scarica l'intera finestra di vendite da AdE e la traduce in righe.
 *
 * **Perché tutta la finestra e non la pagina che serve.** Il nostro elenco
 * impagina con `LIMIT/OFFSET` su Postgres, AdE con `page`/`perPage` sul suo
 * `totalCount`: due sorgenti ordinate con offset indipendenti non si fondono a
 * livello di query, e un `OFFSET` chiesto a metà di ognuna darebbe una pagina
 * che salta righe. L'unico merge corretto è in memoria su entrambe le liste
 * intere — ed è esattamente ciò che rende necessario `MAX_ADE_SEARCH_DAYS`.
 *
 * Il ciclo avanza sugli elementi ricevuti, mai su quelli richiesti: una pagina
 * vuota, un `totalCount` che mente o un `perPage` ricapato dal portale lo
 * fermano comunque.
 */
export async function fetchAdeSaleRows(
  client: Pick<AdeClient, "searchDocuments">,
  range: { dataDal: string; dataInvioAl: string },
): Promise<AdeSaleRowsResult> {
  const collected: AdeDocumentSummary[] = [];
  let truncated = false;

  for (let page = 1; page <= MAX_ADE_SEARCH_PAGES; page++) {
    const list: AdeDocumentList = await client.searchDocuments({
      dataDal: range.dataDal,
      dataInvioAl: range.dataInvioAl,
      tipoOperazione: "V",
      page,
      perPage: ADE_SEARCH_PAGE_SIZE,
    });

    const batch = list.elencoRisultati ?? [];
    collected.push(...batch);

    // Pagina vuota: l'archivio è finito, qualunque cosa dica `totalCount`.
    if (batch.length === 0) break;

    if (collected.length >= MAX_ADE_SEARCH_DOCUMENTS) {
      truncated = collected.length < list.totalCount;
      break;
    }
    if (collected.length >= list.totalCount) break;

    // Ultima iterazione consentita e l'archivio non è esaurito.
    if (page === MAX_ADE_SEARCH_PAGES) truncated = true;
  }

  const rows: AdeReceiptListItem[] = [];
  for (const doc of collected) {
    const row = toAdeReceiptListItem(doc);
    if (row) rows.push(row);
  }

  return { rows, truncated };
}
