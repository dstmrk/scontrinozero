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
  AdeCedentePrestatore,
  AdeDocumentDetail,
  AdeDocumentList,
  AdePayload,
  AdeProduct,
  AdeResponse,
  AdeSearchParams,
} from "./types";

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

  async submitSale(_payload: AdePayload): Promise<AdeResponse> {
    return this.mockSubmit();
  }

  async submitVoid(_payload: AdePayload): Promise<AdeResponse> {
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

  async getFiscalData(): Promise<AdeCedentePrestatore> {
    this.assertLoggedIn();

    return {
      identificativiFiscali: {
        codicePaese: "IT",
        partitaIva: this.session!.partitaIva,
        codiceFiscale: "RSSMRA80A01H501A",
      },
      altriDatiIdentificativi: {
        denominazione: "",
        nome: "MARIO",
        cognome: "ROSSI",
        indirizzo: "VIA ROMA",
        numeroCivico: "1",
        cap: "00100",
        comune: "ROMA",
        provincia: "RM",
        nazione: "IT",
        modificati: false,
        defAliquotaIVA: "22",
        nuovoUtente: false,
      },
      multiAttivita: [],
      multiSede: [],
    };
  }

  async getProducts(): Promise<AdeProduct[]> {
    this.assertLoggedIn();
    return [];
  }

  async getStampa(_idtrx: string, _isGift = false): Promise<string> {
    this.assertLoggedIn();
    return "";
  }

  async getDocument(_idtrx: string): Promise<AdeDocumentDetail> {
    this.assertLoggedIn();

    // Return a minimal valid document for testing purposes
    return {
      idtrx: _idtrx,
      numeroProgressivo: "",
      cfCessionarioCommittente: "",
      data: "",
      tipoOperazione: "V",
      flagDocCommPerRegalo: false,
      progressivoCollegato: "",
      dataOra: "",
      multiAttivita: { codiceAttivita: "", descAttivita: "" },
      importoTotaleIva: "0.00000000",
      scontoTotale: "0.00000000",
      scontoTotaleLordo: "0.00000000",
      totaleImponibile: "0.00000000",
      ammontareComplessivo: "0.00000000",
      totaleNonRiscosso: "0.00000000",
      scontoAbbuono: "0.00",
      importoDetraibileDeducibile: "0.00000000",
      elementiContabili: [],
    };
  }

  async searchDocuments(_params: AdeSearchParams): Promise<AdeDocumentList> {
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
