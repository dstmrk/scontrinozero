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
  AdePayload,
  AdeProduct,
  AdeResponse,
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
  /** Autentica sul portale AdE e restituisce una sessione */
  login(credentials: FisconlineCredentials): Promise<AdeSession>;

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

  /** Logout dalla sessione AdE */
  logout(): Promise<void>;
}
