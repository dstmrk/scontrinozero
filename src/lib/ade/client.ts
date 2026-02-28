/**
 * AdeClient interface — adapter pattern per integrazione AdE.
 *
 * Implementazioni:
 * - MockAdeClient: esegue tutta la logica senza HTTP (test/staging)
 * - RealAdeClient: HTTP verso il portale AdE (produzione)
 *
 * Reference: docs/api-spec.md sez. 12
 */

import type {
  AdeCedentePrestatore,
  AdeDocumentDetail,
  AdeDocumentList,
  AdePayload,
  AdeProduct,
  AdeResponse,
  AdeSearchParams,
  FisconlineCredentials,
  SpidCredentials,
} from "./types";

/** Sessione autenticata con il portale AdE */
export interface AdeSession {
  /** Token p_auth Liferay */
  pAuth: string;
  /** Partita IVA selezionata */
  partitaIva: string;
  /** Timestamp creazione sessione */
  createdAt: number;
}

export interface AdeClient {
  /** Autentica sul portale AdE con credenziali Fisconline e restituisce una sessione */
  login(credentials: FisconlineCredentials): Promise<AdeSession>;

  /**
   * Autentica sul portale AdE tramite SPID e restituisce una sessione.
   *
   * HAR finding (login_spid.har): flusso SAML2 HTTP POST Binding via broker Sogei
   * (spid.sogei.it). 2FA tramite push notification sul dispositivo mobile.
   * NOTA: le sessioni SPID non supportano re-auth automatico (no PIN).
   */
  loginSpid(credentials: SpidCredentials): Promise<AdeSession>;

  /** Invia un documento commerciale di vendita */
  submitSale(payload: AdePayload): Promise<AdeResponse>;

  /** Invia un annullo di documento commerciale */
  submitVoid(payload: AdePayload): Promise<AdeResponse>;

  /** Recupera i dati fiscali dell'esercente */
  getFiscalData(): Promise<AdeCedentePrestatore>;

  /**
   * Recupera il catalogo prodotti salvato sul portale AdE.
   *
   * HAR finding (vendita.har): GET /ser/api/documenti/v1/doc/rubrica/prodotti
   * Usato dal portale per precompilare le righe documento.
   */
  getProducts(): Promise<AdeProduct[]>;

  /**
   * Recupera l'HTML dello scontrino emesso (per stampa/anteprima).
   *
   * HAR finding (vendita.har): GET /ser/api/documenti/v1/doc/documenti/{idtrx}/stampa/
   * Chiamato dal portale subito dopo l'emissione (request [11]).
   */
  getStampa(idtrx: string, isGift?: boolean): Promise<string>;

  /**
   * Recupera il dettaglio di un documento tramite id transazione.
   *
   * HAR finding (annullo.har [05]): GET /ser/api/documenti/v1/doc/documenti/{idtrx}/
   * Necessario prima dell'annullo per ottenere elementiContabili (con
   * idElementoContabile reali) e i totali da includere nel payload di annullo.
   */
  getDocument(idtrx: string): Promise<AdeDocumentDetail>;

  /**
   * Ricerca documenti commerciali con filtri opzionali.
   *
   * HAR finding (annullo.har [03], [04]):
   *   GET /ser/api/documenti/v1/doc/documenti/?dataDal=...&dataInvioAl=...&page=1&perPage=10
   *   GET /ser/api/documenti/v1/doc/documenti/?numeroProgressivo=...&tipoOperazione=V
   */
  searchDocuments(params: AdeSearchParams): Promise<AdeDocumentList>;

  /** Logout dalla sessione AdE */
  logout(): Promise<void>;
}
