/**
 * MockAdeClient — simula le risposte AdE senza effettuare chiamate HTTP.
 *
 * Esegue tutta la logica (validazione, payload) ma si ferma prima dell'invio.
 * Usato in ambiente test (`ADE_MODE=mock`).
 *
 * Reference: docs/api-spec.md sez. 12
 */

import type { AdeAdoptedSession, AdeClient, AdeSession } from "./client";
import type {
  AdeCedentePrestatore,
  AdeDocumentDetail,
  AdeDocumentList,
  AdePayload,
  AdeProduct,
  AdeResponse,
  AdeSearchParams,
  AdeUtenzaCandidate,
  CieCredentials,
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
 * toccato con parsimonia (rate limit AdE sull'IP di uscita, PR #671).
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

/**
 * Archivio dei documenti emessi in mock, a livello di modulo.
 *
 * In mock ogni operazione apre il suo client (`withAdeSession` non tiene cache,
 * `src/lib/ade/index.ts`), quindi uno stato per istanza non sopravvive fra
 * l'emissione e il reso. Senza archivio `getDocument` risponderebbe senza
 * righe e un reso non sarebbe percorribile in dev e sandbox.
 *
 * Vive quanto il processo: dopo un riavvio le vendite precedenti non ci sono
 * più, e il reso di quelle fallisce come se l'AdE non le conoscesse. È un
 * limite del mock, non del flusso. Il tetto tiene limitata la memoria.
 */
const MOCK_ARCHIVE_MAX = 500;
const mockArchive = new Map<string, AdeDocumentDetail>();

/**
 * Contatori di processo, non di istanza: con un client per operazione, un
 * contatore per istanza coniava lo stesso idtrx a ogni emissione. Il seme da
 * `Date.now()` evita di riusare gli idtrx di un processo precedente, che sono
 * ancora nel DB.
 */
let nextTransactionId = Date.now();
let nextProgressive = 1;

function archiveSale(
  idtrx: string,
  progressivo: string,
  payload: AdePayload,
): void {
  const docComm = payload.documentoCommerciale;
  mockArchive.set(idtrx, {
    idtrx,
    documentoCommerciale: {
      ...docComm,
      numeroProgressivo: progressivo,
      elementiContabili: docComm.elementiContabili.map((el, i) => ({
        idElementoContabile: `${idtrx}${String(i).padStart(2, "0")}`,
        // Il GET porta il cumulativo dei resi, senza `resiPregressi`
        // (HAR.md #19a): una vendita appena emessa parte da zero.
        reso: "0",
        quantita: el.quantita,
        descrizioneProdotto: el.descrizioneProdotto,
        prezzoLordo: el.prezzoLordo,
        prezzoUnitario: el.prezzoUnitario,
        scontoUnitario: el.scontoUnitario,
        scontoLordo: el.scontoLordo,
        aliquotaIVA: el.aliquotaIVA,
        importoIVA: el.importoIVA,
        imponibile: el.imponibile,
        imponibileNetto: el.imponibileNetto,
        totale: el.totale,
        omaggio: el.omaggio,
      })),
    },
  });
  if (mockArchive.size > MOCK_ARCHIVE_MAX) {
    const oldest = mockArchive.keys().next().value;
    if (oldest !== undefined) mockArchive.delete(oldest);
  }
}

/** Somma le quantità del reso al cumulativo di riga della vendita. */
function applyReturn(payload: AdePayload): boolean {
  const sale = payload.idtrx ? mockArchive.get(payload.idtrx) : undefined;
  if (!sale) return false;
  const lines = payload.documentoCommerciale.elementiContabili;
  sale.documentoCommerciale.elementiContabili =
    sale.documentoCommerciale.elementiContabili.map((el, i) => {
      const cents =
        Math.round(Number(el.reso) * 100) +
        Math.round(Number(lines[i]?.reso ?? 0) * 100);
      return { ...el, reso: String(cents / 100) };
    });
  return true;
}

/** Dati fiscali fittizi della P.IVA di sessione (`dati/fiscali` in mock). */
function mockCedente(session: AdeSession): AdeCedentePrestatore {
  return buildCedenteFromBusiness({
    vatNumber: session.partitaIva,
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

export interface MockAdeClientOptions {
  /**
   * P.IVA registrata del business. CIE senza utenza scelta e SPID la usano
   * come identità della sessione: con la P.IVA fittizia l'identity guard
   * respingerebbe in sandbox ogni business già collegato che cambia metodo.
   */
  readonly registeredPartitaIva?: string;
}

export class MockAdeClient implements AdeClient {
  private session: AdeSession | null = null;
  private readonly registeredPartitaIva: string | undefined;

  constructor(options: MockAdeClientOptions = {}) {
    this.registeredPartitaIva = options.registeredPartitaIva;
  }

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

  loginCie(
    _credentials: CieCredentials,
    utenzaPiva?: string,
  ): Promise<AdeSession> {
    // CIE: lo username è un'email, non il CF. In mock la P.IVA è l'utenza
    // scelta, poi quella registrata del business, poi una fittizia (in real
    // viene estratta dal portale post-login via wizardTemplate).
    return this.startSession({
      pAuth: `mock_p_auth_cie_${Date.now()}`,
      partitaIva: utenzaPiva ?? this.registeredPartitaIva ?? "00000000000",
      createdAt: Date.now(),
    });
  }

  /**
   * Sessione SPID adottata: in mock i cookie non si verificano. La P.IVA è
   * quella registrata del business, se c'è, altrimenti fittizia come per CIE.
   * Come il client reale, restituisce i dati fiscali letti nell'adozione.
   */
  async adoptSession(_cookieHeader: string): Promise<AdeAdoptedSession> {
    const session = await this.startSession({
      pAuth: `mock_p_auth_spid_${Date.now()}`,
      partitaIva: this.registeredPartitaIva ?? "00000000000",
      createdAt: Date.now(),
    });
    return { ...session, fiscalData: mockCedente(session) };
  }

  submitSale(payload: AdePayload): Promise<AdeResponse> {
    return this.whenLoggedIn(() => {
      const response = this.mockSubmit();
      archiveSale(response.idtrx!, response.progressivo!, payload);
      return response;
    });
  }

  submitVoid(_payload: AdePayload): Promise<AdeResponse> {
    return this.whenLoggedIn(() => this.mockSubmit());
  }

  /**
   * Il reso di una vendita che il mock non conosce viene rifiutato come
   * farebbe l'AdE con `esito: false`, invece di riuscire su righe inventate.
   */
  submitReturn(payload: AdePayload): Promise<AdeResponse> {
    return this.whenLoggedIn(() => {
      if (!applyReturn(payload)) {
        return {
          esito: false,
          idtrx: null,
          progressivo: null,
          errori: [
            {
              codice: "MOCK_NOT_FOUND",
              descrizione: "Documento di vendita sconosciuto al mock",
            },
          ],
        };
      }
      return this.mockSubmit();
    });
  }

  private mockSubmit(): AdeResponse {
    const idtrx = String(nextTransactionId++);
    const progressivo = `DCW2026/MOCK-${nextProgressive++}`;

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
    return this.whenLoggedIn(mockCedente);
  }

  getProducts(): Promise<AdeProduct[]> {
    return this.whenLoggedIn(() => []);
  }

  getDocument(_idtrx: string): Promise<AdeDocumentDetail> {
    const archived = mockArchive.get(_idtrx);
    if (archived) return this.whenLoggedIn(() => structuredClone(archived));
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
    return Promise.resolve(fn(session));
  }
}
