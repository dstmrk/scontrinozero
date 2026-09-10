// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSelectLimit,
  mockSelectRows,
  mockUpdateWhere,
  mockClaimStaleDocument,
  mockFindClaimedTransactionIds,
  mockFetchLinesByDocIds,
  mockFinalizeSaleOnly,
  mockFetchAdePrerequisites,
  mockIsCieSessionMissing,
  mockWithAdeSession,
  mockSearchDocuments,
  mockLoggerWarn,
  mockLogAdeFailure,
} = vi.hoisted(() => ({
  mockSelectLimit: vi.fn(),
  mockSelectRows: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockClaimStaleDocument: vi.fn(),
  mockFindClaimedTransactionIds: vi.fn(),
  mockFetchLinesByDocIds: vi.fn(),
  mockFinalizeSaleOnly: vi.fn(),
  mockFetchAdePrerequisites: vi.fn(),
  mockIsCieSessionMissing: vi.fn(),
  mockWithAdeSession: vi.fn(),
  mockSearchDocuments: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLogAdeFailure: vi.fn(),
}));

// Drizzle: `.where()` è già awaitable e `.limit()` la restringe. Il builder
// finto espone entrambe le uscite — `mockSelectRows` per l'elenco,
// `mockSelectLimit` per la lettura della singola riga — così i due percorsi
// non si contendono lo stesso mock.
vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => ({
          limit: mockSelectLimit,
          then: (resolve: (rows: unknown) => unknown) =>
            Promise.resolve(mockSelectRows()).then(resolve),
        })),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: mockUpdateWhere }),
    }),
  }),
}));

vi.mock("@/db/schema", () => ({
  commercialDocuments: {
    id: "id",
    businessId: "business_id",
    kind: "kind",
    status: "status",
    adeTransactionId: "ade_transaction_id",
    adeProgressive: "ade_progressive",
    lotteryCode: "lottery_code",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
}));

vi.mock("./ade-recovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ade-recovery")>();
  return {
    ...actual,
    claimStaleDocument: mockClaimStaleDocument,
    findClaimedTransactionIds: mockFindClaimedTransactionIds,
  };
});

vi.mock("./receipt-service", () => ({
  finalizeSaleOnly: mockFinalizeSaleOnly,
}));

vi.mock("@/lib/receipts/document-lines", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/receipts/document-lines")>();
  return { ...actual, fetchLinesByDocIds: mockFetchLinesByDocIds };
});

vi.mock("@/lib/server-auth", () => ({
  fetchAdePrerequisites: mockFetchAdePrerequisites,
  toAdeSessionParams: vi.fn().mockReturnValue({ businessId: "biz" }),
}));

vi.mock("@/lib/ade", () => ({
  withAdeSession: mockWithAdeSession,
  isCieSessionMissing: mockIsCieSessionMissing,
}));

vi.mock("@/lib/ade/log-failure", () => ({ logAdeFailure: mockLogAdeFailure }));

vi.mock("@/lib/logger", () => ({
  logger: { warn: mockLoggerWarn, info: vi.fn(), error: vi.fn() },
}));

import {
  confirmPendingSaleCandidate,
  listStalePendingSales,
  verifyPendingSale,
} from "./pending-verification";
import type { AdeDocumentSummary } from "@/lib/ade/types";

const BIZ = "biz-uuid";
const DOC = "doc-uuid";

/** Riga stale: `updated_at` più vecchia della soglia di 30 minuti. */
function pendingRow(over: Record<string, unknown> = {}) {
  return {
    id: DOC,
    status: "PENDING",
    adeTransactionId: null,
    adeProgressive: null,
    lotteryCode: null,
    createdAt: new Date("2026-09-10T09:00:00.000Z"),
    updatedAt: new Date("2026-09-10T09:00:00.000Z"),
    ...over,
  };
}

