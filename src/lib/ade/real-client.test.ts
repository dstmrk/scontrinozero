/**
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RealAdeClient,
  decodeHtmlEntities,
  isStaleSocketError,
  resolveAdeRedirect,
} from "./real-client";
import {
  AdeAccountLockedError,
  AdeAuthError,
  AdeError,
  AdeNetworkError,
  AdeNoPartitaIvaError,
  AdePasswordExpiredError,
  AdeUtenzaNotAvailableError,
  AdeUtenzaSelectionRequiredError,
  AdePortalError,
  AdeSessionExpiredError,
  AdeUnknownOutcomeError,
} from "./errors";
import { logger } from "@/lib/logger";
import type { AdePayload, AdeResponse } from "./types";

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(opts: {
  status?: number;
  body?: string | object;
  headers?: [string, string][];
  location?: string;
}): Response {
  const { status = 200, body = "", headers = [], location } = opts;
  const responseHeaders: [string, string][] = [...headers];
  if (location) {
    responseHeaders.push(["Location", location]);
  }
  const responseBody = typeof body === "object" ? JSON.stringify(body) : body;
  return new Response(responseBody, { status, headers: responseHeaders });
}

/**
 * Queue 8 mock responses for the full Fisconline login flow (Phases A-G).
 *
 * HTTP call map (HAR-verified, login_credenziali_fisconline.har):
 *   [0] Phase A:  POST iampe/api/login/telematico    — 200 (login IAM)
 *   [1] Phase B:  GET portale/PortaleWeb/home         — SSO bridge
 *   [2] Phase B2: GET portale-rest/rs/initPortale     — JS-initiated, setta cookie portale
 *   [3] Phase C:  GET ivaservizi/instr/...home        — instradamento home
 *   [4] Phase E:  GET instr/.../initLight             — x-appl in risposta header
 *   [5] Phase D:  GET ivaservizi/dp/PI2FC             — DataPower bridge
 *   [6] Phase F:  GET instr/.../wizardTemplate        — P.IVA list
 *   [7] Phase G:  POST instr/.../setUserChoice        — attiva sessione
 */
function mockLoginSequence(fetchMock: ReturnType<typeof vi.fn>): void {
  // Phase A: POST iampe/api/login/telematico — 200
  fetchMock.mockResolvedValueOnce(mockResponse({ status: 200 }));

  // Phase B: GET portale/PortaleWeb/home?to=FATBTB — SSO bridge
  fetchMock.mockResolvedValueOnce(mockResponse({}));

  // Phase B2: GET portale-rest/rs/initPortale — JS-initiated, setta cookie portale
  fetchMock.mockResolvedValueOnce(mockResponse({ status: 501 }));

  // Phase C: GET ivaservizi/instr/InstradamentofcWeb/home — instradamento
  fetchMock.mockResolvedValueOnce(mockResponse({}));

  // Phase E: GET initLight — x-appl in response header
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      headers: [["x-appl", "test_x_appl_token"]],
    }),
  );

  // Phase D: GET ivaservizi/dp/PI2FC — DataPower session bridge
  fetchMock.mockResolvedValueOnce(mockResponse({}));

  // Phase F: GET wizardTemplate — P.IVA list
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      body: { PIva: [{ piva: "12345678901", denominazione: "TEST SRL" }] },
    }),
  );

  // Phase G: POST setUserChoice — activate session
  fetchMock.mockResolvedValueOnce(mockResponse({}));
}

/**
 * Queue Phases A–E + D (everything before Phase F wizardTemplate), so a test
 * can supply its own Phase F response to exercise fetchWizardPiva edge cases.
 */
function mockPhasesBeforeWizard(fetchMock: ReturnType<typeof vi.fn>): void {
  fetchMock.mockResolvedValueOnce(mockResponse({ status: 200 })); // A
  fetchMock.mockResolvedValueOnce(mockResponse({})); // B
  fetchMock.mockResolvedValueOnce(mockResponse({ status: 501 })); // B2
  fetchMock.mockResolvedValueOnce(mockResponse({})); // C
  fetchMock.mockResolvedValueOnce(
    mockResponse({ headers: [["x-appl", "tok"]] }),
  ); // E
  fetchMock.mockResolvedValueOnce(mockResponse({})); // D
}

/**
 * Queue 7 mock responses for re-auth on 401 (Phases A-E + G, skip F).
 *
 * Phase F (wizardTemplate) è skippata perché la P.IVA è già nota.
 */
function mockReAuthSequence(fetchMock: ReturnType<typeof vi.fn>): void {
  fetchMock.mockResolvedValueOnce(mockResponse({ status: 200 })); // A
  fetchMock.mockResolvedValueOnce(mockResponse({})); // B
  fetchMock.mockResolvedValueOnce(mockResponse({ status: 501 })); // B2
  fetchMock.mockResolvedValueOnce(mockResponse({})); // C
  fetchMock.mockResolvedValueOnce(
    mockResponse({ headers: [["x-appl", "test_x_appl_token"]] }),
  ); // E
  fetchMock.mockResolvedValueOnce(mockResponse({})); // D
  fetchMock.mockResolvedValueOnce(mockResponse({})); // G (no F)
}

/**
 * Entry di `richiestaIncarichi.incarichi[]` come la restituisce il portale
 * (HAR.md #18.1). Il payload opaco che rispediremo è questo oggetto
 * ri-serializzato: i test lo ricostruiscono con lo stesso JSON.stringify che
 * usa il client, così l'asserzione verifica il contenuto, non la formattazione.
 */
function incaricoEntry(piva: string) {
  return {
    deleghe: false,
    incaricante: { cf: piva, sede: "FOL", tipo: "INCARICO" },
    intermediario: false,
    tutore: false,
  };
}

/** Phase F per un'utenza multi-società: nessun `PIva`, N incarichi. */
function wizardTemplateIncaricato(pive: string[]) {
  return {
    cfUidUltimo: "RSSMRA80A01H501A",
    soloPerMe: false,
    hasDelega: false,
    intermediario: false,
    tutore: false,
    richiestaIncarichi: { incarichi: pive.map(incaricoEntry) },
  };
}

const mockCredentials = {
  codiceFiscale: "RSSMRA80A01H501A",
  password: "testpassword",
  pin: "1234567890",
};

