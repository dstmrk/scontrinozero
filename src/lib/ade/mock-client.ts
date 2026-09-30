/**
 * MockAdeClient — simula le risposte AdE senza effettuare chiamate HTTP.
 *
 * Esegue tutta la logica (validazione, payload) ma si ferma prima dell'invio.
 * Usato in ambiente test (`ADE_MODE=mock`).
 *
 * Reference: docs/api-spec.md sez. 12
 */

import type { AdeClient, AdeSession } from "./client";
import type {
  AdeDocumentDetail,
  AdeDocumentList,
  AdePayload,
  AdeProduct,
  AdeResponse,
  AdeSearchParams,
  AdeUtenzaCandidate,
  CieCredentials,
  SpidCredentials,
} from "./types";
import {
  AdeUtenzaNotAvailableError,
  AdeUtenzaSelectionRequiredError,
} from "./errors";
import { buildCedenteFromBusiness } from "./mapper";

/**
 * PIN sentinella che, in mock, simula un'utenza AdE con **entrambe** le
 * personae del wizard: una partita IVA propria e un incarico su un altro
 * soggetto (HAR.md #18.5-ter).
 *
 * Esiste perché il flusso che quella forma produce — il picker delle utenze —
 * non era percorribile fuori dalla produzione: il mock rispondeva sempre con
 * una sessione, quindi ogni verifica passava dal portale vero, che in dev va
 * toccato con parsimonia (rate limit AdE sull'IP di uscita, REVIEW.md #36).
 *
 * È un PIN valido per `adePinSchema` (dieci cifre), quindi attraversa il
 * boundary come uno qualunque e la sentinella resta confinata qui.
 */
export const ADE_MOCK_MULTI_PERSONA_PIN = "1111111111";

/** Le due P.IVA offerte dall'utenza multi-persona simulata. */
const MOCK_MULTI_PERSONA_CANDIDATES: readonly AdeUtenzaCandidate[] = [
  {
    piva: "11111111111",
    denominazione: "LA TUA ATTIVITÀ",
    provenienza: "diretta",
  },
  { piva: "22222222222", provenienza: "incarico" },
];

export class MockAdeClient implements AdeClient {
  private session: AdeSession | null = null;
  private transactionCounter = 151000000;
  private progressiveCounter = 1;

  login(
    credentials: {
      codiceFiscale: string;
      password: string;
      pin: string;
    },
    utenzaPiva?: string,
  ): Promise<AdeSession> {
    if (credentials.pin === ADE_MOCK_MULTI_PERSONA_PIN) {
      return this.loginMultiPersona(utenzaPiva);
    }

    return this.startSession({
      pAuth: `mock_p_auth_${Date.now()}`,
      // Con una P.IVA scelta si opera su quella, non su quella derivata dal
      // codice fiscale di chi accede (HAR.md #18.4).
      partitaIva:
        utenzaPiva ?? credentials.codiceFiscale.slice(0, 11).padEnd(11, "0"),
      createdAt: Date.now(),
    });
  }

  /**
   * L'utenza con due personae: senza una scelta chiede di sceglierla, con una
   * scelta che non offre la rifiuta. Sono i due errori che il flusso reale
   * produce, con gli stessi tipi — il chiamante non distingue mock da reale.
   */
  private loginMultiPersona(utenzaPiva?: string): Promise<AdeSession> {
    if (!utenzaPiva) {
      return Promise.reject(
        new AdeUtenzaSelectionRequiredError([...MOCK_MULTI_PERSONA_CANDIDATES]),
      );
    }
    if (!MOCK_MULTI_PERSONA_CANDIDATES.some((c) => c.piva === utenzaPiva)) {
      return Promise.reject(new AdeUtenzaNotAvailableError(utenzaPiva));
    }

    return this.startSession({
      pAuth: `mock_p_auth_${Date.now()}`,
      partitaIva: utenzaPiva,
      createdAt: Date.now(),
    });
  }

  loginSpid(credentials: SpidCredentials): Promise<AdeSession> {
    return this.startSession({
      pAuth: `mock_p_auth_spid_${Date.now()}`,
      partitaIva: credentials.codiceFiscale.slice(0, 11).padEnd(11, "0"),
      createdAt: Date.now(),
    });
  }

