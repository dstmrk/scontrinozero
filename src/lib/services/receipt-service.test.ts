// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockFetchAdePrerequisites = vi.fn();
vi.mock("@/lib/server-auth", () => ({
  fetchAdePrerequisites: (...args: unknown[]) =>
    mockFetchAdePrerequisites(...args),
}));

const mockLimit = vi.fn();
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

const mockDocumentReturning = vi.fn();
const mockOnConflictDoNothing = vi
  .fn()
  .mockReturnValue({ returning: mockDocumentReturning });
const mockDocumentInsertValues = vi
  .fn()
  .mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
const mockLinesInsertValues = vi.fn().mockResolvedValue(undefined);

const mockInsert = vi.fn();

// claim CAS (P1.3): db.update().set().where().returning() → rows rivendicate.
// Default: claim vinto (1 riga). Override con mockResolvedValueOnce([]) per simulare
// un retry concorrente che perde la corsa.
const mockClaimReturning = vi.fn().mockResolvedValue([{ id: "doc-claimed" }]);
// `.where()` è terminale per gli UPDATE post-AdE (awaited direttamente → undefined)
// ma il claim CAS vi concatena `.returning()`. Il thenable soddisfa entrambi.
const mockUpdateWhere = vi.fn().mockReturnValue({
  returning: mockClaimReturning,
  then: (onFulfilled: (value: undefined) => unknown) => onFulfilled(undefined),
});
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

const mockTransaction = vi
  .fn()
  .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
    const tx = { select: mockSelect, insert: mockInsert, update: mockUpdate };
    return callback(tx);
  });

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
  commercialDocumentLines: "commercial-document-lines-table",
}));

const mockLogin = vi.fn();
const mockLogout = vi.fn();
const mockSubmitSale = vi.fn();
vi.mock("@/lib/ade", () => ({
  getAdeMode: () => "mock",
  createAdeClient: vi.fn().mockReturnValue({
    login: mockLogin,
    logout: mockLogout,
    submitSale: mockSubmitSale,
  }),
}));

