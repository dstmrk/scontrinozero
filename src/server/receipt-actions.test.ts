// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockRateLimiterCheck = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
}));

const mockGetAuthenticatedUser = vi.fn();
const mockCheckBusinessOwnership = vi.fn();
const mockFetchAdePrerequisites = vi.fn();
vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
  checkBusinessOwnership: (...args: unknown[]) =>
    mockCheckBusinessOwnership(...args),
  fetchAdePrerequisites: (...args: unknown[]) =>
    mockFetchAdePrerequisites(...args),
}));

const mockGetPlan = vi.fn();
const mockCanEmit = vi.fn();
vi.mock("@/lib/plans", () => ({
  getPlan: (...args: unknown[]) => mockGetPlan(...args),
  canEmit: (...args: unknown[]) => mockCanEmit(...args),
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

const FAKE_USER = { id: "user-123" };
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

describe("receipt-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADE_MODE = "mock";

    mockRateLimiterCheck.mockReturnValue({
      success: true,
      remaining: 29,
      resetAt: 0,
    });
    mockGetAuthenticatedUser.mockResolvedValue(FAKE_USER);
    mockCheckBusinessOwnership.mockResolvedValue(null);
    mockFetchAdePrerequisites.mockResolvedValue(FAKE_PREREQUISITES);
    mockGetPlan.mockResolvedValue({
      plan: "trial",
      trialStartedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      planExpiresAt: null,
    });
    mockCanEmit.mockReturnValue(true);

    // Restore transaction default implementation after clearAllMocks
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

    // DB: insert routing by table
    mockInsert.mockImplementation((table: unknown) => {
      if (table === "commercial-documents-table") {
        return { values: mockDocumentInsertValues };
      }
      return { values: mockLinesInsertValues };
    });
    mockDocumentReturning.mockResolvedValue([FAKE_DOCUMENT]);

    // ADE client
    mockLogin.mockResolvedValue({});
    mockSubmitSale.mockResolvedValue(FAKE_ADE_RESPONSE);
    mockLogout.mockResolvedValue(undefined);
  });

  describe("emitReceipt", () => {
    it("happy path: emits receipt and returns documentId and adeTransactionId", async () => {
      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt(VALID_INPUT);

      expect(result.error).toBeUndefined();
      expect(result.documentId).toBe("doc-123");
      expect(result.adeTransactionId).toBe("trx-001");
      expect(result.adeProgressive).toBe("001");
      expect(mockLogin).toHaveBeenCalledWith({
        codiceFiscale: "decrypted-value",
        password: "decrypted-value",
        pin: "decrypted-value",
      });
      expect(mockMapSaleToAdePayload).toHaveBeenCalled();
      expect(mockSubmitSale).toHaveBeenCalled();
      expect(mockLogout).toHaveBeenCalled();
      // publicRequest stores paymentMethod (no lotteryCode when absent)
      const insertValuesArg = mockDocumentInsertValues.mock.calls[0][0];
      expect(insertValuesArg.publicRequest).toEqual({ paymentMethod: "PC" });
      // Document updated to ACCEPTED
      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.status).toBe("ACCEPTED");
      expect(setArg.adeTransactionId).toBe("trx-001");
      expect(setArg.adeProgressive).toBe("001");
    });

    it("returns error when emit rate limit is exceeded", async () => {
      mockRateLimiterCheck.mockReturnValue({
        success: false,
        remaining: 0,
        resetAt: Date.now(),
      });

      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt(VALID_INPUT);

      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/Troppi/i);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns error when businessId is missing", async () => {
      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt({ ...VALID_INPUT, businessId: "" });

      expect(result.error).toBeDefined();
      expect(result.error).toContain("Business ID");
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns error when lines are empty", async () => {
      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt({ ...VALID_INPUT, lines: [] });

      expect(result.error).toBeDefined();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns error when business ownership check fails (IDOR)", async () => {
      mockCheckBusinessOwnership.mockResolvedValue({
        error: "Business non trovato o non autorizzato.",
      });

      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt(VALID_INPUT);

      expect(result.error).toContain("non autorizzato");
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns error when AdE credentials are not found", async () => {
      mockFetchAdePrerequisites.mockResolvedValue({
        error: "Credenziali AdE non trovate. Completa la configurazione.",
      });

      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt(VALID_INPUT);

      expect(result.error).toBeDefined();
      expect(result.error).toContain("Credenziali");
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns error when AdE credentials are not verified", async () => {
      mockFetchAdePrerequisites.mockResolvedValue({
        error:
          "Credenziali AdE non verificate. Verifica le credenziali nelle impostazioni.",
      });

      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt(VALID_INPUT);

      expect(result.error).toBeDefined();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns error when business data is not found", async () => {
      mockFetchAdePrerequisites.mockResolvedValue({
        error: "Dati business non trovati.",
      });

      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt(VALID_INPUT);

      expect(result.error).toBeDefined();
      expect(result.error).toContain("business");
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it("idempotency: returns existing IDs when document is already ACCEPTED", async () => {
      mockDocumentReturning.mockResolvedValue([]); // Conflict — already exists
      mockLimit.mockResolvedValueOnce([
        {
          id: "doc-123",
          status: "ACCEPTED",
          adeTransactionId: "trx-001",
          adeProgressive: "001",
        },
      ]);

      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt(VALID_INPUT);

      expect(result.error).toBeUndefined();
      expect(result.documentId).toBe("doc-123");
      expect(result.adeTransactionId).toBe("trx-001");
      expect(mockLogin).not.toHaveBeenCalled();
      expect(mockSubmitSale).not.toHaveBeenCalled();
    });

    it("idempotency: returns error when existing document is PENDING (inconsistent state)", async () => {
      mockDocumentReturning.mockResolvedValue([]); // Conflict — already exists
      mockLimit.mockResolvedValueOnce([
        {
          id: "doc-123",
          status: "PENDING",
          adeTransactionId: null,
          adeProgressive: null,
        },
      ]);

      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt(VALID_INPUT);

      expect(result.error).toBeDefined();
      expect(mockLogin).not.toHaveBeenCalled();
      expect(mockSubmitSale).not.toHaveBeenCalled();
    });

    it("updates document to ERROR and returns error when AdE login fails", async () => {
      mockLogin.mockRejectedValue(new Error("AdE login failed"));

      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt(VALID_INPUT);

      expect(result.error).toBeDefined();
      expect(mockUpdate).toHaveBeenCalled();
      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.status).toBe("ERROR");
    });

    it("logs error and updates document to ERROR when AdE submitSale fails", async () => {
      mockSubmitSale.mockRejectedValue(new Error("AdE unavailable"));

      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt(VALID_INPUT);

      expect(result.error).toBeDefined();
      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.status).toBe("ERROR");
    });

    it("returns error and sets document to REJECTED when AdE rejects with esito:false", async () => {
      mockSubmitSale.mockResolvedValue({
        esito: false,
        idtrx: null,
        progressivo: null,
        errori: [{ codice: "ERR002", descrizione: "Dati non validi" }],
      });

      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt(VALID_INPUT);

      expect(result.error).toMatch(/rifiutato/i);
      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.status).toBe("REJECTED");
      expect(setArg.adeResponse).toBeDefined();
    });

    it("insert is wrapped in a transaction (document + lines atomic)", async () => {
      const { emitReceipt } = await import("./receipt-actions");
      await emitReceipt(VALID_INPUT);

      expect(mockTransaction).toHaveBeenCalledOnce();
    });

    it("persiste lotteryCode in publicRequest e colonna quando PE + codice valido", async () => {
      const { emitReceipt } = await import("./receipt-actions");
      const input: SubmitReceiptInput = {
        ...VALID_INPUT,
        paymentMethod: "PE",
        lotteryCode: "YYWLR30G",
      };
      const result = await emitReceipt(input);

      expect(result.error).toBeUndefined();
      const insertValuesArg = mockDocumentInsertValues.mock.calls[0][0];
      expect(insertValuesArg.publicRequest).toEqual({
        paymentMethod: "PE",
        lotteryCode: "YYWLR30G",
      });
      expect(insertValuesArg.lotteryCode).toBe("YYWLR30G");
    });

    it("ignora lotteryCode quando il metodo di pagamento non è PE", async () => {
      const { emitReceipt } = await import("./receipt-actions");
      const input: SubmitReceiptInput = {
        ...VALID_INPUT,
        paymentMethod: "PC",
        lotteryCode: "YYWLR30G",
      };
      const result = await emitReceipt(input);

      expect(result.error).toBeUndefined();
      const insertValuesArg = mockDocumentInsertValues.mock.calls[0][0];
      expect(insertValuesArg.publicRequest).toEqual({ paymentMethod: "PC" });
      expect(insertValuesArg.lotteryCode).toBeNull();
    });

    it("restituisce errore se lotteryCode non rispetta il formato 8 char [A-Z0-9]", async () => {
      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt({
        ...VALID_INPUT,
        paymentMethod: "PE",
        lotteryCode: "TOOLONG99",
      });

      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/lotteria/i);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("passa lotteryCode al mapper AdE quando presente", async () => {
      const { emitReceipt } = await import("./receipt-actions");
      await emitReceipt({
        ...VALID_INPUT,
        paymentMethod: "PE",
        lotteryCode: "YYWLR30G",
      });

      expect(mockMapSaleToAdePayload).toHaveBeenCalledWith(
        expect.objectContaining({ lotteryCode: "YYWLR30G" }),
        expect.anything(),
      );
    });

    it("passa lotteryCode null al mapper quando non fornito", async () => {
      const { emitReceipt } = await import("./receipt-actions");
      await emitReceipt(VALID_INPUT);

      expect(mockMapSaleToAdePayload).toHaveBeenCalledWith(
        expect.objectContaining({ lotteryCode: null }),
        expect.anything(),
      );
    });

    it("restituisce errore se lotteryCode fornito con totale < €1 (PE)", async () => {
      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt({
        ...VALID_INPUT,
        paymentMethod: "PE",
        lotteryCode: "YYWLR30G",
        lines: [
          {
            id: "line-1",
            description: "Caramella",
            quantity: 1,
            grossUnitPrice: 0.5,
            vatCode: "22",
          },
        ],
      });

      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/importo minimo/i);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("accetta lotteryCode con totale esattamente €1,00 (PE, boundary)", async () => {
      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt({
        ...VALID_INPUT,
        paymentMethod: "PE",
        lotteryCode: "YYWLR30G",
        lines: [
          {
            id: "line-1",
            description: "Prodotto",
            quantity: 1,
            grossUnitPrice: 1.0,
            vatCode: "22",
          },
        ],
      });

      expect(result.error).toBeUndefined();
    });

    it("non restituisce errore se lotteryCode assente con totale < €1 (PE)", async () => {
      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt({
        ...VALID_INPUT,
        paymentMethod: "PE",
        lotteryCode: null,
        lines: [
          {
            id: "line-1",
            description: "Caramella",
            quantity: 1,
            grossUnitPrice: 0.5,
            vatCode: "22",
          },
        ],
      });

      expect(result.error).toBeUndefined();
    });
  });
});
