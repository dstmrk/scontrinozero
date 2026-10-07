// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AdeNetworkError,
  AdePortalError,
  AdeReauthRequiredError,
} from "@/lib/ade/errors";
import type { AdeDocumentDetail } from "@/lib/ade/types";
import type { ReturnReceiptInput } from "@/types/storico";
import {
  serie1Reso1,
  serie1Reso2,
} from "../../../tests/_helpers/reso-har-fixtures";

// --- Mocks ---

const mockFetchAdePrerequisites = vi.fn();
vi.mock("@/lib/server-auth", () => ({
  fetchAdePrerequisites: (...args: unknown[]) =>
    mockFetchAdePrerequisites(...args),
  toAdeSessionParams: (
    businessId: string,
    prerequisites: { method: string },
  ) =>
    prerequisites.method === "cie"
      ? { businessId, method: "cie" }
      : { businessId, method: "fisconline", credentials: {} },
}));

// DB: ogni `.limit()` consuma la coda `mockLimitResults` nell'ordine delle
// query del service; `.orderBy()` torna le righe della vendita; un `.where()`
// awaitato direttamente (findClaimedTransactionIds) torna `[]`.
let mockLimitResults: unknown[][] = [];
let mockSaleLines: unknown[] = [];
const mockLimit = vi.fn(() => Promise.resolve(mockLimitResults.shift() ?? []));
const mockOrderBy = vi.fn(() => Promise.resolve(mockSaleLines));
const mockSelectWhere = vi.fn(() => ({
  limit: mockLimit,
  orderBy: mockOrderBy,
  then: (onFulfilled: (rows: unknown[]) => unknown) => onFulfilled([]),
}));
const mockSelect = vi.fn(() => ({
  from: () => ({ where: mockSelectWhere }),
}));

const mockInsertReturning = vi.fn();
const mockInsertValues = vi.fn((_values: unknown) => ({
  onConflictDoNothing: () => ({ returning: mockInsertReturning }),
  then: (onFulfilled: (value: undefined) => unknown) => onFulfilled(undefined),
}));
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

const mockClaimReturning = vi.fn();
const mockUpdateWhere = vi.fn(() => ({
  returning: mockClaimReturning,
  then: (onFulfilled: (value: undefined) => unknown) => onFulfilled(undefined),
}));
const mockUpdateSet = vi.fn((_set: Record<string, unknown>) => ({
  where: mockUpdateWhere,
}));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

const mockDeleteWhere = vi.fn(() => Promise.resolve(undefined));
const mockDelete = vi.fn((_table: unknown) => ({ where: mockDeleteWhere }));

const runInTx = async (callback: (tx: unknown) => unknown) =>
  callback({
    update: mockUpdate,
    insert: mockInsert,
    delete: mockDelete,
    execute: vi.fn().mockResolvedValue(undefined),
  });
const mockTransaction = vi.fn(runInTx);

vi.mock("@/db", () => ({
  getDb: () => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    transaction: mockTransaction,
  }),
}));

vi.mock("@/db/schema", () => ({
  commercialDocuments: { table: "commercial_documents" },
  commercialDocumentLines: { table: "commercial_document_lines" },
}));

