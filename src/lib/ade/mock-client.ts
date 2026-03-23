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
  SpidCredentials,
} from "./types";
import { buildCedenteFromBusiness } from "./mapper";

export class MockAdeClient implements AdeClient {
  private session: AdeSession | null = null;
  private transactionCounter = 151000000;
  private progressiveCounter = 1;

  async login(credentials: {
    codiceFiscale: string;
    password: string;
    pin: string;
  }): Promise<AdeSession> {
    this.session = {
      pAuth: `mock_p_auth_${Date.now()}`,
      partitaIva: credentials.codiceFiscale.slice(0, 11).padEnd(11, "0"),
      createdAt: Date.now(),
    };
    return this.session;
  }

  async loginSpid(credentials: SpidCredentials): Promise<AdeSession> {
    this.session = {
      pAuth: `mock_p_auth_spid_${Date.now()}`,
      partitaIva: credentials.codiceFiscale.slice(0, 11).padEnd(11, "0"),
      createdAt: Date.now(),
    };
    return this.session;
  }

  async submitSale(payload: AdePayload): Promise<AdeResponse> {
    void payload;
    return this.mockSubmit();
  }

  async submitVoid(payload: AdePayload): Promise<AdeResponse> {
    void payload;
    return this.mockSubmit();
  }

  private mockSubmit(): AdeResponse {
    this.assertLoggedIn();

    const idtrx = String(this.transactionCounter++);
    const progressivo = `DCW2026/MOCK-${this.progressiveCounter++}`;

    return {
      esito: true,
      idtrx,
      progressivo,
      errori: [],
    };
  }

  async getFiscalData() {
    this.assertLoggedIn();

    return buildCedenteFromBusiness({
      vatNumber: this.session!.partitaIva,
      fiscalCode: "RSSMRA80A01H501A",
      businessName: "",
      address: "VIA ROMA",
      streetNumber: "1",
      city: "ROMA",
      province: "RM",
      zipCode: "00100",
      preferredVatCode: "22",
    });
  }

  async getProducts(): Promise<AdeProduct[]> {
    this.assertLoggedIn();
    return [];
  }

  async getStampa(idtrx: string, isGift = false): Promise<string> {
    void idtrx;
    void isGift;
    this.assertLoggedIn();
    return "";
  }

  async getDocument(idtrx: string): Promise<AdeDocumentDetail> {
    this.assertLoggedIn();

    // Return a minimal valid document matching the real API response structure.
    // HAR finding (annullo.har [04]): campi monetari sotto documentoCommerciale,
    // precisione variabile (non 8 decimali). resiPregressi assente negli elementi.
    return {
      idtrx,
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
    };
  }

  async searchDocuments(params: AdeSearchParams): Promise<AdeDocumentList> {
    void params;
    this.assertLoggedIn();
    return { totalCount: 0, elencoRisultati: [] };
  }

  async logout(): Promise<void> {
    this.session = null;
  }

  private assertLoggedIn(): void {
    if (!this.session) {
      throw new Error("Not logged in. Call login() first.");
    }
  }
}
