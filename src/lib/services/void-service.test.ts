// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdeReauthRequiredError } from "@/lib/ade/errors";

// --- Mocks ---

const mockFetchAdePrerequisites = vi.fn();
vi.mock("@/lib/server-auth", () => ({
  fetchAdePrerequisites: (...args: unknown[]) =>
    mockFetchAdePrerequisites(...args),
}));

// DB mock
const mockSelectLimit = vi.fn();
// `.where()` serve due chiamanti: i lookup doc usano `.limit()`, mentre
// findClaimedTransactionIds (REVIEW.md #4) awaita direttamente `.where()`.
// Il thenable risolve [] (nessun idtrx già rivendicato → il match regge).
const selectWhereResult = {
  limit: mockSelectLimit,
  then: (onFulfilled: (rows: unknown[]) => unknown) => onFulfilled([]),
};
const mockSelectWhere = vi.fn().mockReturnValue(selectWhereResult);
const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

const mockReturning = vi.fn();
const mockOnConflictDoNothing = vi
  .fn()
  .mockReturnValue({ returning: mockReturning });
const mockInsertValues = vi
  .fn()
  .mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

// claim CAS (P1.3): db.update().set().where().returning() → rows rivendicate.
// Default: claim vinto (1 riga). Override con mockResolvedValueOnce([]) per simulare
// un retry concorrente che perde la corsa.
const mockClaimReturning = vi.fn().mockResolvedValue([{ id: "void-claimed" }]);
// `.where()` è terminale per gli UPDATE post-AdE (awaited direttamente → undefined)
// ma il claim CAS vi concatena `.returning()`. Il thenable soddisfa entrambi.
const mockUpdateWhere = vi.fn().mockReturnValue({
  returning: mockClaimReturning,
  then: (onFulfilled: (value: undefined) => unknown) => onFulfilled(undefined),
});
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

// transaction: calls the callback with a tx proxy that shares mockUpdate
const mockTransaction = vi
  .fn()
  .mockImplementation(
    async (callback: (tx: { update: typeof mockUpdate }) => Promise<void>) =>
      callback({ update: mockUpdate }),
  );

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
  }),
}));

vi.mock("@/db/schema", () => ({
  commercialDocuments: "commercial-documents-table",
}));

const mockLogin = vi.fn();
const mockLogout = vi.fn();
const mockGetDocument = vi.fn();
const mockSubmitVoid = vi.fn();
// Lookup AdE pre-retry (REVIEW.md #4): default "nessun match" → il recovery
// procede col re-submit come prima. Override per-test per match/ambiguous/throw.
const mockSearchDocuments = vi
  .fn()
  .mockResolvedValue({ totalCount: 0, elencoRisultati: [] });
const mockAdeClient = {
  login: mockLogin,
  logout: mockLogout,
  getDocument: mockGetDocument,
  submitVoid: mockSubmitVoid,
  searchDocuments: mockSearchDocuments,
};
// withAdeSession (REVIEW #5) sostituisce createAdeClient + login/logout manuali.
// Il mock riproduce il ciclo mock-mode: login → fn(client) → logout nel finally,
// così le asserzioni su mockLogin/mockLogout/mockSubmitVoid restano valide.
const mockIsCieSessionMissing = vi.fn().mockReturnValue(false);
vi.mock("@/lib/ade", () => ({
  getAdeMode: () => "mock",
  isCieSessionMissing: (...args: unknown[]) => mockIsCieSessionMissing(...args),
  withAdeSession: async (
    params: { credentials: unknown },
    fn: (client: typeof mockAdeClient) => unknown,
  ) => {
    await mockAdeClient.login(params.credentials);
    try {
      return await fn(mockAdeClient);
    } finally {
      await mockAdeClient.logout();
    }
  },
}));

