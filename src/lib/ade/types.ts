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