function makeSalePayload(): AdePayload {
  return {
    datiTrasmissione: { formato: "DCW10" },
    cedentePrestatore: {
      identificativiFiscali: {
        codicePaese: "IT",
        partitaIva: "12345678901",
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
    },
    documentoCommerciale: {
      cfCessionarioCommittente: "",
      flagDocCommPerRegalo: false,
      progressivoCollegato: "",
      dataOra: "15/02/2026",
      multiAttivita: { codiceAttivita: "", descAttivita: "" },
      importoTotaleIva: "1.80",
      scontoTotale: "0.00",
      scontoTotaleLordo: "0.00",
      totaleImponibile: "8.20",
      ammontareComplessivo: "10.00",
      totaleNonRiscosso: "0.00",
      elementiContabili: [
        {
          idElementoContabile: "",
          resiPregressi: "0.00",
          reso: "0.00",
          quantita: "1.00",
          descrizioneProdotto: "Test Product",
          prezzoLordo: "10.00",
          prezzoUnitario: "8.20",
          scontoUnitario: "0.00",
          scontoLordo: "0.00",
          aliquotaIVA: "22",
          importoIVA: "1.80",
          imponibile: "8.20",
          imponibileNetto: "8.20",
          totale: "10.00",
          omaggio: "N",
        },
      ],
      vendita: [
        { tipo: "PC", importo: "10.00" },
        { tipo: "PE", importo: "0.00" },
        { tipo: "TR", importo: "0.00", numero: "0" },
        { tipo: "NR_EF", importo: "0.00" },
        { tipo: "NR_PS", importo: "0.00" },
        { tipo: "NR_CS", importo: "0.00" },
      ],
      scontoAbbuono: "0.00",
      importoDetraibileDeducibile: "0.00",
    },
    flagIdentificativiModificati: false,
  };
}

const successResponse: AdeResponse = {
  esito: true,
  idtrx: "151085589",
  progressivo: "DCW2026/5111-2188",
  errori: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RealAdeClient", () => {
  let fetchMock: ReturnType<typeof vi.fn> & typeof global.fetch;
  let client: RealAdeClient;

  beforeEach(() => {
    fetchMock = vi.fn() as ReturnType<typeof vi.fn> & typeof global.fetch;
    global.fetch = fetchMock;
    client = new RealAdeClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // login
  // -----------------------------------------------------------------------

  describe("login", () => {
    it("completes 8-phase auth flow (A-G incl. B2, 8 HTTP calls) and returns AdeSession", async () => {
      mockLoginSequence(fetchMock);

      const session = await client.login(mockCredentials);

      expect(session.pAuth).toBe(""); // pAuth è obsoleto nel nuovo flusso IAM
      expect(session.partitaIva).toBe("12345678901");
      expect(session.createdAt).toBeGreaterThan(0);
      expect(fetchMock).toHaveBeenCalledTimes(8);
    });

    it("Phase A: POST JSON con credenziali a iampe.agenziaentrate.gov.it", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const callA = fetchMock.mock.calls[0];
      expect(callA[0]).toContain(
        "iampe.agenziaentrate.gov.it/api/login/telematico",
      );
      expect(callA[1].method).toBe("POST");

      const body = JSON.parse(callA[1].body as string) as Record<
        string,
        string
      >;
      expect(body.username).toBe("RSSMRA80A01H501A");
      expect(body.password).toBe("testpassword");
      expect(body.pin).toBe("1234567890");
    });

    it("Phase A: lancia AdeAuthError se la risposta non è 200", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 }));

      await expect(client.login(mockCredentials)).rejects.toThrow(AdeAuthError);
    });

    it("Phase A: lancia AdePasswordExpiredError se details è PASSWORD_EXPIRED", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 401,
          body: {
            error: "Autenticazione fallita",
            errorCode: "AUTH_ERROR",
            details: "PASSWORD_EXPIRED",
          },
        }),
      );

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdePasswordExpiredError,
      );
    });

    it("Phase A: lancia AdeAccountLockedError se details è ACCOUNT_LOCKED", async () => {
      // Osservato in produzione il 17/09/2026: un'utenza bloccata riceveva il
      // messaggio "verifica codice fiscale, password e PIN" su credenziali
      // corrette. Il blocco non si sblocca riscrivendo i campi.
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 401,
          body: {
            error: "Autenticazione fallita",
            errorCode: "AUTH_ERROR",
            details: "ACCOUNT_LOCKED",
          },
        }),
      );

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdeAccountLockedError,
      );
    });

    it("Phase A: lancia AdeAuthError (non AdePasswordExpiredError) se details è INVALID_CREDENTIALS", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 401,
          body: { details: "INVALID_CREDENTIALS" },
        }),
      );

      const err = await client.login(mockCredentials).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AdeAuthError);
      expect(err).not.toBeInstanceOf(AdePasswordExpiredError);
    });

    it("Phase A: lancia AdeAuthError anche se il body non è JSON parseable", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 401, body: "not json {{{{" }),
      );

      const err = await client.login(mockCredentials).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AdeAuthError);
      expect(err).not.toBeInstanceOf(AdePasswordExpiredError);
    });

    it("Phase B: GET portale.agenziaentrate.gov.it/PortaleWeb/home?to=FATBTB", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const callB = fetchMock.mock.calls[1];
      expect(callB[0]).toContain(
        "portale.agenziaentrate.gov.it/PortaleWeb/home",
      );
      expect(callB[0]).toContain("to=FATBTB");
    });

    it("Phase B2: GET portale-rest/rs/initPortale per settare cookie portale", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const callB2 = fetchMock.mock.calls[2];
      expect(callB2[0]).toContain(
        "portale.agenziaentrate.gov.it/portale-rest/rs/initPortale",
      );
      expect(callB2[0]).toContain("to=FATBTB");
    });

    it("Phase C: GET instradamento home con redirect chain", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const callC = fetchMock.mock.calls[3];
      expect(callC[0]).toContain(
        "ivaservizi.agenziaentrate.gov.it/instr/InstradamentofcWeb/home",
      );
    });

    it("Phase C: segue redirect chain hop-by-hop catturando i cookie", async () => {
      // Phase A
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 200 }));
      // Phase B
      fetchMock.mockResolvedValueOnce(mockResponse({}));
      // Phase B2
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 501 }));
      // Phase C hop 1: redirect intermedio (es. SSO iampe)
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 302,
          location:
            "https://ivaservizi.agenziaentrate.gov.it/instr/InstradamentofcWeb/home",
          headers: [["Set-Cookie", "SESSION_MARKER=important; Path=/"]],
        }),
      );
      // Phase C hop 2: risposta finale 200
      fetchMock.mockResolvedValueOnce(mockResponse({}));
      // Phase E
      fetchMock.mockResolvedValueOnce(
        mockResponse({ headers: [["x-appl", "chain_x_appl"]] }),
      );
      // Phase D
      fetchMock.mockResolvedValueOnce(mockResponse({}));
      // Phase F
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: { PIva: [{ piva: "12345678901" }] } }),
      );
      // Phase G
      fetchMock.mockResolvedValueOnce(mockResponse({}));

      const session = await client.login(mockCredentials);

      expect(session.partitaIva).toBe("12345678901");
      // 1(A) + 1(B) + 1(B2) + 2(C redirect chain) + 1(E) + 1(D) + 1(F) + 1(G) = 9
      expect(fetchMock).toHaveBeenCalledTimes(9);
      // hop 2 usa redirect:'manual'
      expect(fetchMock.mock.calls[4][1].redirect).toBe("manual");
    });

    it("Phase E: GET initLight ed estrae x-appl dall'header di risposta", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const callE = fetchMock.mock.calls[4];
      expect(callE[0]).toContain("initLight");
    });

    it("Phase D: GET ivaservizi/dp/PI2FC per DataPower session bridge", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const callD = fetchMock.mock.calls[5];
      expect(callD[0]).toContain("ivaservizi.agenziaentrate.gov.it/dp/PI2FC");
    });

    it("Phase E: lancia AdePortalError se l'header x-appl è assente", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 200 })); // A
      fetchMock.mockResolvedValueOnce(mockResponse({})); // B
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 501 })); // B2
      fetchMock.mockResolvedValueOnce(mockResponse({})); // C
      // E: initLight senza header x-appl (D non viene mai chiamato)
      fetchMock.mockResolvedValueOnce(mockResponse({}));

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdePortalError,
      );
    });

    it("Phase F: GET wizardTemplate con x-appl header e restituisce P.IVA", async () => {
      mockLoginSequence(fetchMock);

      const session = await client.login(mockCredentials);

      const callF = fetchMock.mock.calls[6];
      expect(callF[0]).toContain("wizardTemplate");
      const headers = callF[1].headers as Headers;
      expect(headers.get("x-appl")).toBe("test_x_appl_token");
      expect(session.partitaIva).toBe("12345678901");
    });

    it("Phase F: lancia AdeNoPartitaIvaError se la lista PIva è vuota", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 200 })); // A
      fetchMock.mockResolvedValueOnce(mockResponse({})); // B
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 501 })); // B2
      fetchMock.mockResolvedValueOnce(mockResponse({})); // C
      fetchMock.mockResolvedValueOnce(
        mockResponse({ headers: [["x-appl", "tok"]] }),
      ); // E
      fetchMock.mockResolvedValueOnce(mockResponse({})); // D
      // F: lista PIva vuota
      fetchMock.mockResolvedValueOnce(mockResponse({ body: { PIva: [] } }));

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdeNoPartitaIvaError,
      );
    });

    it("Phase F: logga ade:wizard_piva_missing con la struttura (no PII) su PIva vuota", async () => {
      // PR #917: il throw arrivava su un 200 senza alcun contesto sulla
      // response. Logghiamo la struttura (chiavi), mai i valori PII.
      vi.mocked(logger.warn).mockClear();
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: { PIva: [], altroCampo: "x" },
          headers: [["content-type", "application/json"]],
        }),
      ); // F

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdeNoPartitaIvaError,
      );

      const call = vi
        .mocked(logger.warn)
        .mock.calls.find((c) => c[1] === "ade:wizard_piva_missing");
      expect(call).toBeDefined();
      const ctx = call![0] as Record<string, unknown>;
      expect(ctx).toMatchObject({
        contentType: "application/json",
        pIvaIsArray: true,
        pIvaLength: 0,
        firstEntryKeys: null,
      });
      expect(ctx.topLevelKeys).toEqual(
        expect.arrayContaining(["PIva", "altroCampo"]),
      );
    });

    it("Phase F: logga firstEntryKeys senza valore PII quando l'entry non ha piva", async () => {
      vi.mocked(logger.warn).mockClear();
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: { PIva: [{ denominazione: "ACME SRL" }] } }),
      ); // F: entry presente ma senza piva

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdeNoPartitaIvaError,
      );

      const call = vi
        .mocked(logger.warn)
        .mock.calls.find((c) => c[1] === "ade:wizard_piva_missing");
      expect(call).toBeDefined();
      const ctx = call![0] as Record<string, unknown>;
      expect(ctx.pIvaLength).toBe(1);
      expect(ctx.firstEntryKeys).toEqual(["denominazione"]);
      // Nessun valore PII (denominazione) deve finire nel log.
      expect(JSON.stringify(ctx)).not.toContain("ACME SRL");
    });

    it("Phase F: logga pIvaIsArray=false quando PIva manca del tutto", async () => {
      vi.mocked(logger.warn).mockClear();
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: { messaggio: "shape inattesa" } }),
      ); // F: nessun PIva

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdeNoPartitaIvaError,
      );

      const call = vi
        .mocked(logger.warn)
        .mock.calls.find((c) => c[1] === "ade:wizard_piva_missing");
      expect(call).toBeDefined();
      const ctx = call![0] as Record<string, unknown>;
      expect(ctx.pIvaIsArray).toBe(false);
      expect(ctx.pIvaLength).toBeNull();
      expect(ctx.firstEntryKeys).toBeNull();
      expect(ctx.topLevelKeys).toEqual(["messaggio"]);
    });

    it("Phase F: la shape reale di un'utenza senza P.IVA non è un guasto (SCONTRINOZERO-13)", async () => {
      // Payload osservato in produzione: login riuscito (cfUidUltimo presente),
      // nessuna chiave PIva — l'utenza AdE non ha partite IVA intestate.
      vi.mocked(logger.warn).mockClear();
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: {
            cfUidUltimo: "RSSMRA80A01H501A",
            hasDelega: false,
            intermediario: false,
            soloPerMe: true,
            tutore: false,
          },
          headers: [["content-type", "application/json"]],
        }),
      ); // F

      const err = await client.login(mockCredentials).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AdeNoPartitaIvaError);
      // Non è un AdePortalError: la response è un 200 ben formato.
      expect(err).not.toBeInstanceOf(AdePortalError);
      const ctx = vi
        .mocked(logger.warn)
        .mock.calls.find(
          (c) => c[1] === "ade:wizard_piva_missing",
        )![0] as Record<string, unknown>;
      expect(ctx.pIvaIsArray).toBe(false);
      // Il CF non deve finire nel log diagnostico.
      expect(JSON.stringify(ctx)).not.toContain("RSSMRA80A01H501A");
    });

    it("Phase F: un'utenza con due personae rivela le dirette con una sonda", async () => {
      // Il caso che ha bloccato un esercente in produzione: l'utenza ha una
      // P.IVA propria (attiva, quella che vuole usare) e un incarico su una
      // societa' cessata. `wizardTemplate` non porta `PIva` — le dirette
      // compaiono solo dopo che la persona e' dichiarata (HAR.md #18.5-ter) —
      // e senza sonda le offrivamo solo la societa' sbagliata.
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: wizardTemplateIncaricato(["11111111111"]) }),
      ); // F
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: { PIva: [{ piva: "22222222222", denominazione: "ACME SRL" }] },
        }),
      ); // sonda meStesso

      const err = await client.login(mockCredentials).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AdeUtenzaSelectionRequiredError);
      expect((err as AdeUtenzaSelectionRequiredError).candidates).toEqual([
        {
          piva: "22222222222",
          denominazione: "ACME SRL",
          provenienza: "diretta",
        },
        { piva: "11111111111", provenienza: "incarico" },
      ]);
    });

    it("Phase F: la sonda dichiara la persona meStesso su procediWizard", async () => {
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: wizardTemplateIncaricato(["11111111111"]) }),
      ); // F
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: { PIva: [{ piva: "22222222222" }] } }),
      ); // sonda

      await client.login(mockCredentials).catch(() => undefined);

      const probe = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes("procediWizard"),
      )!;
      expect(JSON.parse(probe[1].body)).toEqual({ tipoutenza: "meStesso" });
      expect((probe[1].headers as Headers).get("x-appl")).toBe("tok");
    });

    it("Phase F: con PIva gia' nel wizardTemplate la sonda non parte", async () => {
      // Utenza a persona singola: il portale ci risparmia il giro e le P.IVA
      // sono gia' li'. Una sonda qui sarebbe un round-trip per niente su ogni
      // login di ogni esercente.
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: { PIva: [{ piva: "12345678901" }] } }),
      ); // F
      fetchMock.mockResolvedValueOnce(mockResponse({})); // setUserChoice

      await client.login(mockCredentials);

      expect(
        fetchMock.mock.calls.filter((c) =>
          String(c[0]).includes("procediWizard"),
        ),
      ).toHaveLength(0);
    });

    it("Phase F: con una scelta gia' fatta su un incarico la sonda non parte", async () => {
      // La regressione che questo test impedisce: l'unico esercente che opera
      // da incaricato rifa' il login a ogni emissione. La sua strada e' gia'
      // decisa, non c'e' niente da scoprire, e una sonda gli aggiungerebbe un
      // round-trip piu' un cambio di persona lato server a ogni scontrino.
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: wizardTemplateIncaricato(["11111111111"]) }),
      ); // F
      fetchMock.mockResolvedValueOnce(mockResponse({})); // procediWizard 1
      fetchMock.mockResolvedValueOnce(mockResponse({})); // procediWizard 2
      fetchMock.mockResolvedValueOnce(mockResponse({})); // setUserChoice

      const session = await client.login(mockCredentials, "11111111111");

      expect(session.partitaIva).toBe("11111111111");
      const bodies = fetchMock.mock.calls
        .filter((c) => String(c[0]).includes("procediWizard"))
        .map((c) => JSON.parse(c[1].body).tipoutenza);
      expect(bodies).toEqual(["incaricato", "incaricato"]);
    });

    it("Phase F: la scelta diretta rivelata dalla sonda attiva la sessione", async () => {
      // Il login di ogni giorno dopo che l'esercente ha scelto la sua P.IVA
      // diretta. Senza la sonda dentro la scoperta, qui `direct` sarebbe vuoto
      // e ogni emissione finirebbe su AdeUtenzaNotAvailableError.
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: wizardTemplateIncaricato(["11111111111"]) }),
      ); // F
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: { PIva: [{ piva: "22222222222" }] } }),
      ); // sonda
      fetchMock.mockResolvedValueOnce(mockResponse({})); // setUserChoice

      const session = await client.login(mockCredentials, "22222222222");

      expect(session.partitaIva).toBe("22222222222");
      const choice = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes("setUserChoice"),
      )!;
      expect(JSON.parse(choice[1].body)).toEqual({
        cf: "RSSMRA80A01H501A",
        pIva: "22222222222",
        tipoutenza: "meStesso",
      });
    });

    it("Phase F: una sonda che fallisce degrada, non rompe il login", async () => {
      // La sonda e' un di piu': se il portale la rifiuta restiamo con i
      // candidati che avevamo. Propagare l'errore trasformerebbe "ti offro la
      // societa' sbagliata" in "il portale non risponde" — un peggioramento.
      vi.mocked(logger.warn).mockClear();
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: wizardTemplateIncaricato(["11111111111"]) }),
      ); // F
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 500 })); // sonda

      const err = await client.login(mockCredentials).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AdeUtenzaSelectionRequiredError);
      expect(
        (err as AdeUtenzaSelectionRequiredError).candidates.map((c) => c.piva),
      ).toEqual(["11111111111"]);
      expect(
        vi
          .mocked(logger.warn)
          .mock.calls.find((c) => c[1] === "ade:mestesso_probe_failed"),
      ).toBeDefined();
    });

    it("Phase F: la sonda non precede mai l'attivazione di un incarico", async () => {
      // Invariante: dopo la sonda la persona dichiarata lato server e'
      // `meStesso`, e non rigiochiamo mai un incarico sopra. Una scelta che
      // non corrisponde a niente si ferma qui, senza toccare il wizard.
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: wizardTemplateIncaricato(["11111111111"]) }),
      ); // F
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: { PIva: [{ piva: "22222222222" }] } }),
      ); // sonda

      await expect(
        client.login(mockCredentials, "99999999999"),
      ).rejects.toThrow(AdeUtenzaNotAvailableError);

      const tipi = fetchMock.mock.calls
        .filter((c) => String(c[0]).includes("procediWizard"))
        .map((c) => JSON.parse(c[1].body).tipoutenza);
      expect(tipi).toEqual(["meStesso"]);
    });

    it("Phase F: una P.IVA presente in entrambe le personae si offre una volta sola", async () => {
      // Le due liste sono indipendenti e niente garantisce che siano disgiunte.
      // Offrire due volte lo stesso numero con due etichette diverse chiede
      // all'utente di distinguere due cose identiche — e la scelta e'
      // irreversibile. Vince `diretta`: e' la propria, non quella di un terzo.
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: wizardTemplateIncaricato(["11111111111", "22222222222"]),
        }),
      ); // F
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: { PIva: [{ piva: "22222222222" }] } }),
      ); // sonda: la seconda e' anche sua

      const err = await client.login(mockCredentials).catch((e: unknown) => e);

      expect((err as AdeUtenzaSelectionRequiredError).candidates).toEqual([
        { piva: "22222222222", provenienza: "diretta" },
        { piva: "11111111111", provenienza: "incarico" },
      ]);
    });

    it("Phase F: zero candidati anche dopo la sonda resta AdeNoPartitaIvaError", async () => {
      vi.mocked(logger.warn).mockClear();
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: { cfUidUltimo: "RSSMRA80A01H501A" } }),
      ); // F
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: { messaggio: "nessuna partita IVA" } }),
      ); // sonda

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdeNoPartitaIvaError,
      );

      expect(
        vi
          .mocked(logger.warn)
          .mock.calls.find((c) => c[1] === "ade:wizard_piva_missing"),
      ).toBeDefined();
    });

    it("Phase F: senza selezione e con incarichi lancia AdeUtenzaSelectionRequiredError", async () => {
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: wizardTemplateIncaricato(["11111111111", "22222222222"]),
        }),
      ); // F

      const err = await client.login(mockCredentials).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AdeUtenzaSelectionRequiredError);
      // L'errore trasporta la lista: è quello che il picker consumerà (slice 3).
      expect(
        (err as AdeUtenzaSelectionRequiredError).candidates.map((i) => i.piva),
      ).toEqual(["11111111111", "22222222222"]);
      // Non è AdeNoPartitaIvaError: una P.IVA c'è, va solo scelta.
      expect(err).not.toBeInstanceOf(AdeNoPartitaIvaError);
    });

    it("Phase F: nessun PIva e nessun incarico resta AdeNoPartitaIvaError", async () => {
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: { cfUidUltimo: "RSSMRA80A01H501A", soloPerMe: false },
        }),
      ); // F

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdeNoPartitaIvaError,
      );
    });

    it("utenza incaricato: due procediWizard poi setUserChoice con il body incaricato", async () => {
      const wizard = wizardTemplateIncaricato(["11111111111", "22222222222"]);
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(mockResponse({ body: wizard })); // F
      fetchMock.mockResolvedValueOnce(mockResponse({ body: wizard })); // procediWizard 1
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: {
            ...wizard,
            PIva: [{ piva: "22222222222", denominazione: "ACME SRL" }],
          },
        }),
      ); // procediWizard 2
      fetchMock.mockResolvedValueOnce(mockResponse({})); // setUserChoice

      const session = await client.login(mockCredentials, "22222222222");

      expect(session.partitaIva).toBe("22222222222");

      const calls = fetchMock.mock.calls;
      const procedi = calls.filter((c) =>
        String(c[0]).includes("procediWizard"),
      );
      expect(procedi).toHaveLength(2);

      // Passo 1: solo il tipoutenza (HAR.md #18.2).
      expect(JSON.parse(procedi[0][1].body)).toEqual({
        tipoutenza: "incaricato",
      });

      // Passo 2: incaricante serializzato come STRINGA JSON annidata (HAR.md #18.3).
      const step2 = JSON.parse(procedi[1][1].body);
      expect(step2.tipoincaricante).toBe("incaricoDiretto");
      expect(step2.pIva).toBeNull();
      expect(typeof step2.incaricante).toBe("string");
      expect(JSON.parse(step2.incaricante)).toEqual(
        incaricoEntry("22222222222"),
      );

      // setUserChoice: niente campo pIva, cf porta la P.IVA della società.
      const choice = calls.find((c) => String(c[0]).includes("setUserChoice"))!;
      const body = JSON.parse(choice[1].body);
      expect(body).toEqual({
        tipoutenza: "incaricato",
        incaricante: JSON.stringify(incaricoEntry("22222222222")),
        tipoincaricante: "incaricoDiretto",
        cf: "22222222222",
      });
      expect(body).not.toHaveProperty("pIva");
    });

    it("utenza incaricato: una P.IVA non più fra gli incarichi è una delega revocata", async () => {
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: wizardTemplateIncaricato(["11111111111"]) }),
      ); // F

      const err = await client
        .login(mockCredentials, "99999999999")
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AdeUtenzaNotAvailableError);
      expect((err as AdeUtenzaNotAvailableError).piva).toBe("99999999999");
    });

    it("utenza meStesso esplicita si comporta come l'assenza di selezione", async () => {
      mockLoginSequence(fetchMock);

      const session = await client.login(mockCredentials, "12345678901");

      expect(session.partitaIva).toBe("12345678901");
      const choice = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes("setUserChoice"),
      )!;
      expect(JSON.parse(choice[1].body).tipoutenza).toBe("meStesso");
    });

    it("Phase F: scarta le entry di incarico senza P.IVA leggibile", async () => {
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: {
            cfUidUltimo: "RSSMRA80A01H501A",
            richiestaIncarichi: {
              incarichi: [
                { incaricante: { sede: "FOL" } }, // niente cf
                { incaricante: { cf: "" } }, // cf vuoto
                incaricoEntry("33333333333"), // valida
                {}, // niente incaricante
              ],
            },
          },
        }),
      ); // F

      const err = await client.login(mockCredentials).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AdeUtenzaSelectionRequiredError);
      expect(
        (err as AdeUtenzaSelectionRequiredError).candidates.map((i) => i.piva),
      ).toEqual(["33333333333"]);
    });

    it("Phase F: logga i quattro flag di persona con il loro valore", async () => {
      // I flag dicono quali personae l'utenza ha (HAR.md #18.1). Le chiavi
      // nude di `topLevelKeys` dicono solo che esistono: e' il **valore** che
      // distingue un'utenza con la sola persona "me stesso" da una che ne ha
      // due. Sono booleani, non sono PII, e sono l'unica cosa che ci fa capire
      // da un log cos'era l'utenza che e' finita qui.
      vi.mocked(logger.warn).mockClear();
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: {
            cfUidUltimo: "RSSMRA80A01H501A",
            soloPerMe: false,
            hasDelega: true,
            intermediario: false,
            tutore: true,
          },
        }),
      ); // F

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdeNoPartitaIvaError,
      );

      const ctx = vi
        .mocked(logger.warn)
        .mock.calls.find(
          (c) => c[1] === "ade:wizard_piva_missing",
        )![0] as Record<string, unknown>;
      expect(ctx).toMatchObject({
        soloPerMe: false,
        hasDelega: true,
        intermediario: false,
        tutore: true,
      });
    });

    it("Phase F: un flag assente o non booleano si logga null, non si inventa", async () => {
      // `false` e "il portale non l'ha mandato" sono due diagnosi diverse:
      // coercizzare il secondo nel primo cancella proprio l'informazione per
      // cui questi campi sono nel log.
      vi.mocked(logger.warn).mockClear();
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: { cfUidUltimo: "RSSMRA80A01H501A", soloPerMe: "true" },
        }),
      ); // F

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdeNoPartitaIvaError,
      );

      const ctx = vi
        .mocked(logger.warn)
        .mock.calls.find(
          (c) => c[1] === "ade:wizard_piva_missing",
        )![0] as Record<string, unknown>;
      expect(ctx.soloPerMe).toBeNull();
      expect(ctx.hasDelega).toBeNull();
      expect(ctx.intermediario).toBeNull();
      expect(ctx.tutore).toBeNull();
    });

    it("Phase F: incarichi ricevuti ma illeggibili restano un caso da diagnosticare", async () => {
      // `incarichiRawCount` > 0 con zero letti: il portale ha mandato qualcosa
      // che non sappiamo leggere. E' un problema nostro, non dell'utente, e va
      // distinto da "questa utenza non ha proprio incarichi" (`null` o 0).
      vi.mocked(logger.warn).mockClear();
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: {
            cfUidUltimo: "RSSMRA80A01H501A",
            richiestaIncarichi: {
              incarichi: [{ incaricante: { sede: "FOL" } }, {}],
            },
          },
        }),
      ); // F

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdeNoPartitaIvaError,
      );

      const call = vi
        .mocked(logger.warn)
        .mock.calls.find((c) => c[1] === "ade:wizard_piva_missing");
      expect((call![0] as Record<string, unknown>).incarichiRawCount).toBe(2);
    });

    it("Phase F: un'utenza incaricata NON logga wizard_piva_missing", async () => {
      // Il warn e' nato quando `direct.length === 0` significava fallimento
      // certo. Da quando l'accesso incaricato e' supportato quella condizione
      // e' uno stato normale, e il log ha smesso di essere diagnostico:
      // misurato in produzione il 17/09/2026, undici eventi in un giorno di cui
      // dieci da un'utenza che stava emettendo scontrini senza problemi.
      vi.mocked(logger.warn).mockClear();
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: wizardTemplateIncaricato(["33333333333"]) }),
      ); // F

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdeUtenzaSelectionRequiredError,
      );

      const call = vi
        .mocked(logger.warn)
        .mock.calls.find((c) => c[1] === "ade:wizard_piva_missing");
      expect(call).toBeUndefined();
    });

    it("Phase F: con una scelta gia' fatta il login incaricato non logga nulla", async () => {
      // Il caso piu' rumoroso: un esercente gia' onboardato su un incarico
      // rifa' il login a ogni emissione. Prima ogni sessione produceva un warn
      // su un flusso perfettamente sano.
      vi.mocked(logger.warn).mockClear();
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: wizardTemplateIncaricato(["33333333333"]) }),
      ); // F
      fetchMock.mockResolvedValueOnce(mockResponse({})); // procediWizard 1
      fetchMock.mockResolvedValueOnce(mockResponse({})); // procediWizard 2
      fetchMock.mockResolvedValueOnce(mockResponse({})); // setUserChoice

      const session = await client.login(mockCredentials, "33333333333");

      expect(session.partitaIva).toBe("33333333333");
      const call = vi
        .mocked(logger.warn)
        .mock.calls.find((c) => c[1] === "ade:wizard_piva_missing");
      expect(call).toBeUndefined();
    });

    it("Phase F: richiestaIncarichi con forma inattesa non fa lanciare un TypeError", async () => {
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: {
            cfUidUltimo: "RSSMRA80A01H501A",
            richiestaIncarichi: { incarichi: "non un array" },
          },
        }),
      ); // F

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdeNoPartitaIvaError,
      );
    });

    it("più P.IVA dirette: non si sceglie per conto dell'utente", async () => {
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: {
            cfUidUltimo: "RSSMRA80A01H501A",
            PIva: [
              { piva: "11111111111", denominazione: "ALFA SRL" },
              { piva: "22222222222", denominazione: "BETA SNC" },
            ],
          },
        }),
      ); // F

      const err = await client.login(mockCredentials).catch((e: unknown) => e);

      // Prima di questo, prendevamo PIva[0] alla cieca.
      expect(err).toBeInstanceOf(AdeUtenzaSelectionRequiredError);
      const { candidates } = err as AdeUtenzaSelectionRequiredError;
      expect(candidates).toEqual([
        {
          piva: "11111111111",
          denominazione: "ALFA SRL",
          provenienza: "diretta",
        },
        {
          piva: "22222222222",
          denominazione: "BETA SNC",
          provenienza: "diretta",
        },
      ]);
    });

    it("una sola P.IVA diretta resta il percorso silenzioso di sempre", async () => {
      mockLoginSequence(fetchMock);

      const session = await client.login(mockCredentials);

      expect(session.partitaIva).toBe("12345678901");
    });

    it("un solo incarico richiede comunque conferma esplicita", async () => {
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: wizardTemplateIncaricato(["33333333333"]) }),
      ); // F

      const err = await client.login(mockCredentials).catch((e: unknown) => e);

      // La scelta è immutabile alla prima verifica riuscita: legare un account
      // a una società per conto terzi senza conferma si ripara solo aprendone
      // un altro.
      expect(err).toBeInstanceOf(AdeUtenzaSelectionRequiredError);
      expect((err as AdeUtenzaSelectionRequiredError).candidates).toEqual([
        { piva: "33333333333", provenienza: "incarico" },
      ]);
    });

    it("una P.IVA diretta scelta usa il body meStesso, non quello incaricato", async () => {
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: {
            cfUidUltimo: "RSSMRA80A01H501A",
            PIva: [
              { piva: "11111111111", denominazione: "ALFA SRL" },
              { piva: "22222222222", denominazione: "BETA SNC" },
            ],
          },
        }),
      ); // F
      fetchMock.mockResolvedValueOnce(mockResponse({})); // setUserChoice

      const session = await client.login(mockCredentials, "22222222222");

      expect(session.partitaIva).toBe("22222222222");
      const choice = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes("setUserChoice"),
      )!;
      const body = JSON.parse(choice[1].body);
      expect(body).toEqual({
        cf: "RSSMRA80A01H501A",
        pIva: "22222222222",
        tipoutenza: "meStesso",
      });
      // Nessun giro di wizard: la P.IVA è intestata a chi accede.
      expect(
        fetchMock.mock.calls.filter((c) =>
          String(c[0]).includes("procediWizard"),
        ),
      ).toHaveLength(0);
    });

    it("una P.IVA che non è né diretta né incarico è un'utenza non più disponibile", async () => {
      mockPhasesBeforeWizard(fetchMock);
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: {
            cfUidUltimo: "RSSMRA80A01H501A",
            PIva: [{ piva: "11111111111" }],
          },
        }),
      ); // F

      await expect(
        client.login(mockCredentials, "99999999999"),
      ).rejects.toThrow(AdeUtenzaNotAvailableError);
    });

    it("Phase G: POST setUserChoice con x-appl header e body corretto", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const callG = fetchMock.mock.calls[7];
      expect(callG[0]).toContain("setUserChoice");
      expect(callG[1].method).toBe("POST");

      const body = JSON.parse(callG[1].body as string) as Record<
        string,
        string
      >;
      expect(body.cf).toBe("RSSMRA80A01H501A");
      expect(body.pIva).toBe("12345678901");
      expect(body.tipoutenza).toBe("meStesso");

      const headers = callG[1].headers as Headers;
      expect(headers.get("x-appl")).toBe("test_x_appl_token");
    });

    it("Phase G: lancia AdePortalError se setUserChoice restituisce non-200", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 200 })); // A
      fetchMock.mockResolvedValueOnce(mockResponse({})); // B
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 501 })); // B2
      fetchMock.mockResolvedValueOnce(mockResponse({})); // C
      fetchMock.mockResolvedValueOnce(
        mockResponse({ headers: [["x-appl", "tok"]] }),
      ); // E
      fetchMock.mockResolvedValueOnce(mockResponse({})); // D
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: { PIva: [{ piva: "12345678901" }] } }),
      ); // F
      // G: setUserChoice → 500
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 500 }));

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdePortalError,
      );
    });

    it("throws AdeNetworkError when fetch rejects", async () => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdeNetworkError,
      );
    });

    it("passes AbortSignal.timeout to each fetch call with the configured fetchTimeoutMs", async () => {
      const mockSignal = {} as AbortSignal;
      const timeoutSpy = vi
        .spyOn(AbortSignal, "timeout")
        .mockReturnValue(mockSignal);

      const timedClient = new RealAdeClient({ fetchTimeoutMs: 12_000 });
      mockLoginSequence(fetchMock);
      await timedClient.login(mockCredentials);

      expect(timeoutSpy).toHaveBeenCalledWith(12_000);
    });

    it("throws AdeNetworkError when fetch times out (TimeoutError)", async () => {
      const timeoutError = new DOMException(
        "The operation timed out.",
        "TimeoutError",
      );
      fetchMock.mockRejectedValueOnce(timeoutError);

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdeNetworkError,
      );
    });
  });

  // -----------------------------------------------------------------------
  // submitSale / submitVoid
  // -----------------------------------------------------------------------

  describe("submitSale", () => {
    it("sends POST with correct headers and JSON payload", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({ body: successResponse }));

      await client.submitSale(makeSalePayload());

      // Login usa 8 chiamate (Phases A-G), quindi submit è all'indice 8
      const submitCall = fetchMock.mock.calls[8];
      expect(submitCall[0]).toContain("/ser/api/documenti/v1/doc/documenti/");
      expect(submitCall[1].method).toBe("POST");

      const headers = submitCall[1].headers as Headers;
      expect(headers.get("Content-Type")).toBe(
        "application/json;charset=UTF-8",
      );
      expect(headers.get("Origin")).toContain(
        "ivaservizi.agenziaentrate.gov.it",
      );
    });

    it("returns AdeResponse on success", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({ body: successResponse }));

      const result = await client.submitSale(makeSalePayload());
      expect(result.esito).toBe(true);
      expect(result.idtrx).toBe("151085589");
      expect(result.progressivo).toBe("DCW2026/5111-2188");
    });

    // HAR.md #16b: la risposta AdE non contiene alcun timestamp, ma il footer
    // del PDF stampato ("Documento N. … del 19/08/2026 09:53:41") coincide al
    // secondo con l'header HTTP `Date`. Misurato su tre catture e due fusi.
    it("derives registeredAt from the AdE Date response header", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: successResponse,
          headers: [["Date", "Wed, 19 Aug 2026 07:53:41 GMT"]],
        }),
      );

      const result = await client.submitSale(makeSalePayload());
      expect(result.registeredAt).toBe("2026-08-19T07:53:41.000Z");
    });

    // Il timestamp è un di più diagnostico: un header assente non deve mai
    // trasformare una POST fiscale andata a buon fine in un errore.
    it("leaves registeredAt undefined when the Date header is missing", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({ body: successResponse }));

      const result = await client.submitSale(makeSalePayload());
      expect(result.esito).toBe(true);
      expect(result.registeredAt).toBeUndefined();
    });

    it("leaves registeredAt undefined when the Date header is unparsable", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: successResponse,
          headers: [["Date", "not-a-date"]],
        }),
      );

      const result = await client.submitSale(makeSalePayload());
      expect(result.esito).toBe(true);
      expect(result.registeredAt).toBeUndefined();
    });

    // Un rifiuto logico arriva come HTTP 200 esito:false: il documento NON
    // esiste su AdE, quindi non c'è nulla da datare.
    it("leaves registeredAt undefined when AdE rejects the document", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: {
            esito: false,
            idtrx: null,
            progressivo: null,
            errori: [{ codice: "001", descrizione: "Rifiutato" }],
          },
          headers: [["Date", "Wed, 19 Aug 2026 07:53:41 GMT"]],
        }),
      );

      const result = await client.submitSale(makeSalePayload());
      expect(result.esito).toBe(false);
      expect(result.registeredAt).toBeUndefined();
    });

    it("retries with re-auth on 401 (skip wizardTemplate, usa P.IVA nota)", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      // First attempt: 401
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 }));

      // Re-auth: 6 chiamate (Phase F wizardTemplate skippata — pIva già nota)
      mockReAuthSequence(fetchMock);

      // Retry: success
      fetchMock.mockResolvedValueOnce(mockResponse({ body: successResponse }));

      const result = await client.submitSale(makeSalePayload());
      expect(result.esito).toBe(true);
    });

    it("re-auth con utenza incaricato NON salta wizardTemplate e rigioca la scelta", async () => {
      const wizard = wizardTemplateIncaricato(["22222222222"]);
      const queueIncaricatoLogin = () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ body: wizard })); // F
        fetchMock.mockResolvedValueOnce(mockResponse({ body: wizard })); // procedi 1
        fetchMock.mockResolvedValueOnce(
          mockResponse({
            body: { ...wizard, PIva: [{ piva: "22222222222" }] },
          }),
        ); // procedi 2
        fetchMock.mockResolvedValueOnce(mockResponse({})); // setUserChoice
      };

      mockPhasesBeforeWizard(fetchMock);
      queueIncaricatoLogin();
      await client.login(mockCredentials, "22222222222");

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 })); // submit → 401
      mockPhasesBeforeWizard(fetchMock); // A-E + D del re-auth
      queueIncaricatoLogin(); // F + wizard: NON skippati
      fetchMock.mockResolvedValueOnce(mockResponse({ body: successResponse }));

      const result = await client.submitSale(makeSalePayload());

      expect(result.esito).toBe(true);
      // Il payload opaco dell'incarico vive solo nella lista viva: saltare
      // Phase F al re-auth renderebbe la scelta irriproducibile.
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.filter((u) => u.includes("wizardTemplate"))).toHaveLength(1);
      expect(urls.filter((u) => u.includes("procediWizard"))).toHaveLength(2);
    });

    it("throws AdeSessionExpiredError when retry also returns 401", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      // First attempt: 401
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 }));

      // Re-auth: 6 chiamate
      mockReAuthSequence(fetchMock);

      // Retry: still 401
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 }));

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        AdeSessionExpiredError,
      );
    });

    it("clearCredentials disables 401 re-auth → AdeSessionExpiredError (PR #624)", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      // La cache azzera le credenziali a fine operazione: senza credenziali un
      // 401 non può re-autenticare e deve fallire pulito (no garbage retry).
      client.clearCredentials();

      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 }));

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        AdeSessionExpiredError,
      );
    });

    it("setCredentials restores 401 re-auth without re-login (PR #624)", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      // Simula il ciclo cache: scrub a fine op, re-inject prima della successiva.
      client.clearCredentials();
      client.setCredentials(mockCredentials);

      // First attempt: 401 → re-auth (6 chiamate) → retry success
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 }));
      mockReAuthSequence(fetchMock);
      fetchMock.mockResolvedValueOnce(mockResponse({ body: successResponse }));

      const result = await client.submitSale(makeSalePayload());
      expect(result.esito).toBe(true);
    });

    it("il ciclo della cache (clear + set) non perde l'utenza scelta", async () => {
      // La cache azzera le credenziali a fine operazione e le re-inietta prima
      // della successiva: `utenzaPiva` NON è un segreto e deve sopravvivere a
      // quel giro, altrimenti il re-auth su 401 riaprirebbe la scelta davanti a
      // nessuno (regressione v1.8.4, HAR.md #18).
      const wizard = wizardTemplateIncaricato(["22222222222"]);
      const queueIncaricatoLogin = () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ body: wizard })); // F
        fetchMock.mockResolvedValueOnce(mockResponse({ body: wizard })); // procedi 1
        fetchMock.mockResolvedValueOnce(
          mockResponse({
            body: { ...wizard, PIva: [{ piva: "22222222222" }] },
          }),
        ); // procedi 2
        fetchMock.mockResolvedValueOnce(mockResponse({})); // setUserChoice
      };

      mockPhasesBeforeWizard(fetchMock);
      queueIncaricatoLogin();
      await client.login(mockCredentials, "22222222222");

      client.clearCredentials();
      client.setCredentials(mockCredentials);

      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 }));
      mockPhasesBeforeWizard(fetchMock);
      queueIncaricatoLogin();
      fetchMock.mockResolvedValueOnce(mockResponse({ body: successResponse }));

      const result = await client.submitSale(makeSalePayload());

      expect(result.esito).toBe(true);
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.filter((u) => u.includes("procediWizard"))).toHaveLength(2);
    });

    // -------------------------------------------------------------------
    // SCONTRINOZERO-M: la sessione morta segnalata come 4xx non-JSON
    // -------------------------------------------------------------------
    //
    // Evidenza produzione (2026-09-12, log del container): sessione CIE creata
    // alle 12:15:41, submit alle 16:36:04 → 405 con `text/html` e body vuoto.
    // 24 secondi dopo l'utente ri-collega e i tre scontrini successivi passano.
    // L'API REST del DCO risponde sempre JSON: un 4xx non-JSON viene da un
    // gateway davanti all'app, cioè la sessione non è più instradata.

    it("re-autentica e ritenta su 405 non-JSON quando ha le credenziali (SCONTRINOZERO-M)", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 405,
          headers: [["Content-Type", "text/html;charset=UTF-8"]],
        }),
      );
      mockReAuthSequence(fetchMock);
      fetchMock.mockResolvedValueOnce(mockResponse({ body: successResponse }));

      const result = await client.submitSale(makeSalePayload());
      expect(result.esito).toBe(true);
    });

    it("lancia AdeSessionExpiredError su 405 non-JSON senza credenziali (ramo CIE/SPID)", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      // CIE e SPID non tengono segreti riusabili: `loginCie` azzera
      // `credentials`, e la cache Fisconline fa lo stesso a fine operazione.
      // È lo scenario osservato in produzione: lo store interattivo traduce
      // questo errore in AdeReauthRequiredError e l'utente ri-collega.
      client.clearCredentials();

      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 405,
          headers: [["Content-Type", "text/html;charset=UTF-8"]],
        }),
      );

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        AdeSessionExpiredError,
      );
    });

    it("logga ade:submit_session_not_active con status e content-type", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);
      client.clearCredentials();

      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 405,
          headers: [["Content-Type", "text/html;charset=UTF-8"]],
        }),
      );

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        AdeSessionExpiredError,
      );

      // Senza questo log il caso sparisce dai radar: il ramo di re-auth
      // consuma la risposta e `ade:submit_failed` non viene mai raggiunto.
      expect(logger.warn).toHaveBeenCalledWith(
        {
          statusCode: 405,
          contentType: "text/html;charset=UTF-8",
          endpoint: "/ser/api/documenti/v1/doc/documenti/",
        },
        "ade:submit_session_not_active",
      );
    });

    it("classifica sul body, non sul Content-Type: 4xx con body vuoto e nessun header", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);
      client.clearCredentials();

      // Nessun Content-Type e body vuoto: non apre con `{` né `[`, quindi non
      // viene dall'API REST.
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 403 }));

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        AdeSessionExpiredError,
      );
    });

    it("un 4xx con body JSON ma senza Content-Type resta un rifiuto AdE", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      const callsBefore = fetchMock.mock.calls.length;
      // Il contrario del test sopra: l'header manca ma il body è JSON. È la
      // ragione per cui il discriminante è il body — un header sciatto su un
      // rifiuto vero manderebbe l'utente in una re-auth che non serve.
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 400,
          body: { esito: false, errori: [{ codice: "E400" }] },
        }),
      );

      await expect(client.submitSale(makeSalePayload())).rejects.toMatchObject({
        code: "ADE_PORTAL_ERROR",
        statusCode: 400,
      });
      expect(fetchMock.mock.calls).toHaveLength(callsBefore + 1);
    });

    it("un body JSON più lungo dell'estratto non viene scambiato per non-JSON", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      const callsBefore = fetchMock.mock.calls.length;
      // >2048 char: un JSON.parse sull'estratto troncato fallirebbe e lo
      // classificherebbe come sessione morta. Lo sniff del primo carattere no.
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 400,
          body: { errori: [{ codice: "E400", descrizione: "x".repeat(4096) }] },
          headers: [["Content-Type", "application/json;charset=UTF-8"]],
        }),
      );

      await expect(client.submitSale(makeSalePayload())).rejects.toMatchObject({
        code: "ADE_PORTAL_ERROR",
        statusCode: 400,
      });
      expect(fetchMock.mock.calls).toHaveLength(callsBefore + 1);
    });

    it("un 405 che persiste dopo la re-auth risale come AdePortalError", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      const dead = () =>
        mockResponse({
          status: 405,
          headers: [["Content-Type", "text/html;charset=UTF-8"]],
        });

      fetchMock.mockResolvedValueOnce(dead());
      mockReAuthSequence(fetchMock);
      fetchMock.mockResolvedValueOnce(dead());

      // Non era la sessione: l'errore deve restare visibile (Sentry), non
      // trasformarsi in un invito a ri-collegarsi che non risolverebbe nulla.
      await expect(client.submitSale(makeSalePayload())).rejects.toMatchObject({
        code: "ADE_PORTAL_ERROR",
        statusCode: 405,
      });
    });

    it("NON re-autentica su un 4xx con body JSON (rifiuto vero dell'AdE)", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      const callsBefore = fetchMock.mock.calls.length;
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 400,
          body: { esito: false, errori: [{ codice: "E001" }] },
          headers: [["Content-Type", "application/json;charset=UTF-8"]],
        }),
      );

      await expect(client.submitSale(makeSalePayload())).rejects.toMatchObject({
        code: "ADE_PORTAL_ERROR",
        statusCode: 400,
      });
      // Una sola chiamata: nessuna re-auth sprecata su un errore di payload.
      expect(fetchMock.mock.calls).toHaveLength(callsBefore + 1);
    });

    it("NON tratta come sessione morta un 5xx con pagina HTML (resta transient)", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      const callsBefore = fetchMock.mock.calls.length;
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 503,
          body: "<html><body>Manutenzione</body></html>",
          headers: [["Content-Type", "text/html;charset=UTF-8"]],
        }),
      );

      // Un 5xx è già transient (isTransientAdeError): la riga resta PENDING e
      // il recovery riconcilia. Degradarlo a "ri-collegati" perderebbe quella
      // semantica e chiederebbe all'utente di rifare un login che è a posto.
      await expect(client.submitSale(makeSalePayload())).rejects.toMatchObject({
        code: "ADE_PORTAL_ERROR",
        statusCode: 503,
      });
      expect(fetchMock.mock.calls).toHaveLength(callsBefore + 1);
    });

    it("throws AdePortalError on non-401 error status", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({ status: 500 }));

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        AdePortalError,
      );
    });

    it("logs response body excerpt and content-type when AdE returns 500 with JSON", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      const adeErrorBody = {
        esito: false,
        errori: [{ codice: "E001", descrizione: "Documento non annullabile" }],
      };
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 500,
          body: adeErrorBody,
          headers: [["Content-Type", "application/json;charset=UTF-8"]],
        }),
      );

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        AdePortalError,
      );

      // SCONTRINOZERO-G: i 5xx AdE sono loggati a warn (non error): la
      // decisione Sentry è centralizzata nel caller via logAdeFailure
      // (5xx → transient → fuori da Sentry).
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          contentType: "application/json;charset=UTF-8",
          bodyExcerpt: JSON.stringify(adeErrorBody),
          endpoint: "/ser/api/documenti/v1/doc/documenti/",
        }),
        "ade:submit_failed",
      );
    });

    it("logs body excerpt when AdE returns 500 with HTML/plain text body", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      const htmlBody =
        "<html><body><h1>Internal Server Error</h1><p>Generic AdE failure</p></body></html>";
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 500,
          body: htmlBody,
          headers: [["Content-Type", "text/html; charset=UTF-8"]],
        }),
      );

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        AdePortalError,
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          contentType: "text/html; charset=UTF-8",
          bodyExcerpt: htmlBody,
        }),
        "ade:submit_failed",
      );
    });

    it("truncates body excerpt to 2048 chars when body is large", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      const largeBody = "x".repeat(5000);
      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 500, body: largeBody }),
      );

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        AdePortalError,
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          bodyExcerpt: "x".repeat(2048),
        }),
        "ade:submit_failed",
      );
    });

    it("logs at warn level (not error) for 4xx responses", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 400,
          body: { errori: [{ codice: "E400", descrizione: "Bad payload" }] },
        }),
      );

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        AdePortalError,
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
        }),
        "ade:submit_failed",
      );
    });

    it("throws AdeUnknownOutcomeError on 200 with a non-JSON body (unknown outcome, PR #733)", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      // AdE serve una pagina di manutenzione HTML con status 200: la POST è
      // stata consegnata, l'esito è ignoto. Non è una failure definitiva.
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: "<html><body>Manutenzione in corso</body></html>",
          headers: [["Content-Type", "text/html; charset=UTF-8"]],
        }),
      );

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        AdeUnknownOutcomeError,
      );
    });

    it("logs the unknown-outcome at warn with status/content-type but never the body", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: "<html>fiscal data must not leak</html>",
          headers: [["Content-Type", "text/html; charset=UTF-8"]],
        }),
      );

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        AdeUnknownOutcomeError,
      );

      expect(logger.warn).toHaveBeenCalledWith(
        {
          statusCode: 200,
          contentType: "text/html; charset=UTF-8",
          endpoint: "/ser/api/documenti/v1/doc/documenti/",
        },
        "ade:submit_non_json_success",
      );
      // Il body non deve mai finire in nessun log (dati fiscali).
      const loggedNonJson = (logger.warn as ReturnType<typeof vi.fn>).mock.calls
        .map(([ctx]) => JSON.stringify(ctx))
        .join("");
      expect(loggedNonJson).not.toContain("fiscal data must not leak");
    });

    it("exposes the status code on the error for an empty (non-JSON) 200 body", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      // Body vuoto con status 200: json() fallisce comunque → esito ignoto.
      fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));

      await expect(client.submitSale(makeSalePayload())).rejects.toMatchObject({
        code: "ADE_UNKNOWN_OUTCOME",
        statusCode: 200,
      });
    });

    it("throws if not logged in", async () => {
      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        "Not logged in",
      );
    });
  });

  describe("submitReturn", () => {
    // Stessa POST di vendita e annullo (HAR.md #19a): il reso è un documento
    // del portale come gli altri, cambia solo il payload.
    it("sends POST and returns AdeResponse with registeredAt", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: successResponse,
          headers: [["Date", "Fri, 02 Oct 2026 14:15:16 GMT"]],
        }),
      );

      const result = await client.submitReturn(makeSalePayload());
      expect(result.esito).toBe(true);
      expect(result.registeredAt).toBe("2026-10-02T14:15:16.000Z");
      const [url, init] = fetchMock.mock.calls.at(-1)!;
      expect(String(url)).toContain("/ser/api/documenti/v1/doc/documenti/");
      expect(init.method).toBe("POST");
    });

    it("throws if not logged in", async () => {
      await expect(client.submitReturn(makeSalePayload())).rejects.toThrow(
        "Not logged in",
      );
    });
  });

  describe("submitVoid", () => {
    it("sends POST and returns AdeResponse", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({ body: successResponse }));

      const result = await client.submitVoid(makeSalePayload());
      expect(result.esito).toBe(true);
    });

    // È il timestamp che finisce nel footer della ricevuta di annullamento
    // (v1.7.0, HAR.md #16a/#16b).
    it("derives registeredAt from the AdE Date response header", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: successResponse,
          headers: [["Date", "Tue, 18 Aug 2026 17:06:02 GMT"]],
        }),
      );

      const result = await client.submitVoid(makeSalePayload());
      expect(result.registeredAt).toBe("2026-08-18T17:06:02.000Z");
    });

    it("throws if not logged in", async () => {
      await expect(client.submitVoid(makeSalePayload())).rejects.toThrow(
        "Not logged in",
      );
    });
  });

  // -----------------------------------------------------------------------
  // getFiscalData
  // -----------------------------------------------------------------------

  describe("getFiscalData", () => {
    it("sends GET and returns parsed JSON", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      const fiscalData = {
        identificativiFiscali: {
          codicePaese: "IT",
          partitaIva: "12345678901",
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

      fetchMock.mockResolvedValueOnce(mockResponse({ body: fiscalData }));

      const result = await client.getFiscalData();
      expect(result.identificativiFiscali.partitaIva).toBe("12345678901");
    });

    it("throws AdePortalError on non-200", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({ status: 500 }));

      await expect(client.getFiscalData()).rejects.toThrow(AdePortalError);
    });

    it("throws AdePortalError (not a nude SyntaxError) on 200 with non-JSON body", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      // 200 con pagina HTML: nessuna semantica unknown-outcome su una lettura,
      // solo un errore tipizzato invece del SyntaxError opaco (PR #733).
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: "<html>maintenance</html>",
          headers: [["Content-Type", "text/html"]],
        }),
      );

      const err = await client.getFiscalData().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AdePortalError);
      expect(err).not.toBeInstanceOf(SyntaxError);
    });

    it("throws if not logged in", async () => {
      await expect(client.getFiscalData()).rejects.toThrow("Not logged in");
    });
  });

  // -----------------------------------------------------------------------
  // getProducts
  // -----------------------------------------------------------------------

  describe("getProducts", () => {
    it("sends GET and returns the parsed product catalog", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      const catalog = [
        {
          id: 438167,
          descrizioneProdotto: "Caffè",
          prezzoUnitario: "100",
          prezzoLordo: "100",
          aliquotaIVA: "N2",
        },
      ];
      fetchMock.mockResolvedValueOnce(mockResponse({ body: catalog }));

      const result = await client.getProducts();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(438167);
      expect(result[0].descrizioneProdotto).toBe("Caffè");
    });

    it("throws AdePortalError on non-200", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({ status: 500 }));

      await expect(client.getProducts()).rejects.toThrow(AdePortalError);
    });

    it("throws AdePortalError on 200 with non-JSON body", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 200, body: "<html>maintenance</html>" }),
      );

      await expect(client.getProducts()).rejects.toThrow(AdePortalError);
    });

    it("throws if not logged in", async () => {
      await expect(client.getProducts()).rejects.toThrow("Not logged in");
    });
  });

  // -----------------------------------------------------------------------
  // getDocument
  // -----------------------------------------------------------------------

  describe("getDocument", () => {
    it("sends GET to correct URL and returns parsed document", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      const mockDoc = {
        idtrx: "151085589",
        documentoCommerciale: {
          cfCessionarioCommittente: "",
          flagDocCommPerRegalo: false,
          progressivoCollegato: "",
          dataOra: "15/02/2026",
          multiAttivita: { codiceAttivita: "", descAttivita: "" },
          importoTotaleIva: "2.20000000",
          scontoTotale: "0.00000000",
          scontoTotaleLordo: "0.00000000",
          totaleImponibile: "10.00000000",
          ammontareComplessivo: "12.20000000",
          totaleNonRiscosso: "0.00000000",
          scontoAbbuono: "0.00",
          importoDetraibileDeducibile: "0.00000000",
          numeroProgressivo: "DCW2026/5111-2188",
          elementiContabili: [
            {
              idElementoContabile: "270270040",
              resiPregressi: "0.00",
              reso: "0.00",
              quantita: "1.00",
              descrizioneProdotto: "Prodotto",
              prezzoLordo: "12.20000000",
              prezzoUnitario: "10.00000000",
              scontoUnitario: "0.00000000",
              scontoLordo: "0.00000000",
              aliquotaIVA: "22",
              importoIVA: "2.20000000",
              imponibile: "10.00000000",
              imponibileNetto: "10.00000000",
              totale: "12.20000000",
              omaggio: "N",
            },
          ],
        },
      };

      fetchMock.mockResolvedValueOnce(mockResponse({ body: mockDoc }));

      const result = await client.getDocument("151085589");

      // URL corretto: /documenti/{idtrx}/
      const call = fetchMock.mock.calls[8];
      expect(call[0]).toContain(
        "/ser/api/documenti/v1/doc/documenti/151085589/",
      );

      expect(result.idtrx).toBe("151085589");
      expect(
        result.documentoCommerciale.elementiContabili[0].idElementoContabile,
      ).toBe("270270040");
      expect(result.documentoCommerciale.totaleImponibile).toBe("10.00000000");
    });

    it("throws AdePortalError on non-200", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({ status: 404 }));

      await expect(client.getDocument("999")).rejects.toThrow(AdePortalError);
    });

    it("throws AdePortalError on 200 with non-JSON body", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 200, body: "<html>not json</html>" }),
      );

      await expect(client.getDocument("999")).rejects.toThrow(AdePortalError);
    });

    it("throws if not logged in", async () => {
      await expect(client.getDocument("123")).rejects.toThrow("Not logged in");
    });
  });

  // -----------------------------------------------------------------------
  // searchDocuments
  // -----------------------------------------------------------------------

  describe("searchDocuments", () => {
    it("sends GET with dataDal/dataInvioAl + page/pages/perPage/start/v params and returns list", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      // Shape reale (ricerca.har): ammontareComplessivo number, data
      // DD/MM/YYYY HH:MM:SS, annulli string.
      const mockList = {
        totalCount: 1,
        elencoRisultati: [
          {
            idtrx: "151085589",
            numeroProgressivo: "DCW2026/5111-2188",
            cfCliente: "YYWLR30G",
            data: "15/02/2026 10:06:14",
            tipoOperazione: "V",
            ammontareComplessivo: 12.2,
            annulli: "A",
          },
        ],
      };

      fetchMock.mockResolvedValueOnce(mockResponse({ body: mockList }));

      const result = await client.searchDocuments({
        dataDal: "02/15/2026",
        dataInvioAl: "02/15/2026",
        page: 1,
        perPage: 10,
      });

      // HAR fix (ricerca.har): URL con query string completa (regola 14)
      const call = fetchMock.mock.calls[8];
      expect(call[0]).toContain("/ser/api/documenti/v1/doc/documenti/");
      expect(call[0]).toContain("dataDal=");
      expect(call[0]).toContain("02%2F15%2F2026");
      expect(call[0]).toContain("page=1");
      expect(call[0]).toContain("pages=0");
      expect(call[0]).toContain("perPage=10");
      expect(call[0]).toContain("start=1");
      expect(call[0]).toMatch(/[?&]v=\d+/);

      expect(result.totalCount).toBe(1);
      expect(result.elencoRisultati).toHaveLength(1);
      expect(result.elencoRisultati[0].idtrx).toBe("151085589");
      expect(result.elencoRisultati[0].ammontareComplessivo).toBe(12.2);
      expect(result.elencoRisultati[0].annulli).toBe("A");
    });

    it("sends GET with numeroProgressivo param + default page/pages/perPage/start/v", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: { totalCount: 1, elencoRisultati: [] } }),
      );

      await client.searchDocuments({
        numeroProgressivo: "DCW2026/5111-2188",
        tipoOperazione: "V",
      });

      // HAR fix (ricerca.har [01]): ricerca per progressivo
      const call = fetchMock.mock.calls[8];
      expect(call[0]).toContain("numeroProgressivo=");
      expect(call[0]).toContain("tipoOperazione=V");
      expect(call[0]).toContain("page=1");
      expect(call[0]).toContain("pages=0");
      expect(call[0]).toContain("perPage=10");
      expect(call[0]).toContain("start=1");
      expect(call[0]).toMatch(/[?&]v=\d+/);
    });

    it("throws AdePortalError on non-200", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({ status: 500 }));

      await expect(client.searchDocuments({})).rejects.toThrow(AdePortalError);
    });

    it("throws AdePortalError on 200 with non-JSON body", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 200, body: "<html>maintenance</html>" }),
      );

      await expect(client.searchDocuments({})).rejects.toThrow(AdePortalError);
    });

    it("throws if not logged in", async () => {
      await expect(client.searchDocuments({})).rejects.toThrow("Not logged in");
    });
  });

  // -----------------------------------------------------------------------
  // logout
  // -----------------------------------------------------------------------

  describe("changePasswordFisconline", () => {
    const mockParams = {
      codiceFiscale: "RSSMRA80A01H501A",
      oldPassword: "OldPass123",
      newPassword: "NewPass456",
      confirmNewPassword: "NewPass456",
    };

    it("POST al corretto URL con form fields (user/oldpw/newpw/newpwf)", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: "Cambio password effettuato con successo." }),
      );

      await client.changePasswordFisconline(mockParams);

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(
        "telematici.agenziaentrate.gov.it/Abilitazione/CambioPassword/CambioPassword.do",
      );
      expect(url).toContain(`userCP=${mockParams.codiceFiscale}`);
      expect(opts.method).toBe("POST");
      const body = opts.body as string;
      expect(body).toContain(`user=${mockParams.codiceFiscale}`);
      expect(body).toContain(`oldpw=${mockParams.oldPassword}`);
      expect(body).toContain(`newpw=${mockParams.newPassword}`);
      expect(body).toContain(`newpwf=${mockParams.confirmNewPassword}`);
    });

    it("risolve void quando la risposta HTML contiene la stringa di successo", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: "Cambio password effettuato con successo." }),
      );

      await expect(
        client.changePasswordFisconline(mockParams),
      ).resolves.toBeUndefined();
    });

    it("lancia AdeAuthError quando la password attuale è errata", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: "L'utente non risulta associato alla password indicata oppure la password non è scaduta.",
        }),
      );

      await expect(client.changePasswordFisconline(mockParams)).rejects.toThrow(
        AdeAuthError,
      );
    });

    it("lancia AdeError ADE_CHANGE_PW_MISMATCH quando nuova != conferma", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: "Inserire la stessa password nel campo di conferma.",
        }),
      );

      const err = await client
        .changePasswordFisconline(mockParams)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AdeError);
      expect((err as AdeError).code).toBe("ADE_CHANGE_PW_MISMATCH");
    });

    it("lancia AdeError ADE_CHANGE_PW_SAME quando nuova == attuale", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: "La nuova password non puo' essere uguale a quella attuale.",
        }),
      );

      const err = await client
        .changePasswordFisconline(mockParams)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AdeError);
      expect((err as AdeError).code).toBe("ADE_CHANGE_PW_SAME");
    });

    it("lancia AdePortalError se la risposta HTTP non è 200", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 500, body: "" }));

      await expect(client.changePasswordFisconline(mockParams)).rejects.toThrow(
        AdePortalError,
      );
    });

    it("lancia AdePortalError se la risposta HTML è inattesa", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: "Risposta completamente inattesa dal portale." }),
      );

      await expect(client.changePasswordFisconline(mockParams)).rejects.toThrow(
        AdePortalError,
      );
    });
  });

  describe("adoptSession", () => {
    const COOKIES = "JSESSIONID=abc; LtpaToken2=xyz";
    const fiscali = {
      identificativiFiscali: { partitaIva: "12345678901" },
    };

    it("carica i cookie, legge la P.IVA da dati/fiscali e restituisce la sessione", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ body: fiscali }));

      const session = await client.adoptSession(COOKIES);

      expect(session.partitaIva).toBe("12345678901");
      expect(session.pAuth).toBe("");
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain("/ser/api/documenti/v1/doc/documenti/dati/fiscali");
      expect((init.headers as Headers).get("Cookie")).toBe(COOKIES);
      // Un redirect al login non va seguito: sarebbe un 200 HTML
      expect(init.redirect).toBe("manual");
    });

    it("restituisce i dati fiscali letti: la verifica non rifà la GET", async () => {
      const body = {
        identificativiFiscali: {
          codicePaese: "IT",
          partitaIva: "12345678901",
          codiceFiscale: "RSSMRA80A01H501U",
        },
        altriDatiIdentificativi: { denominazione: "Bar Rossi" },
        multiAttivita: [],
        multiSede: [],
      };
      fetchMock.mockResolvedValueOnce(mockResponse({ body }));

      const { fiscalData } = await client.adoptSession(COOKIES);

      expect(fiscalData).toEqual(body);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("dopo l'adozione emette con gli stessi cookie, senza login", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ body: fiscali }));
      await client.adoptSession(COOKIES);
      fetchMock.mockResolvedValueOnce(mockResponse({ body: successResponse }));

      const result = await client.submitSale(makeSalePayload());

      expect(result.esito).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [, init] = fetchMock.mock.calls[1];
      expect((init.headers as Headers).get("Cookie")).toBe(COOKIES);
    });

    it("su 401 in emissione non tenta il re-login: nessuna credenziale da riusare", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ body: fiscali }));
      await client.adoptSession(COOKIES);
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 }));

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        AdeSessionExpiredError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("sostituisce la sessione e le credenziali di un login precedente", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);
      fetchMock.mockResolvedValueOnce(mockResponse({ body: fiscali }));
      await client.adoptSession(COOKIES);
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 }));

      // Con le credenziali Fisconline ancora in memoria rifarebbe il login
      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        AdeSessionExpiredError,
      );
      const adoptCall = fetchMock.mock.calls[8];
      expect((adoptCall[1].headers as Headers).get("Cookie")).toBe(COOKIES);
    });

    it.each([401, 302])(
      "HTTP %i da dati/fiscali: sessione non accettata, nessuna sessione",
      async (status) => {
        fetchMock.mockResolvedValueOnce(
          mockResponse({ status, location: "https://iampe.example/login" }),
        );

        await expect(client.adoptSession(COOKIES)).rejects.toThrow(
          AdeSessionExpiredError,
        );
        await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
          "Not logged in",
        );
      },
    );

    it("un 5xx da dati/fiscali risale come AdePortalError", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 503 }));

      await expect(client.adoptSession(COOKIES)).rejects.toThrow(
        AdePortalError,
      );
    });

    it("un 200 non-JSON risale come AdePortalError", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: "<html>login</html>" }),
      );

      await expect(client.adoptSession(COOKIES)).rejects.toThrow(
        AdePortalError,
      );
    });

    it("una risposta senza P.IVA lancia AdeNoPartitaIvaError", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: { identificativiFiscali: {} } }),
      );

      await expect(client.adoptSession(COOKIES)).rejects.toThrow(
        AdeNoPartitaIvaError,
      );
    });

    it("un header senza cookie fallisce prima di chiamare l'AdE", async () => {
      await expect(client.adoptSession("  ; ")).rejects.toThrow(/cookie/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("chiama i due endpoint iampe (best-effort)", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      // 2 logout calls: GET /sam/UI/Logout + POST /api/logout
      fetchMock.mockResolvedValueOnce(mockResponse({}));
      fetchMock.mockResolvedValueOnce(mockResponse({}));

      await client.logout();

      // 8 login (Phases A-G) + 2 logout = 10 total
      expect(fetchMock).toHaveBeenCalledTimes(10);

      const logoutCall1 = fetchMock.mock.calls[8];
      expect(logoutCall1[0]).toContain(
        "iampe.agenziaentrate.gov.it/sam/UI/Logout",
      );

      const logoutCall2 = fetchMock.mock.calls[9];
      expect(logoutCall2[0]).toContain(
        "iampe.agenziaentrate.gov.it/api/logout",
      );
      expect(logoutCall2[1].method).toBe("POST");
    });

    it("does not throw if logout URLs fail", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockRejectedValueOnce(new Error("Network error"));
      fetchMock.mockRejectedValueOnce(new Error("Network error"));

      await expect(client.logout()).resolves.toBeUndefined();
    });

    it("clears session — operations throw after logout", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({}));
      fetchMock.mockResolvedValueOnce(mockResponse({}));

      await client.logout();

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        "Not logged in",
      );
    });

    describe("sessione adottata (issue #1042)", () => {
      const COOKIES = "JSESSIONID=abc; LtpaToken2=xyz";
      const fiscali = {
        identificativiFiscali: { partitaIva: "12345678901" },
      };
      const jarSize = () =>
        (client as unknown as { cookieJar: { size: number } }).cookieJar.size;

      it("non chiama l'AdE: svuota solo sessione e cookie", async () => {
        // La sessione l'ha aperta il login SPID sul telefono, non il server.
        fetchMock.mockResolvedValueOnce(mockResponse({ body: fiscali }));
        await client.adoptSession(COOKIES);

        await client.logout();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(jarSize()).toBe(0);
        await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
          "Not logged in",
        );
      });

      it("anche dopo un'adozione fallita il logout non chiama l'AdE", async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 }));
        await expect(client.adoptSession(COOKIES)).rejects.toThrow();

        await client.logout();

        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      it("un login Fisconline sullo stesso client torna a chiudere la sessione sull'AdE", async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ body: fiscali }));
        await client.adoptSession(COOKIES);
        mockLoginSequence(fetchMock);
        await client.login(mockCredentials);
        fetchMock.mockResolvedValueOnce(mockResponse({}));
        fetchMock.mockResolvedValueOnce(mockResponse({}));

        await client.logout();

        // 1 adozione + 8 login + 2 logout
        expect(fetchMock).toHaveBeenCalledTimes(11);
        expect(fetchMock.mock.calls[9][0]).toContain(
          "iampe.agenziaentrate.gov.it/sam/UI/Logout",
        );
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Stale keep-alive socket retry (UND_ERR_SOCKET "other side closed")
//
// Incidente dev 2026-07-14 (flow onboarding-verify-cie): l'IdP chiude i socket
// keep-alive idle durante le attese intrinseche del flusso (poll push a 7s);
// undici riusa il socket morto e la fetch fallisce con
// TypeError: fetch failed → SocketError: other side closed. Un browser ritenta
// in automatico su una connessione fresca; il client deve fare lo stesso, ma
// SOLO su richieste idempotenti senza side-effect (GET/HEAD) — mai POST
// (submitSale/submitVoid: rischio doppio documento fiscale).
// ---------------------------------------------------------------------------

