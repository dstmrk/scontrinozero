/**
 * AdE payload types — internal format for Agenzia delle Entrate
 * Documento Commerciale Online (formato DCW10).
 *
 * Reference: docs/api-spec.md sez. 3-7
 */

// ---------------------------------------------------------------------------
// Codifiche IVA / Natura (sez. 6)
// ---------------------------------------------------------------------------

/** Aliquote IVA ordinarie */
export type AdeVatRate = "4" | "5" | "10" | "22";

/** Nature (operazioni senza IVA) */
export type AdeNature = "N1" | "N2" | "N3" | "N4" | "N5" | "N6";

/** Percentuali compensazione agricoltura */
export type AdeAgricultureRate =
  | "2"
  | "6.4"
  | "7"
  | "7.3"
  | "7.5"
  | "7.65"
  | "7.95"
  | "8.3"
  | "8.5"
  | "8.8"
  | "9.5"
  | "12.3";

/** Tutti i codici aliquota/natura accettati dall'AdE */
export type AdeVatCode = AdeVatRate | AdeNature | AdeAgricultureRate;

// ---------------------------------------------------------------------------
// Tipi pagamento (sez. 5.2)
// ---------------------------------------------------------------------------

/** Codici pagamento AdE */
export type AdePaymentType = "PC" | "PE" | "TR" | "NR_EF" | "NR_PS" | "NR_CS";

// ---------------------------------------------------------------------------
// Tipi operazione (sez. 5.1)
// ---------------------------------------------------------------------------

export type AdeOperationType = "V" | "A" | "AX" | "R" | "RX";

// ---------------------------------------------------------------------------
// Payload AdE — struttura (sez. 3, 4)
// ---------------------------------------------------------------------------

/** Riga contabile nel payload AdE */
export interface AdeElementoContabile {
  idElementoContabile: string;
  resiPregressi: string;
  reso: string;
  quantita: string;
  descrizioneProdotto: string;
  prezzoLordo: string;
  prezzoUnitario: string;
  scontoUnitario: string;
  scontoLordo: string;
  aliquotaIVA: string;
  importoIVA: string;
  imponibile: string;
  imponibileNetto: string;
  totale: string;
  omaggio: "N" | "Y";
}

/** Pagamento nel payload AdE (presente solo in vendita) */
export interface AdePaymentEntry {
  tipo: AdePaymentType;
  importo: string;
  numero?: string;
}

/** Reso/annullo nel payload AdE (sez. 4.1) */
export interface AdeResoAnnullo {
  tipologia: "A" | "R";
  dataOra: string;
  progressivo: string;
}

/** Multi-attivita nel documento */
export interface AdeMultiAttivita {
  codiceAttivita: string;
  descAttivita: string;
}

/** Documento commerciale nel payload AdE */
export interface AdeDocumentoCommerciale {
  cfCessionarioCommittente: string;
  flagDocCommPerRegalo: boolean;
  progressivoCollegato: string;
  dataOra: string;
  multiAttivita: AdeMultiAttivita;
  importoTotaleIva: string;
  scontoTotale: string;
  scontoTotaleLordo: string;
  totaleImponibile: string;
  ammontareComplessivo: string;
  totaleNonRiscosso: string;
  elementiContabili: AdeElementoContabile[];
  vendita?: AdePaymentEntry[];
  resoAnnullo?: AdeResoAnnullo;
  numeroProgressivo?: string;
  scontoAbbuono: string;
  importoDetraibileDeducibile: string;
}

/** Identificativi fiscali del cedente/prestatore */
export interface AdeIdentificativiFiscali {
  codicePaese: string;
  partitaIva: string;
  codiceFiscale: string;
}

/** Altri dati identificativi del cedente/prestatore */
export interface AdeAltriDatiIdentificativi {
  denominazione: string;
  nome: string;
  cognome: string;
  indirizzo: string;
  numeroCivico: string;
  cap: string;
  comune: string;
  provincia: string;
  nazione: string;
  modificati: boolean;
  defAliquotaIVA: string;
  nuovoUtente: boolean;
}