  loginCie(
    _credentials: CieCredentials,
    utenzaPiva?: string,
  ): Promise<AdeSession> {
    // CIE: lo username è un'email, non il CF. In mock la P.IVA è fittizia
    // (in real viene estratta dal portale post-login via wizardTemplate), a
    // meno di una scelta esplicita.
    return this.startSession({
      pAuth: `mock_p_auth_cie_${Date.now()}`,
      partitaIva: utenzaPiva ?? "00000000000",
      createdAt: Date.now(),
    });
  }

  submitSale(_payload: AdePayload): Promise<AdeResponse> {
    return this.whenLoggedIn(() => this.mockSubmit());
  }

  submitVoid(_payload: AdePayload): Promise<AdeResponse> {
    return this.whenLoggedIn(() => this.mockSubmit());
  }

  private mockSubmit(): AdeResponse {
    const idtrx = String(this.transactionCounter++);
    const progressivo = `DCW2026/MOCK-${this.progressiveCounter++}`;

    return {
      esito: true,
      idtrx,
      progressivo,
      // Il RealAdeClient lo deriva dall'header HTTP `Date` (HAR.md #16b): qui
      // l'equivalente è l'orologio locale. Senza, in dev/sandbox
      // ade_registered_at resterebbe sul `DEFAULT now()` dell'INSERT (la
      // colonna è NOT NULL, mai NULL) e la ricevuta di annullamento porterebbe
      // una data leggermente diversa da quella mostrata dopo l'emissione —
      // uno scarto che in produzione non esiste.
      registeredAt: new Date().toISOString(),
      errori: [],
    };
  }

  getFiscalData() {
    return this.whenLoggedIn((session) =>
      buildCedenteFromBusiness({
        vatNumber: session.partitaIva,
        fiscalCode: "RSSMRA80A01H501A",
        businessName: "",
        address: "VIA ROMA",
        streetNumber: "1",
        city: "ROMA",
        province: "RM",
        zipCode: "00100",
        preferredVatCode: "22",
      }),
    );
  }

  getProducts(): Promise<AdeProduct[]> {
    return this.whenLoggedIn(() => []);
  }

  getDocument(_idtrx: string): Promise<AdeDocumentDetail> {
    // Return a minimal valid document matching the real API response structure.
    // HAR finding (annullo.har [04]): campi monetari sotto documentoCommerciale,
    // precisione variabile (non 8 decimali). resiPregressi assente negli elementi.
    return this.whenLoggedIn(() => ({
      idtrx: _idtrx,
      documentoCommerciale: {
        cfCessionarioCommittente: "",
        flagDocCommPerRegalo: false,
        progressivoCollegato: "",
        dataOra: "",
        multiAttivita: { codiceAttivita: "", descAttivita: "" },
        importoTotaleIva: "0",
        scontoTotale: "0",
        scontoTotaleLordo: "0",
        totaleImponibile: "0",
        ammontareComplessivo: "0",
        totaleNonRiscosso: "0",
        scontoAbbuono: "0",
        importoDetraibileDeducibile: "0",
        elementiContabili: [],
      },
    }));
  }

  searchDocuments(_params: AdeSearchParams): Promise<AdeDocumentList> {
    return this.whenLoggedIn(() => ({ totalCount: 0, elencoRisultati: [] }));
  }

  async changePasswordFisconline(_params: {
    codiceFiscale: string;
    oldPassword: string;
    newPassword: string;
    confirmNewPassword: string;
  }): Promise<void> {
    // Mock: always succeeds (no HTTP call)
  }

  logout(): Promise<void> {
    this.session = null;
    return Promise.resolve();
  }

  private startSession(session: AdeSession): Promise<AdeSession> {
    this.session = session;
    return Promise.resolve(session);
  }

  /**
   * Senza sessione rifiuta la Promise invece di lanciare: il client reale
   * fallisce sempre in modo asincrono, e il chiamante non deve distinguere.
   */
  private whenLoggedIn<T>(fn: (session: AdeSession) => T): Promise<T> {
    const session = this.session;
    if (!session) {
      return Promise.reject(new Error("Not logged in. Call login() first."));
    }
    // L'executor trasforma anche un throw di `fn` in rejection.
    return new Promise((resolve) => resolve(fn(session)));
  }
}