/** Replica la catena d'errore reale di Node fetch su socket riusato morto. */
function staleSocketFetchError(): TypeError {
  const socketError = new Error("other side closed") as Error & {
    code?: string;
  };
  socketError.name = "SocketError";
  socketError.code = "UND_ERR_SOCKET";
  return new TypeError("fetch failed", { cause: socketError });
}

describe("stale keep-alive socket retry", () => {
  let fetchMock: ReturnType<typeof vi.fn> & typeof global.fetch;
  let client: RealAdeClient;

  const fiscalDataBody = {
    identificativiFiscali: {
      codicePaese: "IT",
      partitaIva: "12345678901",
      codiceFiscale: "RSSMRA80A01H501A",
    },
  };

  beforeEach(() => {
    fetchMock = vi.fn() as ReturnType<typeof vi.fn> & typeof global.fetch;
    global.fetch = fetchMock;
    client = new RealAdeClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ritenta una GET una volta sul socket chiuso dal peer e ritorna la seconda response", async () => {
    mockLoginSequence(fetchMock);
    await client.login(mockCredentials);
    const callsAfterLogin = fetchMock.mock.calls.length;

    fetchMock.mockRejectedValueOnce(staleSocketFetchError());
    fetchMock.mockResolvedValueOnce(mockResponse({ body: fiscalDataBody }));

    const result = await client.getFiscalData();

    expect(result.identificativiFiscali.partitaIva).toBe("12345678901");
    expect(fetchMock.mock.calls).toHaveLength(callsAfterLogin + 2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "ivaservizi.agenziaentrate.gov.it",
      }),
      "ade:stale_socket_retry",
    );
  });

  it("dopo un solo retry si arrende: due failure consecutive → AdeNetworkError", async () => {
    mockLoginSequence(fetchMock);
    await client.login(mockCredentials);
    const callsAfterLogin = fetchMock.mock.calls.length;

    fetchMock.mockRejectedValueOnce(staleSocketFetchError());
    fetchMock.mockRejectedValueOnce(staleSocketFetchError());

    await expect(client.getFiscalData()).rejects.toThrow(AdeNetworkError);
    expect(fetchMock.mock.calls).toHaveLength(callsAfterLogin + 2);
  });

  it("non ritenta le POST sul socket chiuso (nessun retry su richieste con side-effect)", async () => {
    // Phase A del login Fisconline è una POST: deve fallire al primo colpo.
    fetchMock.mockRejectedValueOnce(staleSocketFetchError());

    await expect(client.login(mockCredentials)).rejects.toThrow(
      AdeNetworkError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("non ritenta una GET su errori di rete diversi dal socket chiuso", async () => {
    mockLoginSequence(fetchMock);
    await client.login(mockCredentials);
    const callsAfterLogin = fetchMock.mock.calls.length;

    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(client.getFiscalData()).rejects.toThrow(AdeNetworkError);
    expect(fetchMock.mock.calls).toHaveLength(callsAfterLogin + 1);
  });

  it("non ritenta sul timeout della fetch (TimeoutError)", async () => {
    mockLoginSequence(fetchMock);
    await client.login(mockCredentials);
    const callsAfterLogin = fetchMock.mock.calls.length;

    fetchMock.mockRejectedValueOnce(
      new DOMException("The operation timed out.", "TimeoutError"),
    );

    await expect(client.getFiscalData()).rejects.toThrow(AdeNetworkError);
    expect(fetchMock.mock.calls).toHaveLength(callsAfterLogin + 1);
  });
});

describe("isStaleSocketError", () => {
  it("riconosce il code UND_ERR_SOCKET diretto", () => {
    const err = new Error("boom") as Error & { code?: string };
    err.code = "UND_ERR_SOCKET";
    expect(isStaleSocketError(err)).toBe(true);
  });

  it("riconosce la catena reale TypeError → SocketError (cause annidata)", () => {
    expect(isStaleSocketError(staleSocketFetchError())).toBe(true);
  });

  it("riconosce il messaggio 'other side closed' anche senza code", () => {
    expect(isStaleSocketError(new Error("other side closed"))).toBe(true);
  });

  it("ritorna false per errori di rete generici", () => {
    expect(isStaleSocketError(new Error("ECONNREFUSED"))).toBe(false);
    expect(
      isStaleSocketError(new TypeError("fetch failed", { cause: undefined })),
    ).toBe(false);
  });

  it("ritorna false per input non-Error", () => {
    expect(isStaleSocketError(undefined)).toBe(false);
    expect(isStaleSocketError("other side closed")).toBe(false);
  });

  it("non entra in loop su una catena di cause circolare", () => {
    const err = new Error("boom");
    (err as Error & { cause: unknown }).cause = err;
    expect(isStaleSocketError(err)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// decodeHtmlEntities — i valori estratti dagli attributi HTML (SAMLResponse,
// form action) vanno decodificati come farebbe un browser: Shibboleth può
// codificare i non-alfanumerici come entity numeriche.
// ---------------------------------------------------------------------------

describe("decodeHtmlEntities", () => {
  it("decodifica le entity esadecimali (base64 Shibboleth: + / =)", () => {
    expect(decodeHtmlEntities("QUJD&#x2b;ZGVm&#x2f;Z2hp&#x3d;&#x3d;")).toBe(
      "QUJD+ZGVm/Z2hp==",
    );
  });

  it("decodifica le entity decimali", () => {
    expect(decodeHtmlEntities("a&#43;b&#61;c")).toBe("a+b=c");
  });

  it("decodifica le entity con nome (amp, lt, gt, quot, apos)", () => {
    expect(decodeHtmlEntities("a&lt;b&gt;c&quot;d&#39;e&apos;f&amp;g")).toBe(
      "a<b>c\"d'e'f&g",
    );
  });

  it("decodifica &amp; per ultimo (niente doppia decodifica)", () => {
    // "&amp;#x2b;" è la rappresentazione HTML del testo letterale "&#x2b;":
    // un solo passaggio di decodifica, come un browser.
    expect(decodeHtmlEntities("&amp;#x2b;")).toBe("&#x2b;");
  });

  it("lascia intatte le stringhe senza entity (base64 tipico)", () => {
    const base64 = "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4K+/==";
    expect(decodeHtmlEntities(base64)).toBe(base64);
  });

  it("lascia intatta un'entity numerica fuori range Unicode", () => {
    expect(decodeHtmlEntities("x&#x110000;y")).toBe("x&#x110000;y");
    expect(decodeHtmlEntities("x&#1114112;y")).toBe("x&#1114112;y");
  });
});

// ---------------------------------------------------------------------------
// resolveAdeRedirect (anti-SSRF)
// ---------------------------------------------------------------------------

describe("resolveAdeRedirect", () => {
  const currentUrl = "https://ivaservizi.agenziaentrate.gov.it/portale/home";

  it("ammette redirect assoluti verso host AdE consentiti (https)", () => {
    expect(
      resolveAdeRedirect(
        currentUrl,
        "https://iampe.agenziaentrate.gov.it/api/login/telematico",
      ),
    ).toBe("https://iampe.agenziaentrate.gov.it/api/login/telematico");
  });

  it("ammette redirect relativi risolvendo rispetto all'origin corrente", () => {
    expect(resolveAdeRedirect(currentUrl, "/portale/c/portal/layout")).toBe(
      "https://ivaservizi.agenziaentrate.gov.it/portale/c/portal/layout",
    );
  });

  it("ammette redirect relativo cross-domain risolvendolo sull'origin corrente (no host swap)", () => {
    // Path-only Location risolto sull'origin corrente, non su un base fisso
    const otherCurrent = "https://portale.agenziaentrate.gov.it/PortaleWeb/x";
    expect(resolveAdeRedirect(otherCurrent, "/PortaleWeb/home?to=FATBTB")).toBe(
      "https://portale.agenziaentrate.gov.it/PortaleWeb/home?to=FATBTB",
    );
  });

  it("rifiuta redirect verso host non in allowlist (potenziale SSRF)", () => {
    expect(() =>
      resolveAdeRedirect(currentUrl, "https://attacker.example.com/exfil"),
    ).toThrow(AdePortalError);
  });

  it("rifiuta redirect look-alike (subdomain attack)", () => {
    expect(() =>
      resolveAdeRedirect(
        currentUrl,
        "https://ivaservizi.agenziaentrate.gov.it.attacker.tld/x",
      ),
    ).toThrow(AdePortalError);
  });

  it("rifiuta redirect con scheme non https", () => {
    expect(() =>
      resolveAdeRedirect(
        currentUrl,
        "http://ivaservizi.agenziaentrate.gov.it/insecure",
      ),
    ).toThrow(/non-https/);
  });

  it("rifiuta redirect cross-domain assoluto verso scheme non-http (es. file://)", () => {
    expect(() => resolveAdeRedirect(currentUrl, "file:///etc/passwd")).toThrow(
      /non-https/,
    );
  });
});
