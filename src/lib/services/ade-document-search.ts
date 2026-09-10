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
 * Ampiezza massima di **una singola query** all'archivio AdE, in giorni.
 *
 * È un vincolo del portale, non una nostra scelta: oltre questa finestra la
 * ricerca non è accettata. È il motivo per cui un periodo più lungo si spezza
 * in più query (`buildAdeSearchRanges`) invece di essere rifiutato — il tetto
 * su quanto l'esercente può chiedere è un'altra cosa, e sta in
 * `ADE_SEARCH_MAX_DAYS`.
 */
export const ADE_QUERY_MAX_DAYS = 31;

/**
 * Quanti documenti chiedere per pagina.
 *
 * Il portale nelle catture reali usa `perPage=10` (`ricerca.har`): non sappiamo
 * se accetti valori alti o li ricapi in silenzio. Non serve saperlo per la
 * **correttezza** — il ciclo qui sotto avanza contando gli elementi davvero
 * ricevuti, mai quelli richiesti — ma cambia parecchio la **durata**: se il
 * portale ricapa a 10, ogni mese denso costa decine di round-trip. È l'unica
 * manopola da girare quando lo sapremo.
 */
const ADE_SEARCH_PAGE_SIZE = 100;

/**
 * Tetto sui documenti raccolti in una ricerca, sommando tutte le query.
 * Oltre, la risposta si dichiara troncata.
 */
export const MAX_ADE_SEARCH_DOCUMENTS = 5000;

/** Guardia anti-loop su una singola query, indipendente dal tetto sopra. */
const MAX_ADE_SEARCH_PAGES = 50;

/**
 * Quanto può durare in tutto la lettura dell'archivio, in millisecondi.
 *
 * Un anno spezzato in dodici query, ognuna con la sua paginazione, può
 * superare il tempo che una richiesta HTTP ha a disposizione prima che il
 * proxy davanti all'app la chiuda — e una risposta troncata dal proxy arriva
 * all'esercente come un errore senza spiegazione. Meglio fermarsi da soli
 * e dire cosa manca: le query girano dalla più recente alla più vecchia,
 * quindi ciò che si perde è sempre la coda più remota del periodo.
 */
const ADE_SEARCH_DEADLINE_MS = 45_000;

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

/** Una finestra di query AdE, gia' nel formato dei suoi query param. */
export type AdeSearchRange = {
  readonly dataDal: string;
  readonly dataInvioAl: string;
};

/** Primo giorno del mese di `iso`, come giorno ISO. */
function startOfMonth(iso: string): string {
  const m = ISO_DAY.exec(iso);
  return m ? `${m[1]}-${m[2]}-01` : iso;
}

/** Il giorno prima di `iso`. */
function previousDay(iso: string): string {
  const m = ISO_DAY.exec(iso);
  if (!m) return iso;
  const d = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1),
  );
  return d.toISOString().slice(0, 10);
}

/**
 * Spezza il periodo scelto nello storico nelle finestre di query che l'AdE
 * accetta, o spiega perche' non si puo'.
 *
 * **Perche' a mesi solari.** Il portale rifiuta una finestra piu' larga di
 * `ADE_QUERY_MAX_DAYS`, e un mese solare non la supera mai: il vincolo non si
 * puo' violare per costruzione, senza aritmetica su finestre mobili da tenere
 * allineata. I chunk sono anche i confini che l'esercente ha in testa, il che
 * rende leggibile un risultato parziale ("ho letto da agosto in poi").
 *
 * **Ordine: dal piu' recente al piu' vecchio.** Quando la lettura si ferma per
 * il deadline, cio' che manca e' la coda piu' remota del periodo — la parte
 * che serve meno. Con l'ordine opposto un timeout lascerebbe fuori proprio i
 * documenti di ieri.
 *
 * Il periodo e' **obbligatorio**: senza estremi si scaricherebbe l'archivio
 * intero.
 */
export function buildAdeSearchRanges(
  dateFrom: string | undefined,
  dateTo: string | undefined,
): { ranges: AdeSearchRange[] } | { error: string } {
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

  const ranges: AdeSearchRange[] = [];
  let chunkEnd = dateTo;
  while (chunkEnd >= dateFrom) {
    // Il chunk parte dal primo del mese, salvo l'ultimo giro che si ferma
    // all'inizio del periodo richiesto.
    const monthStart = startOfMonth(chunkEnd);
    const chunkStart = monthStart > dateFrom ? monthStart : dateFrom;

    const dataDal = toAdeQueryDay(chunkStart);
    const dataInvioAl = toAdeQueryDay(chunkEnd);
    if (!dataDal || !dataInvioAl) return { error: "Filtro data non valido." };
    ranges.push({ dataDal, dataInvioAl });

    if (chunkStart <= dateFrom) break;
    chunkEnd = previousDay(chunkStart);
  }

  return { ranges };
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
 * Legge le vendite dall'archivio AdE su tutte le finestre richieste e le
 * traduce in righe.
 *
 * **Perche' l'intero periodo e non la pagina che serve.** Il nostro elenco
 * impagina con `LIMIT/OFFSET` su Postgres, AdE con `page`/`perPage` sul suo
 * `totalCount`: due sorgenti ordinate con offset indipendenti non si fondono a
 * livello di query, e una pagina chiesta a meta' di ognuna darebbe righe
 * saltate. L'unico merge corretto e' in memoria sulle due liste intere — ed e'
 * cio' che rende necessari il tetto sul periodo, quello sui documenti e il
 * deadline.
 *
 * **Le finestre girano in sequenza, non in parallelo.** Condividono una sola
 * sessione AdE, e dodici richieste concorrenti a nome dell'esercente sono il
 * modo di fargli bloccare l'utenza sul portale.
 *
 * Dentro ogni finestra il ciclo avanza sugli elementi ricevuti, mai su quelli
 * richiesti: una pagina vuota, un `totalCount` che mente o un `perPage`
 * ricapato dal portale lo fermano comunque.
 */
export async function fetchAdeSaleRows(
  client: Pick<AdeClient, "searchDocuments">,
  ranges: readonly AdeSearchRange[],
  options: { now?: () => number } = {},
): Promise<AdeSaleRowsResult> {
  const now = options.now ?? Date.now;
  const deadline = now() + ADE_SEARCH_DEADLINE_MS;

  const collected: AdeDocumentSummary[] = [];
  let truncated = false;

  outer: for (const range of ranges) {
    // Il controllo sta all'inizio del giro: fermarsi PRIMA di una query che
    // non farebbe in tempo e' l'unico modo di restituire qualcosa.
    if (now() >= deadline) {
      truncated = true;
      break;
    }

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

      // Pagina vuota: la finestra e' esaurita, qualunque cosa dica
      // `totalCount`.
      if (batch.length === 0) break;

      if (collected.length >= MAX_ADE_SEARCH_DOCUMENTS) {
        truncated = true;
        break outer;
      }
      if (collected.length >= list.totalCount) break;
      if (now() >= deadline) {
        truncated = true;
        break outer;
      }

      // Ultima iterazione consentita e la finestra non e' esaurita.
      if (page === MAX_ADE_SEARCH_PAGES) truncated = true;
    }
  }

  const rows: AdeReceiptListItem[] = [];
  for (const doc of collected) {
    const row = toAdeReceiptListItem(doc);
    if (row) rows.push(row);
  }

  return { rows, truncated };
}
