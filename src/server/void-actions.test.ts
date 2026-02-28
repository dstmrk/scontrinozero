// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetAuthenticatedUser = vi.fn();
const mockCheckBusinessOwnership = vi.fn();
vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
  checkBusinessOwnership: (...args: unknown[]) =>
    mockCheckBusinessOwnership(...args),
}));

// DB mock — ogni select() restituisce un builder riconfigurabile
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

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
}));

const mockDecrypt = vi.fn().mockReturnValue("decrypted-value");
vi.mock("@/lib/crypto", () => ({
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
  getEncryptionKey: () => Buffer.alloc(32),
}));

const mockLogin = vi.fn();
const mockLogout = vi.fn();
const mockGetFiscalData = vi.fn();
const mockGetDocument = vi.fn();
const mockSubmitVoid = vi.fn();
vi.mock("@/lib/ade", () => ({
  createAdeClient: vi.fn().mockReturnValue({
    login: mockLogin,
    logout: mockLogout,
    getFiscalData: mockGetFiscalData,
    getDocument: mockGetDocument,
    submitVoid: mockSubmitVoid,
  }),
}));

const mockMapVoidToAdePayload = vi.fn().mockReturnValue({ mapped: true });
vi.mock("@/lib/ade/mapper", () => ({
  mapVoidToAdePayload: (...args: unknown[]) => mockMapVoidToAdePayload(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Crea un Drizzle query builder mock con metodi concatenabili.
 * Il risultato finale viene restituito da `orderBy()` e `limit()`.
 */
function makeSelectBuilder(result: unknown[]) {
  const builder = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockResolvedValue(result),
  };
  builder.from.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  return builder;
}

/** Insert chain: values → onConflictDoNothing → returning */
const mockReturning = vi.fn();
const mockOnConflictDoNothing = vi
  .fn()
  .mockReturnValue({ returning: mockReturning });
const mockInsertValues = vi
  .fn()
  .mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });

/** Update chain: set → where */
const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import type { VoidReceiptInput } from "@/types/storico";

const FAKE_USER = { id: "user-123" };

const FAKE_SALE_DOC = {
  id: "sale-doc-uuid",
  businessId: "biz-789",
  kind: "SALE",
  status: "ACCEPTED",
  adeTransactionId: "trx-001",
  adeProgressive: "DCW2026/5111-2188",
  createdAt: new Date("2026-02-15T10:00:00Z"),
};

const FAKE_CRED = {
  businessId: "biz-789",
  encryptedCodiceFiscale: "enc-cf",
  encryptedPassword: "enc-pw",
  encryptedPin: "enc-pin",
  keyVersion: 1,
  verifiedAt: new Date(),
};

const FAKE_VOID_DOC = { id: "void-doc-uuid" };

const FAKE_ADE_DETAIL = {
  idtrx: "trx-001",
  numeroProgressivo: "DCW2026/5111-2188",
  elementiContabili: [{ idElementoContabile: "270270040" }],
};

const FAKE_ADE_RESPONSE = {
  esito: true,
  idtrx: "trx-void-001",
  progressivo: "DCW2026/5111-3000",
  errori: [],
};

const FAKE_FISCAL_DATA = {
  identificativiFiscali: { partitaIva: "12345678901" },
  altriDatiIdentificativi: {},
  multiAttivita: [],
  multiSede: [],
};

const VALID_VOID_INPUT: VoidReceiptInput = {
  documentId: "sale-doc-uuid",
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440001",
  businessId: "biz-789",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("void-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENCRYPTION_KEY = "a".repeat(64);
    process.env.ADE_MODE = "mock";

    mockGetAuthenticatedUser.mockResolvedValue(FAKE_USER);
    mockCheckBusinessOwnership.mockResolvedValue(null);

    // Insert mock
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockReturning.mockResolvedValue([FAKE_VOID_DOC]);

    // Update mock
    mockUpdate.mockReturnValue({ set: mockUpdateSet });

    // AdE mocks
    mockLogin.mockResolvedValue({});
    mockGetFiscalData.mockResolvedValue(FAKE_FISCAL_DATA);
    mockGetDocument.mockResolvedValue(FAKE_ADE_DETAIL);
    mockSubmitVoid.mockResolvedValue(FAKE_ADE_RESPONSE);
    mockLogout.mockResolvedValue(undefined);

    // Default select chain: saleDoc + credentials
    mockSelect.mockReset();
    mockSelect
      .mockReturnValueOnce(makeSelectBuilder([FAKE_SALE_DOC]))
      .mockReturnValueOnce(makeSelectBuilder([FAKE_CRED]));
  });

  describe("voidReceipt", () => {
    it("happy path: submits void and returns voidDocumentId + adeProgressive", async () => {
      const { voidReceipt } = await import("./void-actions");
      const result = await voidReceipt(VALID_VOID_INPUT);

      expect(result.error).toBeUndefined();
      expect(result.voidDocumentId).toBe("void-doc-uuid");
      expect(result.adeTransactionId).toBe("trx-void-001");
      expect(result.adeProgressive).toBe("DCW2026/5111-3000");

      // AdE flow was called in order
      expect(mockLogin).toHaveBeenCalledWith({
        codiceFiscale: "decrypted-value",
        password: "decrypted-value",
        pin: "decrypted-value",
      });
      expect(mockGetFiscalData).toHaveBeenCalled();
      expect(mockGetDocument).toHaveBeenCalledWith("trx-001");
      expect(mockMapVoidToAdePayload).toHaveBeenCalled();
      expect(mockSubmitVoid).toHaveBeenCalled();
      expect(mockLogout).toHaveBeenCalled();
    });

    it("updates VOID doc to VOID_ACCEPTED on success", async () => {
      const { voidReceipt } = await import("./void-actions");
      await voidReceipt(VALID_VOID_INPUT);

      const firstUpdateSet = mockUpdateSet.mock.calls[0][0];
      expect(firstUpdateSet.status).toBe("VOID_ACCEPTED");
      expect(firstUpdateSet.adeTransactionId).toBe("trx-void-001");
      expect(firstUpdateSet.adeProgressive).toBe("DCW2026/5111-3000");
    });

    it("marks original SALE doc as VOID_ACCEPTED on success", async () => {
      const { voidReceipt } = await import("./void-actions");
      await voidReceipt(VALID_VOID_INPUT);

      // Second update: original SALE → VOID_ACCEPTED
      const secondUpdateSet = mockUpdateSet.mock.calls[1][0];
      expect(secondUpdateSet.status).toBe("VOID_ACCEPTED");
    });

    it("returns error when SALE document is not found (also covers IDOR: wrong businessId)", async () => {
      mockSelect.mockReset();
      mockSelect.mockReturnValueOnce(makeSelectBuilder([])); // saleDoc not found

      const { voidReceipt } = await import("./void-actions");
      const result = await voidReceipt(VALID_VOID_INPUT);

      expect(result.error).toBeDefined();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it("returns error when documentId belongs to a different business (IDOR prevented)", async () => {
      // saleDoc not returned because businessId filter excludes it
      mockSelect.mockReset();
      mockSelect.mockReturnValueOnce(makeSelectBuilder([]));

      const { voidReceipt } = await import("./void-actions");
      const result = await voidReceipt({
        ...VALID_VOID_INPUT,
        documentId: "other-business-doc-uuid",
      });

      expect(result.error).toMatch(/non trovato/i);
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it("returns error when document is not kind=SALE", async () => {
      mockSelect.mockReset();
      mockSelect.mockReturnValueOnce(
        makeSelectBuilder([{ ...FAKE_SALE_DOC, kind: "VOID" }]),
      );

      const { voidReceipt } = await import("./void-actions");
      const result = await voidReceipt(VALID_VOID_INPUT);

      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/vendita/i);
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it("returns error when document is already VOID_ACCEPTED", async () => {
      mockSelect.mockReset();
      mockSelect.mockReturnValueOnce(
        makeSelectBuilder([{ ...FAKE_SALE_DOC, status: "VOID_ACCEPTED" }]),
      );

      const { voidReceipt } = await import("./void-actions");
      const result = await voidReceipt(VALID_VOID_INPUT);

      expect(result.error).toBeDefined();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it("returns error when saleDoc has no adeTransactionId or adeProgressive", async () => {
      mockSelect.mockReset();
      mockSelect.mockReturnValueOnce(
        makeSelectBuilder([
          { ...FAKE_SALE_DOC, adeTransactionId: null, adeProgressive: null },
        ]),
      );

      const { voidReceipt } = await import("./void-actions");
      const result = await voidReceipt(VALID_VOID_INPUT);

      expect(result.error).toMatch(/Dati AdE/i);
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it("returns error when credentials are missing", async () => {
      mockSelect.mockReset();
      mockSelect
        .mockReturnValueOnce(makeSelectBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeSelectBuilder([])); // no credentials

      const { voidReceipt } = await import("./void-actions");
      const result = await voidReceipt(VALID_VOID_INPUT);

      expect(result.error).toMatch(/Credenziali/i);
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it("returns error when credentials are not verified", async () => {
      mockSelect.mockReset();
      mockSelect
        .mockReturnValueOnce(makeSelectBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(
          makeSelectBuilder([{ ...FAKE_CRED, verifiedAt: null }]),
        );

      const { voidReceipt } = await import("./void-actions");
      const result = await voidReceipt(VALID_VOID_INPUT);

      expect(result.error).toBeDefined();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it("idempotency: returns existing IDs when VOID_ACCEPTED document already exists", async () => {
      mockReturning.mockResolvedValue([]); // conflict — already inserted

      // idempotency select returns VOID_ACCEPTED doc
      mockSelect.mockReturnValueOnce(
        makeSelectBuilder([
          {
            id: "void-doc-uuid",
            status: "VOID_ACCEPTED",
            adeTransactionId: "trx-void-001",
            adeProgressive: "DCW2026/5111-3000",
          },
        ]),
      );

      const { voidReceipt } = await import("./void-actions");
      const result = await voidReceipt(VALID_VOID_INPUT);

      expect(result.error).toBeUndefined();
      expect(result.voidDocumentId).toBe("void-doc-uuid");
      expect(result.adeTransactionId).toBe("trx-void-001");
      expect(mockLogin).not.toHaveBeenCalled();
      expect(mockSubmitVoid).not.toHaveBeenCalled();
    });

    it("idempotency: returns error when existing VOID doc is PENDING (inconsistent state)", async () => {
      mockReturning.mockResolvedValue([]); // conflict

      // idempotency select returns PENDING doc
      mockSelect.mockReturnValueOnce(
        makeSelectBuilder([
          {
            id: "void-doc-uuid",
            status: "PENDING",
            adeTransactionId: null,
            adeProgressive: null,
          },
        ]),
      );

      const { voidReceipt } = await import("./void-actions");
      const result = await voidReceipt(VALID_VOID_INPUT);

      expect(result.error).toBeDefined();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it("returns error and sets VOID doc to ERROR when AdE submitVoid fails", async () => {
      mockSubmitVoid.mockRejectedValue(new Error("AdE unavailable"));

      const { voidReceipt } = await import("./void-actions");
      const result = await voidReceipt(VALID_VOID_INPUT);

      expect(result.error).toBeDefined();
      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.status).toBe("ERROR");
    });

    it("returns error and sets VOID doc to ERROR when AdE login fails", async () => {
      mockLogin.mockRejectedValue(new Error("AdE login failed"));

      const { voidReceipt } = await import("./void-actions");
      const result = await voidReceipt(VALID_VOID_INPUT);

      expect(result.error).toBeDefined();
      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.status).toBe("ERROR");
    });

    it("returns error when business ownership check fails", async () => {
      mockCheckBusinessOwnership.mockResolvedValue({
        error: "Business non trovato o non autorizzato.",
      });

      const { voidReceipt } = await import("./void-actions");
      const result = await voidReceipt(VALID_VOID_INPUT);

      expect(result.error).toMatch(/autorizzato/i);
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });
});
