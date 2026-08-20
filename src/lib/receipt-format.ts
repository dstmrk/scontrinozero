/**
 * Formattazione condivisa per le viste scontrino (web pubblico, PDF, e
 * future esportazioni). Mantiene una sola sorgente di verità per le label
 * dei metodi di pagamento e per il formatter monetario senza simbolo €
 * (richiesto dai layout fiscali a stretta larghezza).
 */

/**
 * Dicitura della riga "modalità di pagamento" del documento commerciale.
 *
 * Il layout standard AdE la scrive per esteso — `Pagamento contante 160,00`,
 * `Pagamento elettronico 80,00` — perché nel blocco pagamenti convive con
 * altre voci (`Non riscosso`, `Resto`, `Importo pagato`) e la sola parola
 * "Contante" non direbbe di che grandezza si tratta.
 */
export const PAYMENT_LABELS: Record<string, string> = {
  PC: "Pagamento contante",
  PE: "Pagamento elettronico",
};

/**
 * Formatter monetario senza simbolo, istanziato una sola volta a module scope:
 * costruire un `Intl.NumberFormat` è costoso e qui le opzioni sono costanti.
 */
const receiptPriceFormatter = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formatta un importo in formato italiano senza simbolo (es. "12,50").
 * Distinto da `formatCurrency` di `@/lib/utils` che include "€".
 */
export function formatReceiptPrice(amount: number): string {
  return receiptPriceFormatter.format(amount);
}

// Module-scope: costruire un Intl.DateTimeFormat è costoso, le opzioni sono costanti.
const receiptDateFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Formatta la data del documento come `DD-MM-YYYY HH:MM` in ora italiana.
 *
 * `formatToParts` evita i separatori locale-specifici (it-IT userebbe "/") e
 * soprattutto il fuso: in un container UTC `getHours()`/`getDate()` tornano
 * valori UTC, che vicino a mezzanotte e nei cambi d'ora divergono dall'ora
 * legale italiana. Condiviso fra PDF e stampa termica perché le due rese dello
 * stesso documento non devono mai riportare orari diversi.
 */
/**
 * Estrae i componenti della data in ora italiana.
 *
 * `formatToParts` invece di `format`: evita i separatori locale-specifici
 * (it-IT userebbe "/") e soprattutto il fuso — in un container UTC
 * `getHours()`/`getDate()` tornano valori UTC, che vicino a mezzanotte e nei
 * cambi d'ora divergono dall'ora legale italiana.
 */