const mockMapVoidToAdePayload = vi.fn().mockReturnValue({ mapped: true });
vi.mock("@/lib/ade/mapper", () => ({
  mapVoidToAdePayload: (...args: unknown[]) => mockMapVoidToAdePayload(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// --- Fixtures ---

import type { VoidReceiptInput } from "@/types/storico";

const FAKE_PREREQUISITES = {
  codiceFiscale: "decrypted-value",
  password: "decrypted-value",
  pin: "decrypted-value",
  cedentePrestatore: { built: true },
};

const FAKE_SALE_DOC = {
  id: "sale-doc-uuid",
  businessId: "biz-789",
  kind: "SALE",
  status: "ACCEPTED",
  adeTransactionId: "trx-001",
  adeProgressive: "DCW2026/5111-2188",
  createdAt: new Date("2026-02-15T10:00:00Z"),
};

const FAKE_VOID_DOC = { id: "void-doc-uuid" };

const FAKE_ADE_DETAIL = {
  idtrx: "trx-001",
  documentoCommerciale: {
    cfCessionarioCommittente: "",
    flagDocCommPerRegalo: false,
    progressivoCollegato: "",
    dataOra: "15/02/2026",
    multiAttivita: { codiceAttivita: "", descAttivita: "" },
    importoTotaleIva: "0",
    scontoTotale: "0",
    scontoTotaleLordo: "0",
    totaleImponibile: "1.7",
    ammontareComplessivo: "1.7",
    totaleNonRiscosso: "0",
    scontoAbbuono: "0",
    importoDetraibileDeducibile: "0",
    elementiContabili: [
      {
        idElementoContabile: "270270040",
        reso: "0.00",
        quantita: "1",
        descrizioneProdotto: "Prodotto test",
        prezzoLordo: "1.7",
        prezzoUnitario: "1.7",
        scontoUnitario: "0",
        scontoLordo: "0",
        aliquotaIVA: "N2",
        importoIVA: "0",
        imponibile: "1.7",
        imponibileNetto: "1.7",
        totale: "1.7",
        omaggio: "N",
      },
    ],
  },
};

const FAKE_ADE_RESPONSE = {
  esito: true,
  idtrx: "trx-void-001",
  progressivo: "DCW2026/5111-3000",
  errori: [],
};

const VALID_INPUT: VoidReceiptInput = {
  documentId: "sale-doc-uuid",
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440001",
  businessId: "biz-789",
};

// --- Tests ---

describe("voidReceiptForBusiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADE_MODE = "mock";

    mockFetchAdePrerequisites.mockResolvedValue(FAKE_PREREQUISITES);
    mockIsCieSessionMissing.mockReturnValue(false);

    // select: first call returns saleDoc, subsequent calls return idempotency results
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue(selectWhereResult);
    mockSelectLimit.mockResolvedValue([FAKE_SALE_DOC]);

    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockReturning.mockResolvedValue([FAKE_VOID_DOC]);

    mockUpdate.mockReturnValue({ set: mockUpdateSet });

    mockLogin.mockResolvedValue({});
    mockGetDocument.mockResolvedValue(FAKE_ADE_DETAIL);
    mockSubmitVoid.mockResolvedValue(FAKE_ADE_RESPONSE);
    mockLogout.mockResolvedValue(undefined);
    mockSearchDocuments.mockResolvedValue({
      totalCount: 0,
      elencoRisultati: [],
    });

    mockTransaction.mockImplementation(
      async (
        callback: (tx: {
          update: typeof mockUpdate;
          execute: ReturnType<typeof vi.fn>;
        }) => Promise<void>,
      ) =>
        callback({
          update: mockUpdate,
          execute: vi.fn().mockResolvedValue(undefined),
        }),
    );
  });

  it("happy path: annulla scontrino e ritorna voidDocumentId + adeTransactionId", async () => {
    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.error).toBeUndefined();
    expect(result.voidDocumentId).toBe("void-doc-uuid");
    expect(result.adeTransactionId).toBe("trx-void-001");
    expect(result.adeProgressive).toBe("DCW2026/5111-3000");
    expect(mockLogin).toHaveBeenCalledWith({
      codiceFiscale: "decrypted-value",
      password: "decrypted-value",
      pin: "decrypted-value",
    });
    expect(mockGetDocument).toHaveBeenCalledWith("trx-001");
    expect(mockSubmitVoid).toHaveBeenCalled();
    expect(mockLogout).toHaveBeenCalled();
  });

  it("CIE senza sessione interattiva → reauthRequired, nessuna riga VOID inserita", async () => {
    mockFetchAdePrerequisites.mockResolvedValue({
      method: "cie",
      cedentePrestatore: { built: true },
    });
    mockIsCieSessionMissing.mockReturnValue(true);

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.reauthRequired).toBe(true);
    // Early-check: nessun insert VOID né submitVoid.
    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(mockSubmitVoid).not.toHaveBeenCalled();
  });

  it("CIE: sessione scaduta in-flight (AdeReauthRequiredError) → reauthRequired", async () => {
    mockFetchAdePrerequisites.mockResolvedValue({
      method: "cie",
      cedentePrestatore: { built: true },
    });
    mockIsCieSessionMissing.mockReturnValue(false);
    mockSubmitVoid.mockRejectedValue(new AdeReauthRequiredError("cie"));

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.reauthRequired).toBe(true);
    // submitVoid è stato tentato ma AdE ha rifiutato la sessione.
    expect(mockSubmitVoid).toHaveBeenCalled();
  });

  it("salva apiKeyId nel documento VOID quando fornito", async () => {
    const { voidReceiptForBusiness } = await import("./void-service");
    await voidReceiptForBusiness(VALID_INPUT, "api-key-uuid-123");

    const insertValuesArg = mockInsertValues.mock.calls[0][0];
    expect(insertValuesArg.apiKeyId).toBe("api-key-uuid-123");
  });

  it("salva apiKeyId null quando non fornito (UI session)", async () => {
    const { voidReceiptForBusiness } = await import("./void-service");
    await voidReceiptForBusiness(VALID_INPUT);

    const insertValuesArg = mockInsertValues.mock.calls[0][0];
    expect(insertValuesArg.apiKeyId).toBeNull();
  });

  it("ritorna errore se il documento SALE non è trovato", async () => {
    mockSelectLimit.mockResolvedValue([]);

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.error).toMatch(/non trovato/i);
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("REVIEW #15: logga warn v1_document_not_found sul not-found via API key", async () => {
    mockSelectLimit.mockResolvedValue([]);

    const { voidReceiptForBusiness } = await import("./void-service");
    const { logger } = await import("@/lib/logger");
    const result = await voidReceiptForBusiness(
      VALID_INPUT,
      "api-key-uuid-123",
    );

    expect(result.error).toMatch(/non trovato/i);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: VALID_INPUT.documentId,
        businessId: VALID_INPUT.businessId,
        apiKeyId: "api-key-uuid-123",
        errorClass: "v1_document_not_found",
      }),
      expect.any(String),
    );
  });

  it("REVIEW #15: NON logga il warn v1 sul not-found da UI session (apiKeyId assente)", async () => {
    mockSelectLimit.mockResolvedValue([]);

    const { voidReceiptForBusiness } = await import("./void-service");
    const { logger } = await import("@/lib/logger");
    await voidReceiptForBusiness(VALID_INPUT);

    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "v1_document_not_found" }),
      expect.any(String),
    );
  });

  it("ritorna errore se il documento non è di tipo SALE", async () => {
    mockSelectLimit.mockResolvedValue([{ ...FAKE_SALE_DOC, kind: "VOID" }]);

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.error).toMatch(/vendita/i);
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("ritorna errore se lo stato non è ACCEPTED", async () => {
    mockSelectLimit.mockResolvedValue([
      { ...FAKE_SALE_DOC, status: "VOID_ACCEPTED" },
    ]);

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.error).toBeDefined();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("ritorna errore se mancano i dati AdE sul documento originale", async () => {
    mockSelectLimit.mockResolvedValue([
      { ...FAKE_SALE_DOC, adeTransactionId: null, adeProgressive: null },
    ]);

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.error).toMatch(/Dati AdE/i);
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("ritorna errore se le credenziali AdE non sono trovate", async () => {
    mockFetchAdePrerequisites.mockResolvedValue({
      error: "Credenziali AdE non trovate. Completa la configurazione.",
    });

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.error).toMatch(/Credenziali/i);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("idempotency: ritorna IDs esistenti se il documento è già VOID_ACCEPTED", async () => {
    mockReturning.mockResolvedValue([]); // conflict

    // Second select call: idempotency lookup returns VOID_ACCEPTED
    mockSelectLimit
      .mockResolvedValueOnce([FAKE_SALE_DOC]) // first: saleDoc fetch
      .mockResolvedValueOnce([
        {
          id: "void-doc-uuid",
          status: "VOID_ACCEPTED",
          adeTransactionId: "trx-void-001",
          adeProgressive: "DCW2026/5111-3000",
        },
      ]);

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.error).toBeUndefined();
    expect(result.voidDocumentId).toBe("void-doc-uuid");
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("P1.4: stessa key per annullare un documento diverso → IDEMPOTENCY_PAYLOAD_MISMATCH", async () => {
    mockReturning.mockResolvedValue([]); // INSERT conflict
    mockSelectLimit
      .mockResolvedValueOnce([FAKE_SALE_DOC]) // sale fetch (documentId = sale-doc-uuid)
      .mockResolvedValueOnce([
        {
          id: "void-doc-uuid",
          status: "VOID_ACCEPTED",
          adeTransactionId: "trx-void",
          adeProgressive: "prog",
          // La key esistente annullava un SALE diverso da input.documentId.
          voidedDocumentId: "another-sale-uuid",
        },
      ]);

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect((result as { code?: string }).code).toBe(
      "IDEMPOTENCY_PAYLOAD_MISMATCH",
    );
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("idempotency: ritorna errore se il documento VOID esistente è PENDING", async () => {
    mockReturning.mockResolvedValue([]); // conflict

    mockSelectLimit
      .mockResolvedValueOnce([FAKE_SALE_DOC])
      .mockResolvedValueOnce([
        {
          id: "void-doc-uuid",
          status: "PENDING",
          adeTransactionId: null,
          adeProgressive: null,
          // fresh: aggiornato ora (staleness gated su updatedAt)
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.error).toBeDefined();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("P1.3 follow-up: void retry sfalsato durante un claim in volo (updatedAt appena bumpato) ritorna VOID_PENDING_IN_PROGRESS senza ri-sottomettere", async () => {
    mockReturning.mockResolvedValue([]); // INSERT conflict
    // createdAt vecchio (>30 min) MA updatedAt appena bumpato: un claim
    // concorrente (retry A) ha già rivendicato la riga ed è in volo su submitVoid.
    // Gateando la staleness su updatedAt il retry B vede la riga "recente" e
    // ritorna in-progress senza vincere un secondo claim → niente doppio VOID.
    mockSelectLimit
      .mockResolvedValueOnce([FAKE_SALE_DOC])
      .mockResolvedValueOnce([
        {
          id: "void-doc-uuid",
          status: "PENDING",
          adeTransactionId: null,
          adeProgressive: null,
          createdAt: new Date(Date.now() - 35 * 60 * 1000),
          updatedAt: new Date(Date.now() - 2_000),
        },
      ]);

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect((result as { code?: string }).code).toBe("VOID_PENDING_IN_PROGRESS");
    // CRITICO: nessun secondo claim, nessun doppio submitVoid ad AdE.
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockSubmitVoid).not.toHaveBeenCalled();
  });

  it("P1.3: void recovery stale vince il claim e riesegue submitVoid", async () => {
    mockReturning.mockResolvedValue([]); // INSERT conflict
    mockSelectLimit
      .mockResolvedValueOnce([FAKE_SALE_DOC]) // sale fetch
      .mockResolvedValueOnce([
        {
          id: "void-doc-uuid",
          status: "PENDING",
          adeTransactionId: null,
          adeProgressive: null,
          createdAt: new Date(Date.now() - 35 * 60 * 1000),
          updatedAt: new Date(Date.now() - 35 * 60 * 1000),
        },
      ]);

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    // Claim vinto → lookup AdE (default vuoto → none) → riesegue submitVoid.
    expect(mockSearchDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ tipoOperazione: "A" }),
    );
    expect(mockSubmitVoid).toHaveBeenCalled();
    expect(result.voidDocumentId).toBe("void-doc-uuid");
  });

  it("recovery annullo: searchDocuments trova un match → finalize-only, niente submitVoid (REVIEW.md #4)", async () => {
    mockReturning.mockResolvedValue([]); // INSERT conflict
    mockSelectLimit
      .mockResolvedValueOnce([FAKE_SALE_DOC]) // sale fetch (adeProgressive = DCW2026/5111-2188)
      .mockResolvedValueOnce([
        {
          id: "void-doc-uuid",
          status: "PENDING",
          adeTransactionId: null,
          adeProgressive: null,
          createdAt: new Date(Date.now() - 35 * 60 * 1000),
          updatedAt: new Date(Date.now() - 35 * 60 * 1000),
        },
      ]);
    // AdE aveva già registrato l'annullo: annulli punta al progressivo della vendita.
    mockSearchDocuments.mockResolvedValueOnce({
      totalCount: 1,
      elencoRisultati: [
        {
          idtrx: "trx-void-found",
          numeroProgressivo: "DCW2026/5111-3000",
          cfCliente: "",
          data: "15/02/2026 10:05:00",
          tipoOperazione: "A",
          annulli: "DCW2026/5111-2188",
          ammontareComplessivo: 20.0,
        },
      ],
    });

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    // finalize-only con gli ID dell'annullo recuperato da AdE.
    expect(result.voidDocumentId).toBe("void-doc-uuid");
    expect(result.adeTransactionId).toBe("trx-void-found");
    expect(result.adeProgressive).toBe("DCW2026/5111-3000");
    // CRITICO: AdE aveva già registrato l'annullo → nessun re-submit (no doppio annullo).
    expect(mockSubmitVoid).not.toHaveBeenCalled();
    expect(mockGetDocument).not.toHaveBeenCalled();
  });

  it("recovery annullo: match AdE ambiguo → VOID_PENDING_IN_PROGRESS, niente submitVoid", async () => {
    mockReturning.mockResolvedValue([]); // INSERT conflict
    mockSelectLimit
      .mockResolvedValueOnce([FAKE_SALE_DOC])
      .mockResolvedValueOnce([
        {
          id: "void-doc-uuid",
          status: "PENDING",
          adeTransactionId: null,
          adeProgressive: null,
          createdAt: new Date(Date.now() - 35 * 60 * 1000),
          updatedAt: new Date(Date.now() - 35 * 60 * 1000),
        },
      ]);
    mockSearchDocuments.mockResolvedValueOnce({
      totalCount: 2,
      elencoRisultati: [
        {
          idtrx: "1",
          numeroProgressivo: "DCW2026/5111-3000",
          cfCliente: "",
          data: "15/02/2026 10:05:00",
          tipoOperazione: "A",
          annulli: "DCW2026/5111-2188",
          ammontareComplessivo: 20.0,
        },
        {
          idtrx: "2",
          numeroProgressivo: "DCW2026/5111-3001",
          cfCliente: "",
          data: "15/02/2026 10:06:00",
          tipoOperazione: "A",
          annulli: "DCW2026/5111-2188",
          ammontareComplessivo: 20.0,
        },
      ],
    });

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect((result as { code?: string }).code).toBe("VOID_PENDING_IN_PROGRESS");
    expect(mockSubmitVoid).not.toHaveBeenCalled();
  });

  it("recovery annullo: searchDocuments fallisce → fail-safe VOID_PENDING_IN_PROGRESS, niente submitVoid", async () => {
    mockReturning.mockResolvedValue([]); // INSERT conflict
    mockSelectLimit
      .mockResolvedValueOnce([FAKE_SALE_DOC])
      .mockResolvedValueOnce([
        {
          id: "void-doc-uuid",
          status: "PENDING",
          adeTransactionId: null,
          adeProgressive: null,
          createdAt: new Date(Date.now() - 35 * 60 * 1000),
          updatedAt: new Date(Date.now() - 35 * 60 * 1000),
        },
      ]);
    mockSearchDocuments.mockRejectedValueOnce(new Error("network down"));

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    // Non sappiamo se AdE aveva registrato l'annullo → mai re-submit.
    expect((result as { code?: string }).code).toBe("VOID_PENDING_IN_PROGRESS");
    expect(mockSubmitVoid).not.toHaveBeenCalled();
    expect(mockGetDocument).not.toHaveBeenCalled();
  });

  it("P1.3: void recovery stale che perde il claim ritorna VOID_PENDING_IN_PROGRESS senza ri-sottomettere", async () => {
    mockReturning.mockResolvedValue([]); // INSERT conflict
    mockSelectLimit
      .mockResolvedValueOnce([FAKE_SALE_DOC])
      .mockResolvedValueOnce([
        {
          id: "void-doc-uuid",
          status: "PENDING",
          adeTransactionId: null,
          adeProgressive: null,
          createdAt: new Date(Date.now() - 35 * 60 * 1000),
          updatedAt: new Date(Date.now() - 35 * 60 * 1000),
        },
      ]);
    // Claim CAS perso: un altro retry ha già rivendicato la riga (0 righe).
    mockClaimReturning.mockResolvedValueOnce([]);

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect((result as { code?: string }).code).toBe("VOID_PENDING_IN_PROGRESS");
    // CRITICO: nessun doppio submitVoid ad AdE dal retry perdente.
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockSubmitVoid).not.toHaveBeenCalled();
  });

  it("aggiorna documento a REJECTED se AdE ritorna esito:false", async () => {
    const { logger } = await import("@/lib/logger");
    mockSubmitVoid.mockResolvedValue({
      esito: false,
      idtrx: null,
      progressivo: null,
      errori: [{ codice: "EF0", descrizione: "Documento già annullato" }],
    });

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.error).toContain(
      "portale Agenzia delle Entrate Fatture e Corrispettivi",
    );
    expect(result.error).toContain("Non dipende da te né da ScontrinoZero");
    expect(result.error).not.toContain("EF0");
    expect(result.error).not.toMatch(/codice/i);
    const setArg = mockUpdateSet.mock.calls[0][0];
    expect(setArg.status).toBe("REJECTED");
    expect(setArg.adeResponse).toBeDefined();
    expect(mockUpdateSet.mock.calls).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        adeErrorCodes: ["EF0"],
        adeErrorDescriptions: ["Documento già annullato"],
      }),
      "AdE rejected void",
    );
    expect(logger.error).not.toHaveBeenCalledWith(
      expect.anything(),
      "AdE rejected void",
    );
  });

  it("logga array vuoti se AdE ritorna esito:false senza errori array", async () => {
    const { logger } = await import("@/lib/logger");
    mockSubmitVoid.mockResolvedValue({
      esito: false,
      idtrx: null,
      progressivo: null,
      // errori intentionally omitted: AdE può non includere il campo.
    });

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.error).toContain(
      "portale Agenzia delle Entrate Fatture e Corrispettivi",
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        adeErrorCodes: [],
        adeErrorDescriptions: [],
      }),
      "AdE rejected void",
    );
  });

  it("aggiorna documento a ERROR e ritorna errore se AdE login fallisce", async () => {
    mockLogin.mockRejectedValue(new Error("AdE login failed"));

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.error).toBeDefined();
    const setArg = mockUpdateSet.mock.calls[0][0];
    expect(setArg.status).toBe("ERROR");
  });

  it("ritorna messaggio dedicato 'portale AdE down' su 5xx invece del messaggio generico", async () => {
    const { AdePortalError } = await import("@/lib/ade/errors");
    mockLogin.mockRejectedValue(
      new AdePortalError(502, "wizardTemplate failed with status 502"),
    );

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.error).toContain(
      "portale Agenzia delle Entrate Fatture e Corrispettivi",
    );
    expect(result.error).toContain("non risponde al momento");
    expect(result.error).not.toContain("Riprova più tardi");
  });

  it("M3: AdE transient (AdePortalError 5xx) logga a warn invece di error (no Sentry noise)", async () => {
    const { AdePortalError } = await import("@/lib/ade/errors");
    mockSubmitVoid.mockRejectedValue(
      new AdePortalError(503, "service unavailable"),
    );

    const { voidReceiptForBusiness } = await import("./void-service");
    await voidReceiptForBusiness(VALID_INPUT);

    const { logger } = await import("@/lib/logger");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "ade_transient" }),
      expect.stringContaining("transient failure"),
    );
    const errorCalls = (logger.error as ReturnType<typeof vi.fn>).mock.calls;
    const failedCalls = errorCalls.filter((c) =>
      String(c[1] ?? "").includes("voidReceiptForBusiness failed"),
    );
    expect(failedCalls).toHaveLength(0);
  });

  it("M3: errore non transient (generic Error) resta a logger.error con sentryFingerprint per flow void-receipt (R23)", async () => {
    mockSubmitVoid.mockRejectedValue(new Error("unexpected boom"));

    const { voidReceiptForBusiness } = await import("./void-service");
    await voidReceiptForBusiness(VALID_INPUT);

    const { logger } = await import("@/lib/logger");
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        errorClass: "ade_failure",
        flow: "void-receipt",
        sentryFingerprint: ["void-receipt", "ade_failure"],
      }),
      expect.stringContaining("voidReceiptForBusiness failed"),
    );
  });

  it("non chiama logout se AdE login fallisce (nessuna sessione aperta)", async () => {
    mockLogin.mockRejectedValue(new Error("AdE login failed"));

    const { voidReceiptForBusiness } = await import("./void-service");
    await voidReceiptForBusiness(VALID_INPUT);

    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("aggiorna VOID doc a VOID_ACCEPTED e segna SALE come VOID_ACCEPTED", async () => {
    const { voidReceiptForBusiness } = await import("./void-service");
    await voidReceiptForBusiness(VALID_INPUT);

    const firstSet = mockUpdateSet.mock.calls[0][0];
    expect(firstSet.status).toBe("VOID_ACCEPTED");
    expect(firstSet.adeTransactionId).toBe("trx-void-001");

    const secondSet = mockUpdateSet.mock.calls[1][0];
    expect(secondSet.status).toBe("VOID_ACCEPTED");
  });

  it("chiama logout anche se submitVoid lancia un errore", async () => {
    mockSubmitVoid.mockRejectedValue(new Error("network error"));

    const { voidReceiptForBusiness } = await import("./void-service");
    await voidReceiptForBusiness(VALID_INPUT);

    expect(mockLogout).toHaveBeenCalled();
  });

  it("chiama logout anche nel happy path", async () => {
    const { voidReceiptForBusiness } = await import("./void-service");
    await voidReceiptForBusiness(VALID_INPUT);

    expect(mockLogout).toHaveBeenCalled();
  });

  it("ritorna code DB_TIMEOUT se il flusso pre-AdE va in statement timeout", async () => {
    const timeoutErr = Object.assign(
      new Error("canceling statement due to statement timeout"),
      { code: "57014" },
    );
    // Simula timeout sul fetch SALE → primo SELECT fallisce
    mockSelectLimit.mockRejectedValueOnce(timeoutErr);

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect((result as { code?: string }).code).toBe("DB_TIMEOUT");
    // Non viene mai chiamato AdE login
    expect(mockLogin).not.toHaveBeenCalled();
    // CRITICAL: non marca ERROR (nessuna submitVoid è ancora avvenuta, ma
    // la riga VOID non esiste neanche, quindi il safety check del partial
    // unique index non si applica — qui solo per coerenza con la regola
    // generale di non marcare ERROR su timeout).
    const statusUpdates = mockUpdateSet.mock.calls.map((c) => c[0].status);
    expect(statusUpdates).not.toContain("ERROR");
  });

  it("ritorna VOID_SYNC_FAILED se la transaction finale fallisce dopo submitVoid", async () => {
    mockTransaction.mockRejectedValue(new Error("DB transaction failed"));

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.error).toBeDefined();
    expect((result as { code?: string }).code).toBe("VOID_SYNC_FAILED");
    // CRITICAL: NON deve marcare ERROR — il partial unique index escluderebbe
    // ERROR e permetterebbe un secondo VOID per la stessa SALE su AdE.
    const statusUpdates = mockUpdateSet.mock.calls.map((c) => c[0].status);
    expect(statusUpdates).not.toContain("ERROR");
  });

  it("REVIEW #35: AdE transient (AdePortalError 5xx) dopo submitVoid NON marca ERROR (resta PENDING)", async () => {
    // Stesso intento dell'outer-catch emit: se submitVoid è forse arrivato ad
    // AdE ma la risposta è 5xx/timeout, marcare ERROR escluderebbe la riga dal
    // partial unique index e dalla riconciliazione, permettendo un secondo VOID
    // per la stessa SALE. La riga resta PENDING (REVIEW.md #35).
    const { AdePortalError } = await import("@/lib/ade/errors");
    mockSubmitVoid.mockRejectedValue(
      new AdePortalError(503, "service unavailable"),
    );

    const { voidReceiptForBusiness } = await import("./void-service");
    await voidReceiptForBusiness(VALID_INPUT);

    const statusUpdates = mockUpdateSet.mock.calls.map((c) => c[0].status);
    expect(statusUpdates).not.toContain("ERROR");
  });

  it("REVIEW #35: AdeNetworkError dopo submitVoid NON marca ERROR (resta PENDING)", async () => {
    const { AdeNetworkError } = await import("@/lib/ade/errors");
    mockSubmitVoid.mockRejectedValue(new AdeNetworkError(new Error("ECONN")));

    const { voidReceiptForBusiness } = await import("./void-service");
    await voidReceiptForBusiness(VALID_INPUT);

    const statusUpdates = mockUpdateSet.mock.calls.map((c) => c[0].status);
    expect(statusUpdates).not.toContain("ERROR");
  });

  it("REVIEW #35: errore pre-submit permanente (non transient) marca ancora ERROR", async () => {
    // Un errore generico non-transient e non-timeout (es. fallimento permanente
    // pre-submit) deve continuare a marcare ERROR: AdE non ha ricevuto nulla e
    // il retry è sicuro. Guardia di non-regressione sul ramo permanente.
    mockSubmitVoid.mockRejectedValue(new Error("permanent failure"));

    const { voidReceiptForBusiness } = await import("./void-service");
    await voidReceiptForBusiness(VALID_INPUT);

    const statusUpdates = mockUpdateSet.mock.calls.map((c) => c[0].status);
    expect(statusUpdates).toContain("ERROR");
  });
});