const mockMapSaleToAdePayload = vi.fn().mockReturnValue({ mapped: true });
vi.mock("@/lib/ade/mapper", () => ({
  mapSaleToAdePayload: (...args: unknown[]) => mockMapSaleToAdePayload(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// --- Fixtures ---

import type { SubmitReceiptInput } from "@/types/cassa";
import { hashSaleRequest } from "./request-hash";

const FAKE_PREREQUISITES = {
  codiceFiscale: "decrypted-value",
  password: "decrypted-value",
  pin: "decrypted-value",
  cedentePrestatore: { built: true },
};
const FAKE_DOCUMENT = { id: "doc-123" };
const FAKE_ADE_RESPONSE = {
  esito: true,
  idtrx: "trx-001",
  progressivo: "001",
  errori: [],
};

const VALID_INPUT: SubmitReceiptInput = {
  businessId: "biz-789",
  lines: [
    {
      id: "line-1",
      description: "Pizza margherita",
      quantity: 2,
      grossUnitPrice: 10.0,
      vatCode: "10",
    },
  ],
  paymentMethod: "PC",
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
};

// --- Tests ---

describe("emitReceiptForBusiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADE_MODE = "mock";

    mockFetchAdePrerequisites.mockResolvedValue(FAKE_PREREQUISITES);

    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          select: mockSelect,
          insert: mockInsert,
          update: mockUpdate,
          execute: vi.fn().mockResolvedValue(undefined),
        };
        return callback(tx);
      },
    );

    mockInsert.mockImplementation((table: unknown) => {
      if (table === "commercial-documents-table") {
        return { values: mockDocumentInsertValues };
      }
      return { values: mockLinesInsertValues };
    });
    mockDocumentReturning.mockResolvedValue([FAKE_DOCUMENT]);

    mockLogin.mockResolvedValue({});
    mockSubmitSale.mockResolvedValue(FAKE_ADE_RESPONSE);
    mockLogout.mockResolvedValue(undefined);
  });

  it("happy path: emette scontrino e ritorna documentId e adeTransactionId", async () => {
    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.error).toBeUndefined();
    expect(result.documentId).toBe("doc-123");
    expect(result.adeTransactionId).toBe("trx-001");
    expect(result.adeProgressive).toBe("001");
    expect(mockLogin).toHaveBeenCalledWith({
      codiceFiscale: "decrypted-value",
      password: "decrypted-value",
      pin: "decrypted-value",
    });
    expect(mockSubmitSale).toHaveBeenCalled();
    expect(mockLogout).toHaveBeenCalled();
  });

  it("L2: defensive branch — transaction returns row without id → internal error + critical log", async () => {
    // TS garantisce txResult.id se !alreadyExists, ma il branch resta come
    // safety net contro drift Drizzle / edge case su onConflictDoNothing.
    // Coverage del logger.error con businessId + idempotencyKey + critical.
    mockDocumentReturning.mockResolvedValue([{} as { id?: string }]);

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.error).toContain("Errore interno");
    expect(mockSubmitSale).not.toHaveBeenCalled();

    const { logger } = await import("@/lib/logger");
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: VALID_INPUT.businessId,
        idempotencyKey: VALID_INPUT.idempotencyKey,
        critical: true,
      }),
      "Transaction returned no document ID",
    );
  });

  it("salva apiKeyId nel documento quando fornito", async () => {
    const { emitReceiptForBusiness } = await import("./receipt-service");
    await emitReceiptForBusiness(VALID_INPUT, "api-key-uuid-123");

    const insertValuesArg = mockDocumentInsertValues.mock.calls[0][0];
    expect(insertValuesArg.apiKeyId).toBe("api-key-uuid-123");
  });

  it("salva apiKeyId null quando non fornito (UI session)", async () => {
    const { emitReceiptForBusiness } = await import("./receipt-service");
    await emitReceiptForBusiness(VALID_INPUT);

    const insertValuesArg = mockDocumentInsertValues.mock.calls[0][0];
    expect(insertValuesArg.apiKeyId).toBeNull();
  });

  it("ritorna errore se le credenziali AdE non sono trovate", async () => {
    mockFetchAdePrerequisites.mockResolvedValue({
      error: "Credenziali AdE non trovate. Completa la configurazione.",
    });

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.error).toContain("Credenziali");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("ritorna errore se il codice lotteria non rispetta il formato", async () => {
    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness({
      ...VALID_INPUT,
      paymentMethod: "PE",
      lotteryCode: "TOOLONG99",
    });

    expect(result.error).toMatch(/lotteria/i);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("ritorna errore se importo < €1 con codice lotteria PE", async () => {
    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness({
      ...VALID_INPUT,
      paymentMethod: "PE",
      lotteryCode: "YYWLR30G",
      lines: [
        {
          id: "l1",
          description: "Caramella",
          quantity: 1,
          grossUnitPrice: 0.5,
          vatCode: "22",
        },
      ],
    });

    expect(result.error).toMatch(/importo minimo/i);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("accetta esattamente €1,00 con codice lotteria (no IEEE-754 falso negativo)", async () => {
    // 0.1 * 10 = 0.9999999999999999 in IEEE-754; Math.round(0.9999... * 100) = 100 → accettato
    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness({
      ...VALID_INPUT,
      paymentMethod: "PE",
      lotteryCode: "YYWLR30G",
      lines: [
        {
          id: "l1",
          description: "Prodotto",
          quantity: 10,
          grossUnitPrice: 0.1, // 10 × 0.1 = 1.00 nominalmente (float instabile)
          vatCode: "22",
        },
      ],
    });

    // Should NOT be rejected by the lottery threshold (€1.00 is the minimum)
    expect(result.error).not.toBe(
      "Il codice lotteria richiede un importo minimo di €1,00.",
    );
  });

  it("idempotency: ritorna IDs esistenti se il documento è già ACCEPTED", async () => {
    mockDocumentReturning.mockResolvedValue([]); // Conflict
    mockLimit.mockResolvedValueOnce([
      {
        id: "doc-existing",
        status: "ACCEPTED",
        adeTransactionId: "trx-existing",
        adeProgressive: "progressive-existing",
      },
    ]);

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.error).toBeUndefined();
    expect(result.documentId).toBe("doc-existing");
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("P1.4: stessa key + payload diverso → IDEMPOTENCY_PAYLOAD_MISMATCH", async () => {
    mockDocumentReturning.mockResolvedValue([]); // conflict
    mockLimit.mockResolvedValueOnce([
      {
        id: "doc-existing",
        status: "ACCEPTED",
        adeTransactionId: "trx-existing",
        adeProgressive: "prog",
        requestHash: "hash-di-un-payload-completamente-diverso",
      },
    ]);

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.code).toBe("IDEMPOTENCY_PAYLOAD_MISMATCH");
    // Nessun ritorno fuorviante del documento precedente.
    expect(result.documentId).toBeUndefined();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("P1.4: stessa key + stesso payload → idempotenza OK (hash combacia)", async () => {
    mockDocumentReturning.mockResolvedValue([]); // conflict
    mockLimit.mockResolvedValueOnce([
      {
        id: "doc-existing",
        status: "ACCEPTED",
        adeTransactionId: "trx-existing",
        adeProgressive: "prog",
        requestHash: hashSaleRequest({
          lines: VALID_INPUT.lines,
          paymentMethod: VALID_INPUT.paymentMethod,
          lotteryCode: null,
        }),
      },
    ]);

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.code).toBeUndefined();
    expect(result.documentId).toBe("doc-existing");
  });

  it("P1.4: riga storica con requestHash NULL non rompe l'idempotenza (fallback)", async () => {
    mockDocumentReturning.mockResolvedValue([]); // conflict
    mockLimit.mockResolvedValueOnce([
      {
        id: "doc-old",
        status: "ACCEPTED",
        adeTransactionId: "trx-old",
        adeProgressive: "prog-old",
        requestHash: null,
      },
    ]);

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.code).toBeUndefined();
    expect(result.documentId).toBe("doc-old");
  });

  it("idempotency: PENDING fresh ritorna code PENDING_IN_PROGRESS", async () => {
    mockDocumentReturning.mockResolvedValue([]);
    mockLimit.mockResolvedValueOnce([
      {
        id: "doc-123",
        status: "PENDING",
        adeTransactionId: null,
        adeProgressive: null,
        // fresh: aggiornato 10 secondi fa (staleness gated su updatedAt)
        createdAt: new Date(Date.now() - 10_000),
        updatedAt: new Date(Date.now() - 10_000),
      },
    ]);

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.code).toBe("PENDING_IN_PROGRESS");
    expect(result.error).toBeDefined();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("P1.3 follow-up: retry sfalsato durante un claim in volo (updatedAt appena bumpato) ritorna PENDING_IN_PROGRESS senza ri-sottomettere", async () => {
    mockDocumentReturning.mockResolvedValue([]);
    // createdAt vecchio (>30 min) MA updatedAt appena bumpato: un claim
    // concorrente (retry A) ha già rivendicato la riga ed è in volo su submitSale.
    // Gateando la staleness su updatedAt, il retry B vede la riga come "recente"
    // e ritorna in-progress senza vincere un secondo claim → niente doppio
    // documento fiscale su AdE. Con la vecchia logica (createdAt) entrava in
    // recovery e poteva ri-sottomettere.
    mockLimit.mockResolvedValueOnce([
      {
        id: "doc-123",
        status: "PENDING",
        adeTransactionId: null,
        adeProgressive: null,
        createdAt: new Date(Date.now() - 35 * 60 * 1000),
        updatedAt: new Date(Date.now() - 2_000),
      },
    ]);

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.code).toBe("PENDING_IN_PROGRESS");
    // CRITICO: nessun secondo claim, nessun doppio submitSale ad AdE.
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockSubmitSale).not.toHaveBeenCalled();
  });

  it("idempotency: PENDING stale entra in recovery path", async () => {
    mockDocumentReturning.mockResolvedValue([]);
    // createdAt > 30 minuti (default threshold) → stale
    mockLimit.mockResolvedValueOnce([
      {
        id: "doc-123",
        status: "PENDING",
        adeTransactionId: null,
        adeProgressive: null,
        createdAt: new Date(Date.now() - 35 * 60 * 1000),
        updatedAt: new Date(Date.now() - 35 * 60 * 1000),
      },
    ]);

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    // Recovery completata: ritorna ACCEPTED via submitSaleToAde
    expect(result.error).toBeUndefined();
    expect(result.documentId).toBe("doc-123");
    expect(mockLogin).toHaveBeenCalled();
    expect(mockSubmitSale).toHaveBeenCalled();
  });

  it("P1.3: recovery concorrente che perde il claim ritorna PENDING_IN_PROGRESS senza ri-sottomettere", async () => {
    mockDocumentReturning.mockResolvedValue([]);
    mockLimit.mockResolvedValueOnce([
      {
        id: "doc-123",
        status: "PENDING",
        adeTransactionId: null,
        adeProgressive: null,
        createdAt: new Date(Date.now() - 35 * 60 * 1000),
        updatedAt: new Date(Date.now() - 35 * 60 * 1000),
      },
    ]);
    // Claim CAS perso: un altro retry ha già rivendicato la riga (0 righe).
    mockClaimReturning.mockResolvedValueOnce([]);

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.code).toBe("PENDING_IN_PROGRESS");
    // CRITICO: nessun doppio submitSale ad AdE dal retry perdente.
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockSubmitSale).not.toHaveBeenCalled();
  });

  it("idempotency: ERROR stale entra in recovery path", async () => {
    mockDocumentReturning.mockResolvedValue([]);
    mockLimit.mockResolvedValueOnce([
      {
        id: "doc-456",
        status: "ERROR",
        adeTransactionId: null,
        adeProgressive: null,
        createdAt: new Date(Date.now() - 35 * 60 * 1000),
        updatedAt: new Date(Date.now() - 35 * 60 * 1000),
      },
    ]);

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.error).toBeUndefined();
    expect(result.documentId).toBe("doc-456");
    expect(mockSubmitSale).toHaveBeenCalled();
  });

  it("PENDING di 10 min NON è stale (soglia a 30 min) — ritorna PENDING_IN_PROGRESS", async () => {
    mockDocumentReturning.mockResolvedValue([]);
    // 10 min: prima entrava in recovery rischiando doppio submitSale ad AdE
    // se la risposta del primo era stata persa in volo. Soglia ora a 30 min.
    mockLimit.mockResolvedValueOnce([
      {
        id: "doc-not-stale",
        status: "PENDING",
        adeTransactionId: null,
        adeProgressive: null,
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    ]);

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.code).toBe("PENDING_IN_PROGRESS");
    expect(mockSubmitSale).not.toHaveBeenCalled();
  });

  it("idempotency: REJECTED esistente ritorna code ALREADY_REJECTED", async () => {
    mockDocumentReturning.mockResolvedValue([]);
    mockLimit.mockResolvedValueOnce([
      {
        id: "doc-rej",
        status: "REJECTED",
        adeTransactionId: null,
        adeProgressive: null,
        createdAt: new Date(),
      },
    ]);

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.code).toBe("ALREADY_REJECTED");
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("idempotency: PENDING senza updatedAt è trattato come fresh (fail-safe)", async () => {
    mockDocumentReturning.mockResolvedValue([]);
    // updatedAt mancante/null → staleness non determinabile → fail-safe a
    // "fresh" (in-progress), mai recovery: non rischiamo un doppio submit su una
    // riga il cui stato temporale è ignoto.
    mockLimit.mockResolvedValueOnce([
      {
        id: "doc-bad",
        status: "PENDING",
        adeTransactionId: null,
        adeProgressive: null,
        createdAt: null,
        updatedAt: null,
      },
    ]);

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.code).toBe("PENDING_IN_PROGRESS");
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("aggiorna documento a REJECTED se AdE ritorna esito:false", async () => {
    const { logger } = await import("@/lib/logger");
    mockSubmitSale.mockResolvedValue({
      esito: false,
      idtrx: null,
      progressivo: null,
      errori: [{ codice: "EF0", descrizione: "Dati non validi" }],
    });

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.error).toContain(
      "portale Agenzia delle Entrate Fatture e Corrispettivi",
    );
    expect(result.error).toContain("Non dipende da te né da ScontrinoZero");
    expect(result.error).not.toContain("EF0");
    expect(result.error).not.toMatch(/codice/i);
    const setArg = mockUpdateSet.mock.calls[0][0];
    expect(setArg.status).toBe("REJECTED");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        adeErrorCodes: ["EF0"],
        adeErrorDescriptions: ["Dati non validi"],
      }),
      "AdE rejected sale",
    );
    expect(logger.error).not.toHaveBeenCalledWith(
      expect.anything(),
      "AdE rejected sale",
    );
  });

  it("logga array vuoti se AdE ritorna esito:false senza errori array", async () => {
    const { logger } = await import("@/lib/logger");
    mockSubmitSale.mockResolvedValue({
      esito: false,
      idtrx: null,
      progressivo: null,
      // errori intentionally omitted: AdE può non includere il campo.
    });

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.error).toContain(
      "portale Agenzia delle Entrate Fatture e Corrispettivi",
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        adeErrorCodes: [],
        adeErrorDescriptions: [],
      }),
      "AdE rejected sale",
    );
  });

  it("aggiorna documento a ERROR e ritorna errore se AdE login fallisce", async () => {
    mockLogin.mockRejectedValue(new Error("AdE login failed"));

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.error).toBeDefined();
    const setArg = mockUpdateSet.mock.calls[0][0];
    expect(setArg.status).toBe("ERROR");
  });

  it("ritorna messaggio dedicato 'portale AdE down' su 5xx invece del messaggio generico", async () => {
    const { AdePortalError } = await import("@/lib/ade/errors");
    mockLogin.mockRejectedValue(
      new AdePortalError(503, "wizardTemplate failed with status 503"),
    );

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.error).toContain(
      "portale Agenzia delle Entrate Fatture e Corrispettivi",
    );
    expect(result.error).toContain("non risponde al momento");
    expect(result.error).not.toContain("Riprova più tardi");
  });

  it("M3: AdE transient (AdePortalError 5xx) logga a warn invece di error (no Sentry noise)", async () => {
    const { AdePortalError } = await import("@/lib/ade/errors");
    mockSubmitSale.mockRejectedValue(
      new AdePortalError(503, "service unavailable"),
    );

    const { emitReceiptForBusiness } = await import("./receipt-service");
    await emitReceiptForBusiness(VALID_INPUT);

    const { logger } = await import("@/lib/logger");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "ade_transient" }),
      expect.stringContaining("transient failure"),
    );
    // logger.error PUÒ essere chiamato per altri eventi (es. "Failed to mark
    // document as ERROR"), ma NON per emitReceiptForBusiness failed.
    const errorCalls = (logger.error as ReturnType<typeof vi.fn>).mock.calls;
    const failedCalls = errorCalls.filter((c) =>
      String(c[1] ?? "").includes("emitReceiptForBusiness failed"),
    );
    expect(failedCalls).toHaveLength(0);
  });

  it("M3: AdeNetworkError logga a warn (transient)", async () => {
    const { AdeNetworkError } = await import("@/lib/ade/errors");
    mockSubmitSale.mockRejectedValue(new AdeNetworkError(new Error("ECONN")));

    const { emitReceiptForBusiness } = await import("./receipt-service");
    await emitReceiptForBusiness(VALID_INPUT);

    const { logger } = await import("@/lib/logger");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "ade_transient" }),
      expect.stringContaining("transient failure"),
    );
  });

  it("R21: AdeAuthError (credenziali sbagliate) logga warn con errorClass ade_user_error (no Sentry noise)", async () => {
    // Credenziali Fisconline sbagliate sono input utente, non bug nostro:
    // logger.warn + errorClass ade_user_error -> niente issue Sentry.
    // Regola 21 di CLAUDE.md, fix di SCONTRINOZERO-7.
    const { AdeAuthError } = await import("@/lib/ade/errors");
    mockSubmitSale.mockRejectedValue(new AdeAuthError());

    const { emitReceiptForBusiness } = await import("./receipt-service");
    await emitReceiptForBusiness(VALID_INPUT);

    const { logger } = await import("@/lib/logger");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "ade_user_error" }),
      expect.stringContaining("emitReceiptForBusiness"),
    );
    expect(logger.error).not.toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "ade_failure" }),
      expect.stringContaining("emitReceiptForBusiness failed"),
    );
  });

  it("M3: errore non transient e non user (generic Error) resta a logger.error con sentryFingerprint per flow emit-receipt (R23)", async () => {
    mockSubmitSale.mockRejectedValue(new Error("unexpected boom"));

    const { emitReceiptForBusiness } = await import("./receipt-service");
    await emitReceiptForBusiness(VALID_INPUT);

    const { logger } = await import("@/lib/logger");
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        errorClass: "ade_failure",
        flow: "emit-receipt",
        sentryFingerprint: ["emit-receipt", "ade_failure"],
      }),
      expect.stringContaining("emitReceiptForBusiness failed"),
    );
  });

  it("non chiama logout se AdE login fallisce (nessuna sessione aperta)", async () => {
    mockLogin.mockRejectedValue(new Error("AdE login failed"));

    const { emitReceiptForBusiness } = await import("./receipt-service");
    await emitReceiptForBusiness(VALID_INPUT);

    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("usa ELECTRONIC come tipo pagamento per PE", async () => {
    const { emitReceiptForBusiness } = await import("./receipt-service");
    await emitReceiptForBusiness({
      ...VALID_INPUT,
      paymentMethod: "PE",
    });

    expect(mockMapSaleToAdePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        payments: expect.arrayContaining([
          expect.objectContaining({ type: "ELECTRONIC" }),
        ]),
      }),
      expect.anything(),
    );
  });

  it("usa CASH come tipo pagamento per PC", async () => {
    const { emitReceiptForBusiness } = await import("./receipt-service");
    await emitReceiptForBusiness(VALID_INPUT);

    expect(mockMapSaleToAdePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        payments: expect.arrayContaining([
          expect.objectContaining({ type: "CASH" }),
        ]),
      }),
      expect.anything(),
    );
  });

  it("chiama logout anche se submitSale lancia un errore", async () => {
    mockSubmitSale.mockRejectedValue(new Error("network error"));

    const { emitReceiptForBusiness } = await import("./receipt-service");
    await emitReceiptForBusiness(VALID_INPUT);

    expect(mockLogout).toHaveBeenCalled();
  });

  it("chiama logout anche nel happy path", async () => {
    const { emitReceiptForBusiness } = await import("./receipt-service");
    await emitReceiptForBusiness(VALID_INPUT);

    expect(mockLogout).toHaveBeenCalled();
  });

  it("ritorna code DB_TIMEOUT se l'INSERT iniziale va in statement timeout", async () => {
    const timeoutErr = Object.assign(
      new Error("canceling statement due to statement timeout"),
      { code: "57014" },
    );
    mockTransaction.mockImplementationOnce(async () => {
      throw timeoutErr;
    });

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.code).toBe("DB_TIMEOUT");
    expect(result.error).toMatch(/sovracc/i);
    // L'AdE login NON deve essere stato chiamato: timeout PRE-AdE
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("recovery con adeTransactionId valorizzato finalizza senza richiamare submitSale", async () => {
    mockDocumentReturning.mockResolvedValue([]); // INSERT conflict
    mockLimit.mockResolvedValueOnce([
      {
        id: "doc-recovered",
        status: "PENDING",
        // submitSale era già successo nel precedente tentativo
        adeTransactionId: "prev-tx-id",
        adeProgressive: "prev-prog",
        createdAt: new Date(Date.now() - 35 * 60 * 1000),
        updatedAt: new Date(Date.now() - 35 * 60 * 1000),
      },
    ]);

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    // CRITICO: submitSale NON deve essere ri-chiamato (doppio doc fiscale)
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockSubmitSale).not.toHaveBeenCalled();
    // Result rispecchia l'AdE IDs già pre-esistenti
    expect(result).toEqual({
      documentId: "doc-recovered",
      adeTransactionId: "prev-tx-id",
      adeProgressive: "prev-prog",
    });
  });

  it("submitSaleToAde catch: timeout DB durante UPDATE finale → DB_TIMEOUT senza marcare ERROR", async () => {
    // emit normale (no conflict): submitSale ha successo, ma l'UPDATE
    // ACCEPTED finale va in timeout esaurendo i retry
    const timeoutErr = Object.assign(new Error("timeout"), { code: "57014" });
    mockUpdateWhere.mockRejectedValue(timeoutErr);

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.code).toBe("DB_TIMEOUT");
    // submitSale è stata chiamata (path fresh, no recovery)
    expect(mockSubmitSale).toHaveBeenCalled();
    // Non deve essere stato chiamato un UPDATE a ERROR
    // (il timeout outer ramo skippa la mark-ERROR per non rompere la stale recovery)
    const updateSets = mockUpdateSet.mock.calls.map((c) => c[0].status);
    expect(updateSets).not.toContain("ERROR");
  });

  it("finalizeSaleOnly ritorna DB_TIMEOUT se l'UPDATE finalize esaurisce i retry", async () => {
    mockDocumentReturning.mockResolvedValue([]); // INSERT conflict
    mockLimit.mockResolvedValueOnce([
      {
        id: "doc-stuck",
        status: "PENDING",
        adeTransactionId: "tx-prev",
        adeProgressive: "prog-prev",
        createdAt: new Date(Date.now() - 35 * 60 * 1000),
        updatedAt: new Date(Date.now() - 35 * 60 * 1000),
      },
    ]);
    // Tutte le UPDATE post-conflict falliscono in timeout (4 tentativi)
    const timeoutErr = Object.assign(new Error("timeout"), { code: "57014" });
    mockUpdateWhere.mockRejectedValue(timeoutErr);

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.code).toBe("DB_TIMEOUT");
    expect(mockSubmitSale).not.toHaveBeenCalled();
  });
});