const mockGetDocument = vi.fn();
const mockSubmitReturn = vi.fn();
const mockSearchDocuments = vi.fn();
const mockAdeClient = {
  getDocument: mockGetDocument,
  submitReturn: mockSubmitReturn,
  searchDocuments: mockSearchDocuments,
};
const mockIsInteractiveSessionMissing = vi.fn();
vi.mock("@/lib/ade", () => ({
  isInteractiveSessionMissing: (...args: unknown[]) =>
    mockIsInteractiveSessionMissing(...args),
  withAdeSession: async (
    _params: unknown,
    fn: (client: typeof mockAdeClient) => unknown,
  ) => fn(mockAdeClient),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// --- Fixtures ---

const SALE_PROGRESSIVE = "DCW2026/4801-7890";

const SALE_DOC = {
  id: "sale-1",
  businessId: "biz-1",
  kind: "SALE",
  status: "ACCEPTED",
  adeTransactionId: "247989425",
  adeProgressive: SALE_PROGRESSIVE,
  createdAt: new Date("2026-10-02T14:13:31Z"),
};

const SALE_LINES = [
  {
    lineIndex: 0,
    description: "doppio",
    quantity: "2.000",
    grossUnitPrice: "0.03",
    lineDiscount: "0.01",
    vatCode: "22",
  },
  {
    lineIndex: 1,
    description: "singolo",
    quantity: "1.000",
    grossUnitPrice: "0.02",
    lineDiscount: "0.00",
    vatCode: "N2",
  },
];

const CEDENTE = {
  identificativiFiscali: {
    codicePaese: "IT",
    partitaIva: "12345678901",
    codiceFiscale: "RSSMRA80A01H501A",
  },
  altriDatiIdentificativi: {
    denominazione: "Test",
    nome: "",
    cognome: "",
    indirizzo: "Corso S",
    numeroCivico: "22",
    cap: "10126",
    comune: "",
    provincia: "",
    nazione: "IT",
    modificati: true,
    defAliquotaIVA: "22",
    nuovoUtente: false,
  },
  multiAttivita: [],
  multiSede: [],
};

const INPUT: ReturnReceiptInput = {
  documentId: "sale-1",
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440001",
  businessId: "biz-1",
  quantities: [1, 1],
};

const ADE_OK = {
  esito: true,
  idtrx: "247990317",
  progressivo: "DCW2026/4801-8782",
  registeredAt: "2026-10-02T14:15:16.000Z",
  errori: [],
};

const SALE_ROW_ON_ADE = {
  idtrx: "247989425",
  numeroProgressivo: SALE_PROGRESSIVE,
  cfCliente: "",
  data: "02/10/2026 16:13:31",
  tipoOperazione: "V" as const,
  ammontareComplessivo: 0.07,
};

const STALE = new Date(Date.now() - 60 * 60 * 1000);

function existingReturn(over: Record<string, unknown> = {}) {
  return {
    id: "return-old",
    kind: "RETURN",
    status: "PENDING",
    returnedDocumentId: "sale-1",
    requestHash: null,
    publicRequest: { documentId: "sale-1", quantities: [1, 1] },
    adeTransactionId: null,
    adeProgressive: null,
    createdAt: STALE,
    updatedAt: STALE,
    ...over,
  };
}

function detail(doc: AdeDocumentDetail): AdeDocumentDetail {
  return structuredClone(doc);
}

/** Tutte le `set` passate agli UPDATE, in ordine. */
function updateSets(): Record<string, unknown>[] {
  return mockUpdateSet.mock.calls.map((call) => call[0]);
}

async function run(input: ReturnReceiptInput = INPUT, apiKeyId?: string) {
  const { returnReceiptForBusiness } = await import("./return-service");
  return returnReceiptForBusiness(input, apiKeyId);
}

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` azzera le chiamate, non le implementazioni né le code
  // `...Once`: i mock che i test sovrascrivono ripartono da zero qui.
  for (const mock of [
    mockTransaction,
    mockSearchDocuments,
    mockGetDocument,
    mockSubmitReturn,
    mockInsertReturning,
    mockClaimReturning,
    mockLimit,
  ]) {
    mock.mockReset();
  }
  mockTransaction.mockImplementation(runInTx);
  mockLimit.mockImplementation(() =>
    Promise.resolve(mockLimitResults.shift() ?? []),
  );
  // Coda di default: la vendita.
  mockLimitResults = [[SALE_DOC]];
  mockSaleLines = SALE_LINES;
  mockFetchAdePrerequisites.mockResolvedValue({
    method: "fisconline",
    cedentePrestatore: CEDENTE,
  });
  mockIsInteractiveSessionMissing.mockReturnValue(false);
  mockInsertReturning.mockResolvedValue([{ id: "return-new" }]);
  mockClaimReturning.mockResolvedValue([{ id: "claimed" }]);
  mockSearchDocuments.mockResolvedValue({
    totalCount: 1,
    elencoRisultati: [SALE_ROW_ON_ADE],
  });
  mockGetDocument.mockResolvedValue(detail(serie1Reso1.before));
  mockSubmitReturn.mockResolvedValue(ADE_OK);
});

describe("returnReceiptForBusiness — percorso normale", () => {
  it("trasmette il payload del portale e chiude la riga ACCEPTED", async () => {
    const result = await run();

    expect(result).toEqual({
      returnDocumentId: "return-new",
      adeTransactionId: "247990317",
      adeProgressive: "DCW2026/4801-8782",
    });
    // Oracolo HAR.md #19: lo stesso documentoCommerciale che il portale ha
    // trasmesso per lo stesso reso.
    const payload = mockSubmitReturn.mock.calls[0]![0];
    expect(payload.documentoCommerciale).toEqual(
      serie1Reso1.posted.documentoCommerciale,
    );
    expect(mockGetDocument).toHaveBeenCalledWith("247989425");
  });

  it("nasce PENDING collegata alla vendita, con impronta della richiesta", async () => {
    await run();

    expect(mockInsertValues.mock.calls[0]![0]).toMatchObject({
      businessId: "biz-1",
      kind: "RETURN",
      returnedDocumentId: "sale-1",
      status: "PENDING",
      idempotencyKey: INPUT.idempotencyKey,
      apiKeyId: null,
      requestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("scrive importo atteso, istante e righe del reso PRIMA della POST", async () => {
    // Le `set` scritte fino all'istante della POST. L'asserzione sta fuori
    // dal mock: un `expect` che fallisse qui dentro diventerebbe un errore
    // della POST, inghiottito dal service.
    let setsAtSubmit: Record<string, unknown>[] = [];
    mockSubmitReturn.mockImplementation(async () => {
      setsAtSubmit = updateSets();
      return ADE_OK;
    });

    await run();

    // Importo e istante sono la chiave e la finestra della riconciliazione
    // se la risposta si perde.
    expect(setsAtSubmit).toContainEqual({
      publicRequest: {
        documentId: "sale-1",
        quantities: [1, 1],
        adeAmount: "0.04500000",
        submittedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
    });

    const lines = mockInsertValues.mock.calls[1]![0];
    expect(lines).toEqual([
      expect.objectContaining({
        documentId: "return-new",
        lineIndex: 0,
        quantity: "1",
        lineDiscount: "0.01",
      }),
      expect.objectContaining({
        documentId: "return-new",
        lineIndex: 1,
        quantity: "1",
        lineDiscount: "0.00",
      }),
    ]);
    expect(mockDelete).toHaveBeenCalledTimes(1); // righe di un tentativo precedente
  });

  it("finalizza con l'istante autorevole dell'AdE", async () => {
    await run();

    expect(updateSets()).toContainEqual(
      expect.objectContaining({
        status: "ACCEPTED",
        adeTransactionId: "247990317",
        adeProgressive: "DCW2026/4801-8782",
        adeRegisteredAt: new Date("2026-10-02T14:15:16.000Z"),
      }),
    );
  });

  it("porta l'apiKeyId sulla riga quando arriva dalla Developer API", async () => {
    await run(INPUT, "api-key-1");
    expect(mockInsertValues.mock.calls[0]![0]).toMatchObject({
      apiKeyId: "api-key-1",
    });
  });
});

describe("returnReceiptForBusiness — rifiuti prima dell'AdE", () => {
  it("vendita inesistente → NOT_FOUND, warn anti-enumerazione solo via API", async () => {
    mockLimitResults = [[]];
    const { logger } = await import("@/lib/logger");

    expect((await run(INPUT, "api-key-1")).code).toBe("NOT_FOUND");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "v1_document_not_found" }),
      expect.any(String),
    );

    vi.mocked(logger.warn).mockClear();
    mockLimitResults = [[]];
    expect((await run()).code).toBe("NOT_FOUND");
    expect(logger.warn).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it.each([
    ["un annullo", { kind: "VOID" }],
    ["un reso", { kind: "RETURN" }],
    ["una vendita annullata", { status: "VOID_ACCEPTED" }],
    ["una vendita in sospeso", { status: "PENDING" }],
  ])("non rende %s", async (_label, over) => {
    mockLimitResults = [[{ ...SALE_DOC, ...over }]];
    const result = await run();
    expect(result.code).toBe("RETURN_NOT_ALLOWED");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("vendita senza identificativi AdE → errore, niente riga", async () => {
    mockLimitResults = [[{ ...SALE_DOC, adeTransactionId: null }]];
    expect((await run()).error).toMatch(/Dati AdE mancanti/);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("righe in numero diverso dalla vendita → RETURN_INVALID_QUANTITIES", async () => {
    const result = await run({ ...INPUT, quantities: [1] });
    expect(result.code).toBe("RETURN_INVALID_QUANTITIES");
    expect(mockFetchAdePrerequisites).not.toHaveBeenCalled();
  });

  it("credenziali AdE mancanti → l'errore dei prerequisiti", async () => {
    mockFetchAdePrerequisites.mockResolvedValue({
      error: "Credenziali AdE non trovate.",
    });
    expect((await run()).error).toBe("Credenziali AdE non trovate.");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("CIE senza sessione → reauthRequired prima della riga PENDING", async () => {
    mockFetchAdePrerequisites.mockResolvedValue({
      method: "cie",
      cedentePrestatore: CEDENTE,
    });
    mockIsInteractiveSessionMissing.mockReturnValue(true);

    expect(await run()).toEqual({ reauthRequired: "cie" });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("timeout DB sulla lettura della vendita → DB_TIMEOUT", async () => {
    mockLimit.mockRejectedValueOnce(
      Object.assign(new Error("canceling statement due to statement timeout"), {
        code: "57014",
      }),
    );
    expect((await run()).code).toBe("DB_TIMEOUT");
  });

  it("timeout DB sull'INSERT → DB_TIMEOUT", async () => {
    mockInsertReturning.mockRejectedValueOnce(
      Object.assign(new Error("statement timeout"), { code: "57014" }),
    );
    expect((await run()).code).toBe("DB_TIMEOUT");
  });

  it("un errore DB qualunque sulla lettura non viene inghiottito", async () => {
    mockLimit.mockRejectedValueOnce(new Error("boom"));
    await expect(run()).rejects.toThrow("boom");
  });
});

describe("returnReceiptForBusiness — guardie lette dall'AdE", () => {
  it("vendita annullata dal portale (flag `annulli`) → rifiuto e riga ritirata", async () => {
    mockSearchDocuments.mockResolvedValue({
      totalCount: 1,
      elencoRisultati: [{ ...SALE_ROW_ON_ADE, annulli: "A" }],
    });

    const result = await run();

    expect(result.code).toBe("RETURN_NOT_ALLOWED");
    expect(result.error).toMatch(/annullato sul portale/);
    expect(mockSubmitReturn).not.toHaveBeenCalled();
    // La riga è nata in questa richiesta e non ha toccato l'AdE: si cancella.
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("quantità oltre il residuo letto adesso → RETURN_INVALID_QUANTITIES", async () => {
    mockGetDocument.mockResolvedValue(detail(serie1Reso2.before));

    const result = await run({ ...INPUT, quantities: [1, 1] });

    expect(result.code).toBe("RETURN_INVALID_QUANTITIES");
    expect(mockSubmitReturn).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("righe AdE diverse da quelle salvate → rifiuto, niente POST", async () => {
    const doc = detail(serie1Reso1.before);
    doc.documentoCommerciale.elementiContabili.pop();
    mockGetDocument.mockResolvedValue(doc);

    const result = await run();

    expect(result.code).toBe("RETURN_NOT_ALLOWED");
    expect(mockSubmitReturn).not.toHaveBeenCalled();
  });

  it("righe AdE in un altro ordine → rifiuto: il reso andrebbe sul prodotto sbagliato", async () => {
    // Le quantità arrivano allineate alle righe del DB; il mapper le applica
    // per indice alle righe dell'AdE.
    const doc = detail(serie1Reso1.before);
    doc.documentoCommerciale.elementiContabili.reverse();
    mockGetDocument.mockResolvedValue(doc);

    const result = await run({ ...INPUT, quantities: [1, 0] });

    expect(result.code).toBe("RETURN_NOT_ALLOWED");
    expect(result.error).toMatch(/non corrisponde/);
    expect(mockSubmitReturn).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("stessa quantità ma aliquota diversa → rifiuto", async () => {
    const doc = detail(serie1Reso1.before);
    doc.documentoCommerciale.elementiContabili[1]!.aliquotaIVA = "22";
    mockGetDocument.mockResolvedValue(doc);

    expect((await run()).code).toBe("RETURN_NOT_ALLOWED");
    expect(mockSubmitReturn).not.toHaveBeenCalled();
  });

  it("stessa aliquota scritta diversa ('22.00' contro '22') non è una divergenza", async () => {
    const doc = detail(serie1Reso1.before);
    doc.documentoCommerciale.elementiContabili[0]!.aliquotaIVA = "22.00";
    mockGetDocument.mockResolvedValue(doc);

    expect((await run({ ...INPUT, quantities: [0, 1] })).returnDocumentId).toBe(
      "return-new",
    );
  });

  it("vendita emessa con il mapper ≤ v1.7.0 (prezzoUnitario di riga) → rifiuto, niente POST", async () => {
    const doc = detail(serie1Reso1.before);
    // 2 pezzi: prezzoUnitario trasmesso come imponibile della riga intera.
    doc.documentoCommerciale.elementiContabili[0]!.prezzoUnitario =
      "0.04918033";
    mockGetDocument.mockResolvedValue(doc);
    const { logger } = await import("@/lib/logger");

    const result = await run({ ...INPUT, quantities: [1, 0] });

    expect(result.code).toBe("RETURN_NOT_ALLOWED");
    expect(result.error).toMatch(/importo sbagliato/);
    expect(mockSubmitReturn).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ saleDocumentId: "sale-1" }),
      "Return: sale lines not computable with the portal formulas",
    );
  });

  it("la riga legacy non resa adesso non blocca il reso delle altre", async () => {
    const doc = detail(serie1Reso1.before);
    doc.documentoCommerciale.elementiContabili[0]!.prezzoUnitario =
      "0.04918033";
    mockGetDocument.mockResolvedValue(doc);

    const result = await run({ ...INPUT, quantities: [0, 1] });

    expect(result.returnDocumentId).toBe("return-new");
    expect(mockSubmitReturn).toHaveBeenCalledTimes(1);
  });
});

describe("returnReceiptForBusiness — esiti della POST", () => {
  it("esito false → REJECTED e messaggio che non incolpa l'utente", async () => {
    mockSubmitReturn.mockResolvedValue({
      esito: false,
      idtrx: null,
      progressivo: null,
      errori: [{ codice: "X1", descrizione: "rifiutato" }],
    });

    const result = await run();

    expect(result.error).toMatch(/ha rifiutato il reso/);
    expect(updateSets()).toContainEqual(
      expect.objectContaining({ status: "REJECTED" }),
    );
  });

  it("transitorio dopo la POST → resta PENDING (esito ignoto), ADE_UNAVAILABLE", async () => {
    mockSubmitReturn.mockRejectedValue(new AdeNetworkError(new Error("reset")));

    const result = await run();

    expect(result).toMatchObject({
      code: "ADE_UNAVAILABLE",
      returnDocumentId: "return-new",
    });
    expect(updateSets()).not.toContainEqual({ status: "ERROR" });
    expect(mockDelete).toHaveBeenCalledTimes(1); // solo le righe pre-POST
  });

  it("errore non transitorio dopo la POST → ERROR", async () => {
    mockSubmitReturn.mockRejectedValue(new AdePortalError(400, "bad request"));

    const result = await run();

    expect(result.code).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(updateSets()).toContainEqual({ status: "ERROR" });
  });

  it("401 CIE sulla POST → ERROR e reauthRequired", async () => {
    mockSubmitReturn.mockRejectedValue(new AdeReauthRequiredError("cie"));

    expect(await run()).toEqual({ reauthRequired: "cie" });
    expect(updateSets()).toContainEqual({ status: "ERROR" });
  });

  it("SPID senza sessione → reauthRequired col metodo spid", async () => {
    mockFetchAdePrerequisites.mockResolvedValue({
      method: "spid",
      cedentePrestatore: CEDENTE,
    });
    mockIsInteractiveSessionMissing.mockReturnValue(true);

    expect(await run()).toEqual({ reauthRequired: "spid" });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("401 SPID sulla POST → il metodo viene dall'errore", async () => {
    mockSubmitReturn.mockRejectedValue(new AdeReauthRequiredError("spid"));

    expect(await run()).toEqual({ reauthRequired: "spid" });
  });

  it("sessione scaduta prima della POST → riga ritirata e reauthRequired", async () => {
    mockSearchDocuments.mockRejectedValue(new AdeReauthRequiredError("cie"));

    expect(await run()).toEqual({ reauthRequired: "cie" });
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockSubmitReturn).not.toHaveBeenCalled();
  });

  it("transitorio prima della POST → riga ritirata, la stessa key riparte pulita", async () => {
    mockGetDocument.mockRejectedValue(new AdeNetworkError(new Error("reset")));

    const result = await run();

    expect(result.code).toBe("ADE_UNAVAILABLE");
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("ritiro della riga fallito → resta PENDING, l'esito arriva lo stesso", async () => {
    mockGetDocument.mockResolvedValue(detail(serie1Reso2.before));
    mockDeleteWhere.mockRejectedValueOnce(new Error("connection lost"));
    const { logger } = await import("@/lib/logger");

    const result = await run({ ...INPUT, quantities: [1, 1] });

    expect(result.code).toBe("RETURN_INVALID_QUANTITIES");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ returnDocumentId: "return-new" }),
      "Failed to release RETURN row before submit",
    );
  });

  it("sulla riga di un tentativo precedente, il rifiuto pre-POST la chiude ERROR", async () => {
    mockInsertReturning.mockResolvedValue([]);
    mockLimitResults = [[SALE_DOC], [existingReturn()]];
    mockGetDocument.mockResolvedValue(detail(serie1Reso2.before));

    const result = await run({ ...INPUT, quantities: [1, 1] });

    expect(result.code).toBe("RETURN_INVALID_QUANTITIES");
    expect(updateSets()).toContainEqual({ status: "ERROR" });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("un errore DB qualunque sull'INSERT non viene inghiottito", async () => {
    mockInsertReturning.mockRejectedValueOnce(new Error("boom"));
    await expect(run()).rejects.toThrow("boom");
  });

  it("finalizzazione fallita dopo una POST riuscita → RETURN_SYNC_FAILED, mai ERROR", async () => {
    mockTransaction
      .mockImplementationOnce(runInTx) // righe pre-POST
      .mockRejectedValue(new Error("connection lost"));

    const result = await run();

    expect(result).toMatchObject({
      code: "RETURN_SYNC_FAILED",
      returnDocumentId: "return-new",
    });
    expect(updateSets()).not.toContainEqual({ status: "ERROR" });
  });

  it("password scaduta → ADE_PASSWORD_EXPIRED", async () => {
    const { AdePasswordExpiredError } = await import("@/lib/ade/errors");
    mockSubmitReturn.mockRejectedValue(new AdePasswordExpiredError());

    expect((await run()).code).toBe("ADE_PASSWORD_EXPIRED");
  });

  it("timeout DB dopo la POST → resta PENDING, DB_TIMEOUT", async () => {
    mockSubmitReturn.mockRejectedValue(
      Object.assign(new Error("statement timeout"), { code: "57014" }),
    );

    expect((await run()).code).toBe("DB_TIMEOUT");
    expect(updateSets()).not.toContainEqual({ status: "ERROR" });
  });
});

describe("returnReceiptForBusiness — idempotenza sulla stessa key", () => {
  beforeEach(() => {
    mockInsertReturning.mockResolvedValue([]); // INSERT saltato
  });

  it("già ACCEPTED → stesso esito, nessuna chiamata AdE", async () => {
    mockLimitResults = [
      [SALE_DOC],
      [
        existingReturn({
          status: "ACCEPTED",
          adeTransactionId: "t",
          adeProgressive: "p",
        }),
      ],
    ];

    expect(await run()).toEqual({
      returnDocumentId: "return-old",
      adeTransactionId: "t",
      adeProgressive: "p",
    });
    expect(mockSearchDocuments).not.toHaveBeenCalled();
  });

  it.each([
    ["un documento di un altro tipo", { kind: "SALE" }],
    ["un'altra vendita", { returnedDocumentId: "sale-2" }],
    ["quantità diverse", { requestHash: "f".repeat(64) }],
  ])("key riusata per %s → IDEMPOTENCY_PAYLOAD_MISMATCH", async (_l, over) => {
    mockLimitResults = [[SALE_DOC], [existingReturn(over)]];
    expect((await run()).code).toBe("IDEMPOTENCY_PAYLOAD_MISMATCH");
  });

  it("già REJECTED → serve una key nuova", async () => {
    mockLimitResults = [[SALE_DOC], [existingReturn({ status: "REJECTED" })]];
    expect((await run()).error).toMatch(/nuova chiave/);
  });

  it("PENDING recente → in corso, niente AdE", async () => {
    const recent = new Date();
    mockLimitResults = [
      [SALE_DOC],
      [existingReturn({ createdAt: recent, updatedAt: recent })],
    ];

    expect((await run()).code).toBe("RETURN_PENDING_IN_PROGRESS");
    expect(mockSearchDocuments).not.toHaveBeenCalled();
  });

  it("PENDING stale ma claim perso → in corso, niente AdE", async () => {
    mockLimitResults = [[SALE_DOC], [existingReturn()]];
    mockClaimReturning.mockResolvedValue([]);

    expect((await run()).code).toBe("RETURN_PENDING_IN_PROGRESS");
    expect(mockSearchDocuments).not.toHaveBeenCalled();
  });

  it("PENDING stale già registrato sull'AdE → finalize-only, nessuna seconda POST", async () => {
    mockLimitResults = [
      [SALE_DOC],
      [
        existingReturn({
          publicRequest: {
            documentId: "sale-1",
            quantities: [1, 1],
            adeAmount: "0.04500000",
          },
        }),
      ],
    ];
    mockSearchDocuments.mockResolvedValueOnce({
      totalCount: 1,
      elencoRisultati: [
        {
          idtrx: "247990317",
          numeroProgressivo: "DCW2026/4801-8782",
          cfCliente: "",
          data: "02/10/2026 16:15:16",
          tipoOperazione: "R",
          resi: SALE_PROGRESSIVE,
          ammontareComplessivo: 0.045,
        },
      ],
    });

    expect(await run()).toEqual({
      returnDocumentId: "return-old",
      adeTransactionId: "247990317",
      adeProgressive: "DCW2026/4801-8782",
    });
    expect(mockSubmitReturn).not.toHaveBeenCalled();
  });

  it("PENDING stale assente sull'AdE → ritrasmette sulla stessa riga", async () => {
    mockLimitResults = [
      [SALE_DOC],
      [
        existingReturn({
          publicRequest: {
            documentId: "sale-1",
            quantities: [1, 1],
            adeAmount: "0.04500000",
          },
        }),
      ],
    ];
    mockSearchDocuments
      .mockResolvedValueOnce({ totalCount: 0, elencoRisultati: [] })
      .mockResolvedValue({ totalCount: 1, elencoRisultati: [SALE_ROW_ON_ADE] });

    const result = await run();

    expect(result.returnDocumentId).toBe("return-old");
    expect(mockSubmitReturn).toHaveBeenCalledTimes(1);
  });

  it("PENDING stale senza importo atteso: la POST non è mai partita, niente ricerca R", async () => {
    mockLimitResults = [[SALE_DOC], [existingReturn()]];

    await run();

    expect(mockSearchDocuments).toHaveBeenCalledTimes(1);
    expect(mockSearchDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ tipoOperazione: "V" }),
    );
    expect(mockSubmitReturn).toHaveBeenCalledTimes(1);
  });

  it("riga ERROR stale: il claim la riapre PENDING, così rientra nell'indice di correzione", async () => {
    // Ritrasmettere da una riga ERROR la lascerebbe fuori dall'indice "una
    // correzione in volo per vendita": un annullo o un altro reso
    // concorrente potrebbero partire insieme a questa POST.
    mockLimitResults = [[SALE_DOC], [existingReturn({ status: "ERROR" })]];

    await run();

    expect(updateSets()[0]).toEqual({
      updatedAt: expect.any(Date),
      status: "PENDING",
    });
    expect(mockSubmitReturn).toHaveBeenCalledTimes(1);
  });

  it("riapertura bloccata da un'altra correzione in volo → in corso, niente AdE", async () => {
    mockLimitResults = [[SALE_DOC], [existingReturn({ status: "ERROR" })]];
    mockClaimReturning.mockRejectedValue(
      Object.assign(new Error("duplicate key"), { code: "23505" }),
    );

    const result = await run();

    expect(result.code).toBe("RETURN_PENDING_IN_PROGRESS");
    expect(mockSearchDocuments).not.toHaveBeenCalled();
    expect(mockSubmitReturn).not.toHaveBeenCalled();
  });

  it("un errore DB qualunque sul claim non viene inghiottito", async () => {
    mockLimitResults = [[SALE_DOC], [existingReturn()]];
    mockClaimReturning.mockRejectedValue(new Error("boom"));

    await expect(run()).rejects.toThrow("boom");
  });

  it("la riconciliazione cerca intorno all'ultima POST, non alla nascita della riga", async () => {
    // Una riga può ritrasmettere giorni dopo la creazione: cercare intorno a
    // `createdAt` perderebbe proprio la POST da riconciliare.
    const createdAt = new Date("2026-09-01T08:00:00Z");
    const submittedAt = "2026-09-20T15:30:00.000Z";
    mockLimitResults = [
      [SALE_DOC],
      [
        existingReturn({
          createdAt,
          publicRequest: { adeAmount: "0.04500000", submittedAt },
        }),
      ],
    ];
    mockSearchDocuments.mockResolvedValueOnce({
      totalCount: 0,
      elencoRisultati: [],
    });

    await run();

    expect(mockSearchDocuments.mock.calls[0]![0]).toEqual({
      dataDal: "09/19/2026",
      dataInvioAl: "09/21/2026",
      tipoOperazione: "R",
    });
  });

  it("senza istante della POST cerca intorno alla nascita della riga, mai alla cieca", async () => {
    const createdAt = new Date("2026-09-01T08:00:00Z");
    mockLimitResults = [
      [SALE_DOC],
      [existingReturn({ createdAt, publicRequest: { adeAmount: "0.045" } })],
    ];
    mockSearchDocuments.mockResolvedValueOnce({
      totalCount: 0,
      elencoRisultati: [],
    });

    await run();

    expect(mockSearchDocuments.mock.calls[0]![0]).toMatchObject({
      dataDal: "08/31/2026",
      dataInvioAl: "09/02/2026",
    });
  });

  it("ricerca di riconciliazione fallita → in corso, niente POST (fail-safe)", async () => {
    mockLimitResults = [
      [SALE_DOC],
      [existingReturn({ publicRequest: { adeAmount: "0.04500000" } })],
    ];
    mockSearchDocuments.mockRejectedValue(new AdeNetworkError(new Error("x")));

    expect((await run()).code).toBe("RETURN_PENDING_IN_PROGRESS");
    expect(mockSubmitReturn).not.toHaveBeenCalled();
  });

  it("riconciliazione ambigua → in corso, niente POST", async () => {
    mockLimitResults = [
      [SALE_DOC],
      [existingReturn({ publicRequest: { adeAmount: "0.02500000" } })],
    ];
    const twin = {
      cfCliente: "",
      data: "02/10/2026 16:15:16",
      tipoOperazione: "R" as const,
      resi: SALE_PROGRESSIVE,
      ammontareComplessivo: 0.025,
    };
    mockSearchDocuments.mockResolvedValue({
      totalCount: 2,
      elencoRisultati: [
        { ...twin, idtrx: "a", numeroProgressivo: "p-a" },
        { ...twin, idtrx: "b", numeroProgressivo: "p-b" },
      ],
    });

    expect((await run()).code).toBe("RETURN_PENDING_IN_PROGRESS");
    expect(mockSubmitReturn).not.toHaveBeenCalled();
  });

  it("finalize-only fallito → RETURN_SYNC_FAILED", async () => {
    mockLimitResults = [
      [SALE_DOC],
      [existingReturn({ publicRequest: { adeAmount: "0.04500000" } })],
    ];
    mockSearchDocuments.mockResolvedValue({
      totalCount: 1,
      elencoRisultati: [
        {
          idtrx: "247990317",
          numeroProgressivo: "DCW2026/4801-8782",
          cfCliente: "",
          data: "02/10/2026 16:15:16",
          tipoOperazione: "R",
          resi: SALE_PROGRESSIVE,
          ammontareComplessivo: 0.045,
        },
      ],
    });
    mockTransaction.mockRejectedValue(new Error("connection lost"));

    expect((await run()).code).toBe("RETURN_SYNC_FAILED");
  });
});

describe("returnReceiptForBusiness — correzione già in volo con un'altra key", () => {
  beforeEach(() => {
    mockInsertReturning.mockResolvedValueOnce([]); // primo INSERT saltato
  });

  it("reso recente di un'altra richiesta → in corso", async () => {
    const recent = new Date();
    mockLimitResults = [
      [SALE_DOC],
      [], // nessuna riga con questa key
      [existingReturn({ createdAt: recent, updatedAt: recent })],
    ];

    const result = await run();
    expect(result).toMatchObject({
      code: "RETURN_PENDING_IN_PROGRESS",
      returnDocumentId: "return-old",
    });
  });

  it("annullo in volo sulla stessa vendita → RETURN_NOT_ALLOWED", async () => {
    mockLimitResults = [[SALE_DOC], [], [], [{ id: "void-pending" }]];

    const result = await run();
    expect(result.code).toBe("RETURN_NOT_ALLOWED");
    expect(result.error).toMatch(/annullo in corso/);
  });

  it("conflitto sparito nel frattempo → in corso, il client ritenta", async () => {
    mockLimitResults = [[SALE_DOC], [], [], []];
    expect((await run()).code).toBe("RETURN_PENDING_IN_PROGRESS");
  });

  it("reso stale di un'altra richiesta, registrato sull'AdE → RETURN_STATE_CHANGED", async () => {
    mockLimitResults = [
      [SALE_DOC],
      [],
      [existingReturn({ publicRequest: { adeAmount: "0.02500000" } })],
    ];
    mockSearchDocuments.mockResolvedValue({
      totalCount: 1,
      elencoRisultati: [
        {
          idtrx: "r-old",
          numeroProgressivo: "p-old",
          cfCliente: "",
          data: "02/10/2026 16:15:16",
          tipoOperazione: "R",
          resi: SALE_PROGRESSIVE,
          ammontareComplessivo: 0.025,
        },
      ],
    });

    const result = await run();

    expect(result.code).toBe("RETURN_STATE_CHANGED");
    expect(mockSubmitReturn).not.toHaveBeenCalled();
    expect(updateSets()).toContainEqual(
      expect.objectContaining({
        status: "ACCEPTED",
        adeTransactionId: "r-old",
      }),
    );
  });

  it("reso stale di un'altra richiesta, assente sull'AdE → chiuso ERROR e questa procede", async () => {
    mockLimitResults = [[SALE_DOC], [], [existingReturn()]];

    const result = await run();

    expect(updateSets()).toContainEqual({ status: "ERROR" });
    expect(mockInsertValues).toHaveBeenCalledTimes(3); // 2 INSERT riga + righe reso
    expect(result.returnDocumentId).toBe("return-new");
    expect(mockSubmitReturn).toHaveBeenCalledTimes(1);
  });

  it("dopo il subentro l'INSERT trova ancora un conflitto → in corso", async () => {
    mockInsertReturning.mockReset();
    mockInsertReturning.mockResolvedValue([]);
    mockLimitResults = [
      [SALE_DOC],
      [],
      [existingReturn()],
      [], // secondo giro: nessuna riga con questa key
      [
        existingReturn({
          id: "return-other",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ],
    ];

    const result = await run();

    expect(result.code).toBe("RETURN_PENDING_IN_PROGRESS");
    expect(mockSubmitReturn).not.toHaveBeenCalled();
  });
});