/** Cedente/prestatore (dati esercente) */
export interface AdeCedentePrestatore {
  identificativiFiscali: AdeIdentificativiFiscali;
  altriDatiIdentificativi: AdeAltriDatiIdentificativi;
  multiAttivita: unknown[];
  multiSede: unknown[];
}

/** Payload completo inviato all'AdE */
export interface AdePayload {
  idtrx?: string;
  datiTrasmissione: { formato: "DCW10" };
  cedentePrestatore: AdeCedentePrestatore;
  documentoCommerciale: AdeDocumentoCommerciale;
  flagIdentificativiModificati: boolean;
}

// ---------------------------------------------------------------------------
// Risposta AdE (sez. 2.5)
// ---------------------------------------------------------------------------

export interface AdeError {
  codice: string;
  descrizione: string;
}

export interface AdeResponse {
  esito: boolean;
  idtrx: string | null;
  progressivo: string | null;
  errori: AdeError[];
}

// ---------------------------------------------------------------------------
// Credenziali Fisconline (sez. 1.2)
// ---------------------------------------------------------------------------

export interface FisconlineCredentials {
  codiceFiscale: string;
  password: string;
  pin: string;
}

// ---------------------------------------------------------------------------
// Credenziali SPID (sez. 1.3)
// HAR finding (login_spid.har): flusso SAML2 HTTP POST Binding via broker
// Sogei (spid.sogei.it). Nessun PIN — 2FA tramite push notification (Level 2).
// I valori corrispondono ai path segment usati da AdE: /dp/SPID/{provider}/s4
// ---------------------------------------------------------------------------

export type SpidProvider =
  | "aruba"
  | "infocert"
  | "intesa"
  | "lepida"
  | "namirial"
  | "poste"
  | "sielte"
  | "spiditalia"
  | "tim";

export interface SpidCredentials {
  codiceFiscale: string;
  password: string;
  spidProvider: SpidProvider;
}

// ---------------------------------------------------------------------------
// Catalogo prodotti AdE (sez. 8) — endpoint: /ser/api/documenti/v1/doc/rubrica/prodotti
// HAR finding (vendita.har): il portale usa questo endpoint per precompilare
// le righe documento. Utile per la feature "Catalogo prodotti".
// ---------------------------------------------------------------------------

export interface AdeProduct {
  /** ID interno AdE del prodotto */
  id: number;
  descrizioneProdotto: string;
  /** Prezzo unitario netto (stringa, es. "100") */
  prezzoUnitario: string;
  /** Prezzo lordo (stringa, es. "100") */
  prezzoLordo: string;
  /** Codice aliquota/natura, es. "N2", "22" */
  aliquotaIVA: string;
}

// ---------------------------------------------------------------------------
// Documenti — response GET /documenti/ e GET /documenti/{idtrx}/
// HAR finding (annullo.har): endpoints usati per ricercare il doc originale
// prima di emettere un annullo, per prelevare idElementoContabile e totali.
// ---------------------------------------------------------------------------

/**
 * Riepilogo documento nell'elenco risultati (GET /documenti/).
 *
 * HAR finding (ricerca.har, annullo.har [03], [04]): campo "cfCliente" (non
 * "cfCessionarioCommittente" come nel dettaglio). ⚠️ Il `data` di risposta è
 * DD/MM/YYYY HH:MM:SS (vedi campo sotto), mentre i query param dataDal/dataInvioAl
 * usano MM/DD/YYYY — asimmetria reale, non un refuso.
 */
