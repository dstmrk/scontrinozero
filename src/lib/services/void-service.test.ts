// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockFetchAdePrerequisites = vi.fn();
vi.mock("@/lib/server-auth", () => ({
  fetchAdePrerequisites: (...args: unknown[]) =>
    mockFetchAdePrerequisites(...args),
}));

// DB mock
const mockSelectLimit = vi.fn();
const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockSelectLimit });
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

const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

// transaction: calls the callback with a tx proxy that shares mockUpdate
const mockTxExecute = vi.fn().mockResolvedValue(undefined);
const mockTransaction = vi
  .fn()
  .mockImplementation(
    async (
      callback: (tx: {
        update: typeof mockUpdate;
        execute: typeof mockTxExecute;
      }) => Promise<void>,
    ) => callback({ update: mockUpdate, execute: mockTxExecute }),
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
vi.mock("@/lib/ade", () => ({
  createAdeClient: vi.fn().mockReturnValue({
    login: mockLogin,
    logout: mockLogout,
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

    // select: first call returns saleDoc, subsequent calls return idempotency results
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
    mockSelectLimit.mockResolvedValue([FAKE_SALE_DOC]);

    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockReturning.mockResolvedValue([FAKE_VOID_DOC]);

    mockUpdate.mockReturnValue({ set: mockUpdateSet });

    mockLogin.mockResolvedValue({});
    mockGetDocument.mockResolvedValue(FAKE_ADE_DETAIL);
    mockSubmitVoid.mockResolvedValue(FAKE_ADE_RESPONSE);
    mockLogout.mockResolvedValue(undefined);

    mockTxExecute.mockResolvedValue(undefined);
    mockTransaction.mockImplementation(
      async (
        callback: (tx: {
          update: typeof mockUpdate;
          execute: typeof mockTxExecute;
        }) => Promise<void>,
      ) => callback({ update: mockUpdate, execute: mockTxExecute }),
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
        },
      ]);

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.error).toBeDefined();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("aggiorna documento a REJECTED se AdE ritorna esito:false", async () => {
    mockSubmitVoid.mockResolvedValue({
      esito: false,
      idtrx: null,
      progressivo: null,
      errori: [{ codice: "ERR001", descrizione: "Documento già annullato" }],
    });

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.error).toMatch(/rifiutato/i);
    const setArg = mockUpdateSet.mock.calls[0][0];
    expect(setArg.status).toBe("REJECTED");
    expect(setArg.adeResponse).toBeDefined();
    expect(mockUpdateSet.mock.calls).toHaveLength(1);
  });

  it("aggiorna documento a ERROR e ritorna errore se AdE login fallisce", async () => {
    mockLogin.mockRejectedValue(new Error("AdE login failed"));

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.error).toBeDefined();
    const setArg = mockUpdateSet.mock.calls[0][0];
    expect(setArg.status).toBe("ERROR");
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

  it("ritorna errore se la transaction finale fallisce (rollback atomico)", async () => {
    mockTransaction.mockRejectedValue(new Error("DB transaction failed"));

    const { voidReceiptForBusiness } = await import("./void-service");
    const result = await voidReceiptForBusiness(VALID_INPUT);

    expect(result.error).toBeDefined();
    // The ERROR status update (outside the transaction) should have been called
    const statusUpdates = mockUpdateSet.mock.calls.map((c) => c[0].status);
    expect(statusUpdates).toContain("ERROR");
  });
});
