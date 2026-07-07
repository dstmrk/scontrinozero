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
  CieCredentials,
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
   * HAR finding (login_spid_ok_*.har): flusso SAML2 HTTP POST Binding, entry
   * AdE /rp/{provider}/sel. 2FA via OTP o push notification.
   * NOTA: le sessioni SPID non supportano re-auth automatico (secondo fattore
   * umano) — alla scadenza serve un nuovo login interattivo.
   */
  loginSpid(credentials: SpidCredentials): Promise<AdeSession>;

  /**
   * Autentica sul portale AdE tramite CIE e restituisce una sessione.
   *
   * HAR finding (login_cie_ok_notifica_app.har): IdP Shibboleth Ministero
   * dell'Interno, login livello 2 (email CIE ID + password) confermato via push
   * sull'app CIE ID. Come SPID, nessun re-auth automatico su 401.
   */
  loginCie(credentials: CieCredentials): Promise<AdeSession>;

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
   * HAR finding (ricerca.har, annullo.har [03], [04]):
   *   GET /ser/api/documenti/v1/doc/documenti/?dataDal=...&dataInvioAl=...
   *       &page=1&pages=0&perPage=10&start=1&v=<timestamp>
   *   GET /ser/api/documenti/v1/doc/documenti/?numeroProgressivo=...&tipoOperazione=V
   *
   * Usato dal recovery pre-retry per riconciliare un documento PENDING con AdE
   * prima di ri-sottometterlo (evita duplicati fiscali — REVIEW.md #4).
   */
  searchDocuments(params: AdeSearchParams): Promise<AdeDocumentList>;

  /**
   * Cambia la password Fisconline tramite il portale telematici AdE.
   * Non richiede login previo — funziona anche con password scaduta.
   *
   * HAR: cambio_password_*.har
   * Endpoint: POST telematici.agenziaentrate.gov.it/Abilitazione/CambioPassword/CambioPassword.do
   */
  changePasswordFisconline(params: {
    codiceFiscale: string;
    oldPassword: string;
    newPassword: string;
    confirmNewPassword: string;
  }): Promise<void>;

  /** Logout dalla sessione AdE */
  logout(): Promise<void>;
}