export interface AdeDocumentSummary {
  idtrx: string;
  /** Progressivo completo, es. "DCW2026/5432-1548" */
  numeroProgressivo: string;
  /**
   * Codice fiscale cliente OPPURE codice lotteria (stringa vuota se assente).
   * HAR (ricerca.har): valore tipo "YYWLR30G" (8 char = formato codice lotteria).
   */
  cfCliente: string;
  /**
   * Data/ora documento in formato DD/MM/YYYY HH:MM:SS (es. "23/02/2026 10:06:14").
   * ⚠️ Asimmetria reale: i query param dataDal/dataInvioAl sono invece MM/DD/YYYY.
   * HAR finding: ricerca.har / annullo.har.
   */
  data: string;
  tipoOperazione: AdeOperationType;
  /** Ammontare complessivo in euro come number JSON (es. 1.7). HAR: ricerca.har. */
  ammontareComplessivo: number;
  /**
   * Per una vendita (V): "A" se il documento risulta annullato.
   * Per un annullo (A): il numeroProgressivo del documento annullato
   * (es. "DCW2026/5432-1548"). Assente se non pertinente. HAR: ricerca.har.
   */
  annulli?: string;
}

/** Risposta lista documenti (GET /documenti/) */
export interface AdeDocumentList {
  totalCount: number;
  elencoRisultati: AdeDocumentSummary[];
}

/**
 * Riga contabile nel documento di dettaglio (GET /documenti/{idtrx}/).
 *
 * HAR finding (annullo.har [04]): resiPregressi è assente nella risposta GET
 * ma richiesto nel POST dell'annullo — il mapper lo aggiunge come "0.00".
 */
export interface AdeDocumentDetailElemento {
  idElementoContabile: string;
  reso: string;
  quantita: string;
  descrizioneProdotto: string;
  prezzoLordo: string;
  prezzoUnitario: string;
  scontoUnitario: string;
  scontoLordo: string;
  aliquotaIVA: string;
  importoIVA: string;
  imponibile: string;
  imponibileNetto: string;
  totale: string;
  omaggio: "N" | "Y";
}

/**
 * Corpo documentoCommerciale come restituito da GET /documenti/{idtrx}/.
 *
 * HAR finding (annullo.har [04]):
 * - progressivoCollegato e multiAttivita possono essere assenti per doc semplici
 * - i campi monetari usano precisione variabile (non 8 decimali fissi)
 * - elementiContabili senza resiPregressi (aggiunto dal mapper nel POST)
 */
export interface AdeDocumentDetailBody {
  cfCessionarioCommittente: string;
  flagDocCommPerRegalo: boolean;
  progressivoCollegato?: string;
  /** Data/ora documento in formato DD/MM/YYYY */
  dataOra: string;
  multiAttivita?: AdeMultiAttivita;
  importoTotaleIva: string;
  scontoTotale: string;
  scontoTotaleLordo: string;
  totaleImponibile: string;
  ammontareComplessivo: string;
  totaleNonRiscosso: string;
  scontoAbbuono: string;
  importoDetraibileDeducibile: string;
  /** Righe contabili con i reali idElementoContabile (necessari per annullo) */
  elementiContabili: AdeDocumentDetailElemento[];
  vendita?: AdePaymentEntry[];
  numeroProgressivo?: string;
}

/**
 * Dettaglio completo di un documento (GET /documenti/{idtrx}/).
 *
 * HAR finding (annullo.har [04]): struttura identica al payload di invio —
 * { idtrx, datiTrasmissione, cedentePrestatore, documentoCommerciale }.
 * I dati rilevanti per l'annullo sono sotto documentoCommerciale.
 */
export interface AdeDocumentDetail {
  idtrx: string;
  documentoCommerciale: AdeDocumentDetailBody;
}

/**
 * Parametri di ricerca documenti (GET /documenti/).
 *
 * HAR finding (ricerca.har, annullo.har [03], [04]):
 * - query date in formato MM/DD/YYYY (es. "01/31/2026")
 * - tipoOperazione: "V" per vendite, "A" per annulli
 * - la request reale include sempre anche start=1, pages=0, perPage e un
 *   cache-buster v=<timestamp>: gestiti da RealAdeClient.searchDocuments, non
 *   esposti qui (il chiamante controlla solo i filtri + page/perPage).
 */
export interface AdeSearchParams {
  /** Data dal formato MM/DD/YYYY */
  dataDal?: string;
  /** Data al formato MM/DD/YYYY */
  dataInvioAl?: string;
  numeroProgressivo?: string;
  tipoOperazione?: AdeOperationType;
  page?: number;
  perPage?: number;
}