function receiptDateParts(date: Date): {
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
} {
  const parts = receiptDateFormatter.formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return {
    day: get("day"),
    month: get("month"),
    year: get("year"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

export function formatReceiptDateTime(date: Date): string {
  const p = receiptDateParts(date);
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
}

/**
 * Solo la data, `DD-MM-YYYY` in ora italiana.
 *
 * Serve al blocco "Documento di riferimento" della ricevuta di annullamento,
 * che cita la vendita annullata come `N. <progressivo> del <data>` — senza
 * ora, come il layout AdE. Stessa sorgente di `formatReceiptDateTime`, così
 * le due non possono cadere in giorni diversi sullo stesso documento.
 */
export function formatReceiptDate(date: Date): string {
  const p = receiptDateParts(date);
  return `${p.day}-${p.month}-${p.year}`;
}

/**
 * Lunghezza massima del messaggio di cortesia in coda allo scontrino (Pro).
 *
 * 64 = 2 righe × 32 colonne, la larghezza della termica 58mm
 * (`PAPER_COLUMNS["58"]`), che è la più stretta delle tre superfici di resa:
 * ciò che ci sta lì ci sta anche sul PDF e sulla pagina pubblica. Il cap tiene
 * anche il costo carta limitato, coerente con le "prescrizioni generali per il
 * risparmio carta" dell'AdE che il layout già rispetta altrove.
 */
export const RECEIPT_FOOTER_NOTE_MAX_CHARS = 64;

/** Righe logiche (a capo espliciti) ammesse nel messaggio di cortesia. */
export const RECEIPT_FOOTER_NOTE_MAX_LINES = 2;

/**
 * Caratteri di controllo C0/C1 (tab escluso, gestito a parte, e `\n` che è il
 * separatore di riga). Classe di caratteri semplice: nessun backtracking,
 * quindi nessun rischio ReDoS (S5852).
 */
const CONTROL_CHARS_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/**
 * Forma canonica del messaggio di cortesia, applicata alla **scrittura**: è
 * questo il valore che finisce sul DB, così ciò che è memorizzato è esattamente
 * ciò che verrà stampato.
 *
 * Normalizza CRLF, converte i tab in spazi (sulla termica un tab entra
 * nell'encoder come byte di comando), rimuove i caratteri di controllo, taglia
 * gli spazi ai bordi di ogni riga e scarta le righe vuote. Ritorna `null`
 * quando non resta nulla: sullo scontrino una riga vuota è carta sprecata.
 *
 * NON tronca e NON taglia le righe in eccesso: superare i limiti è un errore
 * da mostrare all'utente (`updateReceiptFooterNote`), non qualcosa da
 * correggere in silenzio perdendo il suo testo.
 */
export function normalizeReceiptFooterNote(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;

  const lines = raw
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replaceAll("\t", " ")
    .replaceAll(CONTROL_CHARS_RE, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.length > 0 ? lines.join("\n") : null;
}

/**
 * Manda a capo `text` a `columns` caratteri, spezzando sulle parole. Una parola
 * più lunga della colonna (un URL, un handle social) viene spezzata a forza:
 * sulla termica sborderebbe davvero dalla carta.
 */
function wrapToColumns(text: string, columns: number): string[] {
  const wrapped: string[] = [];
  let current = "";

  for (const word of text.split(" ")) {
    let remaining = word;

    // Parola più lunga della riga: si consuma a blocchi pieni finché rientra.
    while (remaining.length > columns) {
      if (current.length > 0) {
        wrapped.push(current);
        current = "";
      }
      wrapped.push(remaining.slice(0, columns));
      remaining = remaining.slice(columns);
    }

    if (remaining.length === 0) continue;

    const candidate =
      current.length > 0 ? `${current} ${remaining}` : remaining;
    if (candidate.length <= columns) {
      current = candidate;
    } else {
      wrapped.push(current);
      current = remaining;
    }
  }

  if (current.length > 0) wrapped.push(current);
  return wrapped;
}

/**
 * Righe stampabili del messaggio di cortesia, condivise dalle tre rese del
 * documento commerciale (PDF, termica ESC/POS, pagina pubblica `/r`) e
 * dall'anteprima nelle impostazioni — così l'anteprima non può mentire su cosa
 * esce dalla stampante.
 *
 * `columns` va passato solo dove la larghezza è nota e rigida (la termica, e
 * l'anteprima che la imita): PDF e HTML mandano a capo da soli, e pre-spezzare
 * lì produrrebbe a capo nel punto sbagliato.
 *
 * Il taglio a `RECEIPT_FOOTER_NOTE_MAX_LINES` è difensivo: il vincolo vero è a
 * monte (server action + CHECK DB), ma un valore scritto a mano sul DB non deve
 * poter allungare lo scontrino a piacere.
 */
export function receiptFooterNoteLines(
  note: string | null | undefined,
  options: { columns?: number } = {},
): string[] {
  const normalized = normalizeReceiptFooterNote(note);
  if (!normalized) return [];

  const logicalLines = normalized
    .split("\n")
    .slice(0, RECEIPT_FOOTER_NOTE_MAX_LINES);

  const { columns } = options;
  if (!columns || columns <= 0) return logicalLines;

  return logicalLines.flatMap((line) => wrapToColumns(line, columns));
}

/** Campi indirizzo dell'esercente, tutti opzionali a schema. */
export interface BusinessAddressFields {
  readonly address?: string | null;
  readonly city?: string | null;
  readonly province?: string | null;
  readonly zipCode?: string | null;
}

/** `""` per null/undefined/stringhe di soli spazi. */
function trimmed(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/**
 * Righe indirizzo dell'intestazione, nella forma del layout standard AdE:
 * la via su una riga, `Comune(PR), CAP` sulla successiva.
 *
 * Restituisce solo le righe che hanno davvero un contenuto — il business
 * nasce incompleto in onboarding, e una riga vuota su un documento fiscale
 * viola anche le prescrizioni di risparmio carta dell'AdE. La provincia si
 * stampa fra parentesi solo se c'è un comune a cui riferirla: `(MI), 20100`
 * da solo non è un indirizzo.
 */
export function formatBusinessAddressLines(
  fields: BusinessAddressFields,
): string[] {
  const street = trimmed(fields.address);
  const city = trimmed(fields.city);
  const province = trimmed(fields.province);
  const zipCode = trimmed(fields.zipCode);

  const locality = city && province ? `${city}(${province})` : city;
  const localityLine = [locality, zipCode].filter(Boolean).join(", ");

  return [street, localityLine].filter(Boolean);
}
