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

/** Regex di validazione AdE per i codici IVA/natura */
export const ADE_VAT_CODE_REGEX =
  /^(N[1-6]|4|5|10|22|2|6\.4|7(\.3|\.5|\.65|\.95)?|8\.[358]|9\.5|12\.3)$/;

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
 * HAR finding (annullo.har [03], [04]): campo "cfCliente" (non
 * "cfCessionarioCommittente" come nel dettaglio).
 * Date format: MM/DD/YYYY (es. "02/23/2026").
 */
export interface AdeDocumentSummary {
  idtrx: string;
  numeroProgressivo: string;
  /** Codice fiscale cliente (stringa vuota se assente) */
  cfCliente: string;
  /** Data documento in formato MM/DD/YYYY */
  data: string;
  tipoOperazione: AdeOperationType;
  ammontareComplessivo: string;
  annulli?: unknown[] | null;
}

/** Risposta lista documenti (GET /documenti/) */
export interface AdeDocumentList {
  totalCount: number;
  elencoRisultati: AdeDocumentSummary[];
}

/**
 * Dettaglio completo di un documento (GET /documenti/{idtrx}/).
 *
 * HAR finding (annullo.har [05]): questa risposta è usata per popolare il
 * payload di annullo — in particolare "elementiContabili" (con i reali
 * idElementoContabile) e tutti i totali monetari.
 */
export interface AdeDocumentDetail {
  idtrx: string;
  numeroProgressivo: string;
  /** Codice fiscale cessionario/committente */
  cfCessionarioCommittente: string;
  /** Data documento in formato MM/DD/YYYY */
  data: string;
  tipoOperazione: AdeOperationType;
  flagDocCommPerRegalo: boolean;
  progressivoCollegato: string;
  /** Data/ora documento in formato DD/MM/YYYY (già pronta per payload AdE) */
  dataOra: string;
  multiAttivita: AdeMultiAttivita;
  importoTotaleIva: string;
  scontoTotale: string;
  scontoTotaleLordo: string;
  totaleImponibile: string;
  ammontareComplessivo: string;
  totaleNonRiscosso: string;
  scontoAbbuono: string;
  importoDetraibileDeducibile: string;
  /** Righe contabili con i reali idElementoContabile (necessari per annullo) */
  elementiContabili: AdeElementoContabile[];
  vendita?: AdePaymentEntry[];
  annulli?: unknown[] | null;
}

/**
 * Parametri di ricerca documenti (GET /documenti/).
 *
 * HAR finding (annullo.har [03], [04]):
 * - date in formato MM/DD/YYYY (es. "02/23/2026")
 * - tipoOperazione: "V" per vendite, "A" per annulli
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