function adeDoc(over: Partial<AdeDocumentSummary> = {}): AdeDocumentSummary {
  return {
    idtrx: "IDTRX-1",
    numeroProgressivo: "DCW2026/1-1",
    cfCliente: "",
    // Wall-clock italiano: 09:01 UTC = 11:01 a settembre (CEST).
    data: "10/09/2026 11:01:00",
    tipoOperazione: "V",
    ammontareComplessivo: 12.5,
    ...over,
  };
}

/** Il documento è stale rispetto a questo "adesso". */
const NOW = new Date("2026-09-10T12:00:00.000Z");

function givenSearchReturns(documents: AdeDocumentSummary[]): void {
  mockSearchDocuments.mockResolvedValue({ elencoRisultati: documents });
  mockWithAdeSession.mockImplementation(
    async (_params: unknown, fn: (client: unknown) => Promise<unknown>) =>
      fn({ searchDocuments: mockSearchDocuments }),
  );
}

describe("verifyPendingSale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockSelectLimit.mockResolvedValue([pendingRow()]);
    mockFetchLinesByDocIds.mockResolvedValue([
      {
        documentId: DOC,
        grossUnitPrice: "12.50",
        quantity: "1",
        lineDiscount: "0",
      },
    ]);
    mockClaimStaleDocument.mockResolvedValue(true);
    mockFindClaimedTransactionIds.mockResolvedValue(new Set());
    mockFetchAdePrerequisites.mockResolvedValue({ method: "fisconline" });
    mockIsCieSessionMissing.mockReturnValue(false);
    mockUpdateWhere.mockResolvedValue(undefined);
    mockFinalizeSaleOnly.mockResolvedValue({
      documentId: DOC,
      adeTransactionId: "IDTRX-1",
      adeProgressive: "DCW2026/1-1",
      adeRegisteredAt: "2026-09-10T09:01:00.000Z",
    });
  });

  afterEach(() => vi.useRealTimers());

  it("finalizza ad ACCEPTED quando AdE ha un solo documento compatibile", async () => {
    givenSearchReturns([adeDoc()]);

    const result = await verifyPendingSale({
      businessId: BIZ,
      documentId: DOC,
    });

    expect(result).toEqual({
      outcome: "accepted",
      documentId: DOC,
      adeProgressive: "DCW2026/1-1",
      adeRegisteredAt: "2026-09-10T09:01:00.000Z",
    });
  });

  it("scrive l'istante autorevole di AdE, non il default dell'INSERT", async () => {
    givenSearchReturns([adeDoc()]);

    await verifyPendingSale({ businessId: BIZ, documentId: DOC });

    // REVIEW.md #91: sulla riga stale il `DEFAULT now()` può precedere di
    // minuti l'istante in cui AdE ha registrato, e quella data finisce su PDF,
    // storico ed export.
    const [, , , registeredAt] = mockFinalizeSaleOnly.mock.calls[0];
    expect(registeredAt).toEqual(new Date("2026-09-10T09:01:00.000Z"));
  });

  it("porta la riga a ERROR quando AdE non ha nulla di compatibile", async () => {
    givenSearchReturns([]);

    const result = await verifyPendingSale({
      businessId: BIZ,
      documentId: DOC,
    });

    expect(result).toEqual({ outcome: "not-registered", documentId: DOC });
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
    expect(mockFinalizeSaleOnly).not.toHaveBeenCalled();
  });

  it("non ri-sottomette mai: la riemissione la decide l'esercente", async () => {
    givenSearchReturns([]);

    await verifyPendingSale({ businessId: BIZ, documentId: DOC });

    // A differenza del recovery dell'emit, qui "nessun match" NON porta a un
    // nuovo submitSale: sarebbe irreversibile e non è una decisione nostra.
    expect(mockSearchDocuments).toHaveBeenCalledTimes(1);
  });

  it("ritorna i candidati senza toccare niente quando il match è ambiguo", async () => {
    givenSearchReturns([
      adeDoc(),
      adeDoc({ idtrx: "IDTRX-2", numeroProgressivo: "DCW2026/1-2" }),
    ]);

    const result = await verifyPendingSale({
      businessId: BIZ,
      documentId: DOC,
    });

    expect(result).toEqual({
      outcome: "ambiguous",
      documentId: DOC,
      candidates: [
        {
          idtrx: "IDTRX-1",
          numeroProgressivo: "DCW2026/1-1",
          data: "10/09/2026 11:01:00",
          totalCents: 1250,
        },
        {
          idtrx: "IDTRX-2",
          numeroProgressivo: "DCW2026/1-2",
          data: "10/09/2026 11:01:00",
          totalCents: 1250,
        },
      ],
    });
    expect(mockFinalizeSaleOnly).not.toHaveBeenCalled();
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });

  it("risponde in-progress quando perde il claim contro un'altra sessione", async () => {
    mockClaimStaleDocument.mockResolvedValue(false);

    const result = await verifyPendingSale({
      businessId: BIZ,
      documentId: DOC,
    });

    expect(result).toEqual({ outcome: "in-progress" });
    expect(mockWithAdeSession).not.toHaveBeenCalled();
  });

  it("risponde in-progress su una riga ancora fresca", async () => {
    mockSelectLimit.mockResolvedValue([
      pendingRow({ updatedAt: new Date(NOW.getTime() - 60 * 1000) }),
    ]);

    const result = await verifyPendingSale({
      businessId: BIZ,
      documentId: DOC,
    });

    expect(result).toEqual({ outcome: "in-progress" });
    expect(mockClaimStaleDocument).not.toHaveBeenCalled();
  });

  it("dice settled quando un'altra sessione l'ha già finalizzata", async () => {
    mockSelectLimit.mockResolvedValue([pendingRow({ status: "ACCEPTED" })]);

    const result = await verifyPendingSale({
      businessId: BIZ,
      documentId: DOC,
    });

    expect(result).toEqual({ outcome: "settled" });
    expect(mockClaimStaleDocument).not.toHaveBeenCalled();
  });

  it("non tocca un documento di un altro business", async () => {
    mockSelectLimit.mockResolvedValue([]);

    const result = await verifyPendingSale({
      businessId: BIZ,
      documentId: DOC,
    });

    expect(result).toEqual({
      error: "Scontrino non trovato. Ricarica la pagina e riprova.",
    });
  });

  it("finalizza senza interrogare AdE se la transazione è già persistita", async () => {
    mockSelectLimit.mockResolvedValue([
      pendingRow({
        adeTransactionId: "IDTRX-9",
        adeProgressive: "DCW2026/9-9",
      }),
    ]);

    const result = await verifyPendingSale({
      businessId: BIZ,
      documentId: DOC,
    });

    expect(mockWithAdeSession).not.toHaveBeenCalled();
    expect(mockFinalizeSaleOnly).toHaveBeenCalledWith(
      DOC,
      "IDTRX-9",
      "DCW2026/9-9",
    );
    expect(result).toMatchObject({ outcome: "accepted" });
  });

  it("non dichiara 'non registrato' se AdE non risponde", async () => {
    mockSearchDocuments.mockRejectedValue(new Error("ECONNRESET"));
    mockWithAdeSession.mockImplementation(
      async (_p: unknown, fn: (c: unknown) => Promise<unknown>) =>
        fn({ searchDocuments: mockSearchDocuments }),
    );

    const result = await verifyPendingSale({
      businessId: BIZ,
      documentId: DOC,
    });

    // Fail-safe: l'esito resta ignoto, quindi la riga resta PENDING.
    expect(result).toEqual({
      error:
        "Agenzia delle Entrate non raggiungibile: non è stato possibile verificare. Riprova tra qualche minuto.",
    });
    expect(mockUpdateWhere).not.toHaveBeenCalled();
    expect(mockFinalizeSaleOnly).not.toHaveBeenCalled();
  });

  it("chiede il rinnovo CIE invece di fallire in modo opaco", async () => {
    mockFetchAdePrerequisites.mockResolvedValue({ method: "cie" });
    mockIsCieSessionMissing.mockReturnValue(true);

    const result = await verifyPendingSale({
      businessId: BIZ,
      documentId: DOC,
    });

    expect(result).toMatchObject({ reauthRequired: true });
    expect(mockWithAdeSession).not.toHaveBeenCalled();
  });

  it("propaga l'errore delle credenziali AdE mancanti", async () => {
    mockFetchAdePrerequisites.mockResolvedValue({
      error: "Credenziali assenti",
    });

    const result = await verifyPendingSale({
      businessId: BIZ,
      documentId: DOC,
    });

    expect(result).toEqual({ error: "Credenziali assenti" });
  });

  it("esclude i documenti AdE già collegati ad altre righe", async () => {
    mockFindClaimedTransactionIds.mockResolvedValue(new Set(["IDTRX-1"]));
    givenSearchReturns([adeDoc()]);

    const result = await verifyPendingSale({
      businessId: BIZ,
      documentId: DOC,
    });

    // L'unico candidato appartiene a una vendita diversa già contabilizzata:
    // trattarlo come match collegherebbe la nostra riga al documento sbagliato.
    expect(result).toEqual({ outcome: "not-registered", documentId: DOC });
  });

  it("riconcilia sul totale canonico per riga, sconti compresi", async () => {
    mockFetchLinesByDocIds.mockResolvedValue([
      {
        documentId: DOC,
        grossUnitPrice: "10.00",
        quantity: "1",
        lineDiscount: "0",
      },
      {
        documentId: DOC,
        grossUnitPrice: "3.00",
        quantity: "1",
        lineDiscount: "0.50",
      },
    ]);
    givenSearchReturns([adeDoc({ ammontareComplessivo: 12.5 })]);

    const result = await verifyPendingSale({
      businessId: BIZ,
      documentId: DOC,
    });

    expect(result).toMatchObject({ outcome: "accepted" });
  });

  it("propaga l'errore di una finalizzazione fallita invece di dire accepted", async () => {
    givenSearchReturns([adeDoc()]);
    mockFinalizeSaleOnly.mockResolvedValue({
      error: "Stato non coerente.",
      code: "IDEMPOTENCY_PAYLOAD_MISMATCH",
    });

    const result = await verifyPendingSale({
      businessId: BIZ,
      documentId: DOC,
    });

    expect(result).toEqual({ error: "Stato non coerente." });
  });
});

