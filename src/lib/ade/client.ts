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
  /**
   * Autentica sul portale AdE con credenziali Fisconline e restituisce una
   * sessione.
   *
   * `utenzaPiva` sceglie su quale partita IVA operare quando l'accesso ne offre
   * più d'una (HAR.md #18) — che sia intestata a chi accede o raggiunta tramite
   * incarico, lo decide il client cercandola nelle liste vive. Omessa, il login
   * procede da solo SOLO se esiste un'unica P.IVA diretta; in ogni altro caso
   * lancia `AdeUtenzaSelectionRequiredError` con i candidati, invece di
   * sceglierne uno arbitrariamente.
   */
  login(
    credentials: FisconlineCredentials,
    utenzaPiva?: string,
  ): Promise<AdeSession>;

  /**
   * Autentica sul portale AdE tramite CIE e restituisce una sessione.
   *
   * HAR finding (login_cie_ok_notifica_app.har): IdP Shibboleth Ministero
   * dell'Interno, login livello 2 (email CIE ID + password) confermato via push
   * sull'app CIE ID. Nessun re-auth automatico su 401: il secondo fattore è umano.
   */
  loginCie(
    credentials: CieCredentials,
    utenzaPiva?: string,
  ): Promise<AdeSession>;

  /**
   * Adotta una sessione del portale aperta altrove — il login SPID nella
   * webview dell'app nativa (docs/mobile-v2.md punto 5) — dai suoi cookie.
   * Nessuna credenziale resta in memoria: su 401 niente re-login.
   */
  adoptSession(cookieHeader: string): Promise<AdeSession>;

  /** Invia un documento commerciale di vendita */
  submitSale(payload: AdePayload): Promise<AdeResponse>;

  /** Invia un annullo di documento commerciale */
  submitVoid(payload: AdePayload): Promise<AdeResponse>;

  /**
   * Invia un documento commerciale di reso merce. Stessa POST di vendita e
   * annullo (HAR.md #19a): cambia solo il payload (`tipologia: "R"`).
   */
  submitReturn(payload: AdePayload): Promise<AdeResponse>;

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
   * prima di ri-sottometterlo (evita duplicati fiscali — PR #653).
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
