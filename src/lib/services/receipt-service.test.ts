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

const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

const mockTxExecute = vi.fn().mockResolvedValue(undefined);
const mockTransaction = vi
  .fn()
  .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      execute: mockTxExecute,
    };
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

    mockTxExecute.mockResolvedValue(undefined);
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          select: mockSelect,
          insert: mockInsert,
          update: mockUpdate,
          execute: mockTxExecute,
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

  it("idempotency: ritorna errore se il documento esistente è PENDING", async () => {
    mockDocumentReturning.mockResolvedValue([]);
    mockLimit.mockResolvedValueOnce([
      {
        id: "doc-123",
        status: "PENDING",
        adeTransactionId: null,
        adeProgressive: null,
      },
    ]);

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.error).toBeDefined();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("aggiorna documento a REJECTED se AdE ritorna esito:false", async () => {
    mockSubmitSale.mockResolvedValue({
      esito: false,
      idtrx: null,
      progressivo: null,
      errori: [{ codice: "ERR002", descrizione: "Dati non validi" }],
    });

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.error).toMatch(/rifiutato/i);
    const setArg = mockUpdateSet.mock.calls[0][0];
    expect(setArg.status).toBe("REJECTED");
  });

  it("aggiorna documento a ERROR e ritorna errore se AdE login fallisce", async () => {
    mockLogin.mockRejectedValue(new Error("AdE login failed"));

    const { emitReceiptForBusiness } = await import("./receipt-service");
    const result = await emitReceiptForBusiness(VALID_INPUT);

    expect(result.error).toBeDefined();
    const setArg = mockUpdateSet.mock.calls[0][0];
    expect(setArg.status).toBe("ERROR");
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
});