describe("confirmPendingSaleCandidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockSelectLimit.mockResolvedValue([pendingRow()]);
    mockFetchLinesByDocIds.mockResolvedValue([
      {
        documentId: DOC,
        grossUnitPrice: "12.50",
        quantity: "1",
        lineDiscount: "0",
      },
    ]);
    mockClaimStaleDocument.mockResolvedValue(true);
    mockFindClaimedTransactionIds.mockResolvedValue(new Set());
    mockFetchAdePrerequisites.mockResolvedValue({ method: "fisconline" });
    mockIsCieSessionMissing.mockReturnValue(false);
    mockFinalizeSaleOnly.mockResolvedValue({
      documentId: DOC,
      adeTransactionId: "IDTRX-2",
      adeProgressive: "DCW2026/1-2",
      adeRegisteredAt: "2026-09-10T09:01:00.000Z",
    });
  });

  afterEach(() => vi.useRealTimers());

  it("finalizza il documento che l'esercente ha riconosciuto", async () => {
    givenSearchReturns([
      adeDoc(),
      adeDoc({ idtrx: "IDTRX-2", numeroProgressivo: "DCW2026/1-2" }),
    ]);

    const result = await confirmPendingSaleCandidate({
      businessId: BIZ,
      documentId: DOC,
      idtrx: "IDTRX-2",
    });

    expect(mockFinalizeSaleOnly).toHaveBeenCalledWith(
      DOC,
      "IDTRX-2",
      "DCW2026/1-2",
      new Date("2026-09-10T09:01:00.000Z"),
    );
    expect(result).toMatchObject({ outcome: "accepted" });
  });

  it("rifiuta un idtrx che non è fra i candidati", async () => {
    givenSearchReturns([
      adeDoc(),
      adeDoc({ idtrx: "IDTRX-2", numeroProgressivo: "DCW2026/1-2" }),
    ]);

    const result = await confirmPendingSaleCandidate({
      businessId: BIZ,
      documentId: DOC,
      idtrx: "IDTRX-DI-QUALCUN-ALTRO",
    });

    // Un client manomesso non deve poter collegare la nostra riga a un
    // documento fiscale arbitrario: la scelta restringe fra i candidati, non
    // li sostituisce.
    expect(result).toMatchObject({ error: expect.any(String) });
    expect(mockFinalizeSaleOnly).not.toHaveBeenCalled();
  });

  it("accetta il candidato rimasto se l'ambiguità si è risolta da sé", async () => {
    givenSearchReturns([
      adeDoc({ idtrx: "IDTRX-2", numeroProgressivo: "DCW2026/1-2" }),
    ]);

    const result = await confirmPendingSaleCandidate({
      businessId: BIZ,
      documentId: DOC,
      idtrx: "IDTRX-2",
    });

    expect(result).toMatchObject({ outcome: "accepted" });
  });

  it("rifiuta quando fra la verifica e la conferma AdE non ha più nulla", async () => {
    givenSearchReturns([]);

    const result = await confirmPendingSaleCandidate({
      businessId: BIZ,
      documentId: DOC,
      idtrx: "IDTRX-2",
    });

    expect(result).toMatchObject({ error: expect.any(String) });
    expect(mockFinalizeSaleOnly).not.toHaveBeenCalled();
  });

  it("risponde in-progress se un'altra sessione ha il claim", async () => {
    mockClaimStaleDocument.mockResolvedValue(false);

    const result = await confirmPendingSaleCandidate({
      businessId: BIZ,
      documentId: DOC,
      idtrx: "IDTRX-2",
    });

    expect(result).toEqual({ outcome: "in-progress" });
  });
});

