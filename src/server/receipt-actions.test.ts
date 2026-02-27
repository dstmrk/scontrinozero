// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockGetAuthenticatedUser = vi.fn();
const mockCheckBusinessOwnership = vi.fn();
vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
  checkBusinessOwnership: (...args: unknown[]) =>
    mockCheckBusinessOwnership(...args),
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

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  }),
}));

vi.mock("@/db/schema", () => ({
  adeCredentials: "ade-credentials-table",
  commercialDocuments: "commercial-documents-table",
  commercialDocumentLines: "commercial-document-lines-table",
}));

const mockDecrypt = vi.fn().mockReturnValue("decrypted-value");
vi.mock("@/lib/crypto", () => ({
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
  getEncryptionKey: () => Buffer.alloc(32),
}));

const mockLogin = vi.fn();
const mockLogout = vi.fn();
const mockGetFiscalData = vi.fn();
const mockSubmitSale = vi.fn();
vi.mock("@/lib/ade", () => ({
  createAdeClient: vi.fn().mockReturnValue({
    login: mockLogin,
    logout: mockLogout,
    getFiscalData: mockGetFiscalData,
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
const FAKE_CRED = {
  businessId: "biz-789",
  encryptedCodiceFiscale: "enc-cf",
  encryptedPassword: "enc-pw",
  encryptedPin: "enc-pin",
  keyVersion: 1,
  verifiedAt: new Date(),
};
const FAKE_DOCUMENT = { id: "doc-123" };
const FAKE_ADE_RESPONSE = {
  esito: true,
  idtrx: "trx-001",
  progressivo: "001",
  errori: [],
};
const FAKE_FISCAL_DATA = {
  identificativiFiscali: {
    partitaIva: "12345678901",
    codiceFiscale: "CF",
    codicePaese: "IT",
  },
  altriDatiIdentificativi: { denominazione: "Test SRL" },
  multiAttivita: [],
  multiSede: [],
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
    process.env.ENCRYPTION_KEY = "a".repeat(64);
    process.env.ENCRYPTION_KEY_VERSION = "1";
    process.env.ADE_MODE = "mock";

    mockGetAuthenticatedUser.mockResolvedValue(FAKE_USER);
    mockCheckBusinessOwnership.mockResolvedValue(null);

    // DB: select credentials
    mockLimit.mockResolvedValue([FAKE_CRED]);

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
    mockGetFiscalData.mockResolvedValue(FAKE_FISCAL_DATA);
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
      expect(mockGetFiscalData).toHaveBeenCalled();
      expect(mockMapSaleToAdePayload).toHaveBeenCalled();
      expect(mockSubmitSale).toHaveBeenCalled();
      expect(mockLogout).toHaveBeenCalled();
      // publicRequest stores paymentMethod at insert time
      const insertValuesArg = mockDocumentInsertValues.mock.calls[0][0];
      expect(insertValuesArg.publicRequest).toEqual({ paymentMethod: "PC" });
      // Document updated to ACCEPTED
      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.status).toBe("ACCEPTED");
      expect(setArg.adeTransactionId).toBe("trx-001");
      expect(setArg.adeProgressive).toBe("001");
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
      mockLimit.mockResolvedValue([]); // No credentials row

      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt(VALID_INPUT);

      expect(result.error).toBeDefined();
      expect(result.error).toContain("Credenziali");
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns error when AdE credentials are not verified", async () => {
      mockLimit.mockResolvedValue([{ ...FAKE_CRED, verifiedAt: null }]);

      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt(VALID_INPUT);

      expect(result.error).toBeDefined();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("idempotency: returns success without reprocessing on duplicate key", async () => {
      mockDocumentReturning.mockResolvedValue([]); // Conflict — already exists

      const { emitReceipt } = await import("./receipt-actions");
      const result = await emitReceipt(VALID_INPUT);

      expect(result.error).toBeUndefined();
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
  });
});