describe("listStalePendingSales", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  it("ritorna le vendite in sospeso col loro totale", async () => {
    mockSelectRows.mockReturnValue([
      { id: DOC, createdAt: new Date("2026-09-10T09:00:00.000Z") },
    ]);
    mockFetchLinesByDocIds.mockResolvedValue([
      {
        documentId: DOC,
        grossUnitPrice: "10.00",
        quantity: "2",
        lineDiscount: "1.50",
      },
    ]);

    const result = await listStalePendingSales(BIZ);

    // round(10.00 * 2 * 100) − round(1.50 * 100) = 1850 (regola 17).
    expect(result).toEqual([
      { id: DOC, createdAt: "2026-09-10T09:00:00.000Z", totalCents: 1850 },
    ]);
  });

  it("non interroga le righe quando non c'è niente in sospeso", async () => {
    mockSelectRows.mockReturnValue([]);

    const result = await listStalePendingSales(BIZ);

    expect(result).toEqual([]);
    expect(mockFetchLinesByDocIds).not.toHaveBeenCalled();
  });

  it("degrada a lista vuota su errore DB, senza propagare (regola 19)", async () => {
    mockSelectRows.mockImplementation(() => {
      throw new Error("DB giù");
    });

    // È montata nel layout del dashboard: un throw sostituirebbe l'intera app
    // con l'error boundary di Next per un avviso accessorio.
    await expect(listStalePendingSales(BIZ)).resolves.toEqual([]);
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it("porta a zero un documento senza righe invece di ometterlo", async () => {
    mockSelectRows.mockReturnValue([
      { id: DOC, createdAt: new Date("2026-09-10T09:00:00.000Z") },
    ]);
    mockFetchLinesByDocIds.mockResolvedValue([]);

    const result = await listStalePendingSales(BIZ);

    expect(result).toEqual([
      { id: DOC, createdAt: "2026-09-10T09:00:00.000Z", totalCents: 0 },
    ]);
  });
});
