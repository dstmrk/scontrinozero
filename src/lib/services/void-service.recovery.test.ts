// @vitest-environment node
// voidReceiptForBusiness: dati AdE mancanti, annullo precedente rifiutato con
// la stessa chiave, recovery di un PENDING stale che ha già la transazione AdE.
// Il resto di void-service, con i mock di void-service.test.ts, sta lì.
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks ---

const {
  mockGetDb,
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
  mockInsert,
  mockInsertValues,
  mockOnConflictDoNothing,
  mockReturning,
  mockUpdate,
  mockSet,
  mockUpdateWhere,
  mockTransaction,
  mockFetchAdePrerequisites,
  mockCreateAdeClient,
  mockAdeLogin,
  mockAdeGetDocument,
  mockAdeSubmitVoid,
  mockAdeSearchDocuments,
  mockAdeLogout,
  mockMapVoidToAdePayload,
} = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockInsert: vi.fn(),
  mockInsertValues: vi.fn(),
  mockOnConflictDoNothing: vi.fn(),
  mockReturning: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockTransaction: vi.fn(),
  mockFetchAdePrerequisites: vi.fn(),
  mockCreateAdeClient: vi.fn(),
  mockAdeLogin: vi.fn(),
  mockAdeGetDocument: vi.fn(),
  mockAdeSubmitVoid: vi.fn(),
  mockAdeSearchDocuments: vi.fn(),
  mockAdeLogout: vi.fn(),
  mockMapVoidToAdePayload: vi.fn(),
}));

vi.mock("@/db", () => ({ getDb: mockGetDb }));
vi.mock("@/db/schema", () => ({
  commercialDocuments: "commercial_documents",
}));
vi.mock("@/lib/server-auth", () => ({
  fetchAdePrerequisites: mockFetchAdePrerequisites,
  // PR #752: mappa AdePrerequisites → WithAdeSessionParams (helper puro).
  toAdeSessionParams: (
    businessId: string,
    prerequisites: { method: string; [k: string]: unknown },
  ) =>
    prerequisites.method === "cie"
      ? { businessId, method: "cie" }
      : {
          businessId,
          method: "fisconline",
          credentials: {
            codiceFiscale: prerequisites.codiceFiscale,
            password: prerequisites.password,
            pin: prerequisites.pin,
          },
        },
}));
vi.mock("@/lib/ade", () => ({
  getAdeMode: () => "mock",
  createAdeClient: mockCreateAdeClient,
  // withAdeSession (PR #624): replica il ciclo mock-mode usando il client
  // costruito da mockCreateAdeClient → login/fn/logout, così le asserzioni
  // esistenti su mockAdeLogin/mockAdeSubmitVoid/mockAdeLogout restano valide.
  withAdeSession: async (
    params: { credentials: unknown },
    fn: (client: ReturnType<typeof mockCreateAdeClient>) => unknown,
  ) => {
    const client = mockCreateAdeClient();
    await client.login(params.credentials);
    try {
      return await fn(client);
    } finally {
      await client.logout();
    }
  },
}));
vi.mock("@/lib/ade/mapper", () => ({
  mapVoidToAdePayload: mockMapVoidToAdePayload,
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// --- Helpers ---

const SALE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BUSINESS_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const IDEM_KEY = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const VOID_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

const FAKE_SALE = {
  id: SALE_ID,
  businessId: BUSINESS_ID,
  kind: "SALE",
  status: "ACCEPTED",
  adeTransactionId: "tx-001",
  adeProgressive: "1",
  createdAt: new Date("2026-01-15"),
};

const FAKE_PREREQUISITES = {
  codiceFiscale: "TSTFSC00A01H501A",
  password: "pwd",
  pin: "1234",
  cedentePrestatore: {},
};

function makeInput(overrides = {}) {
  return {
    documentId: SALE_ID,
    businessId: BUSINESS_ID,
    idempotencyKey: IDEM_KEY,
    ...overrides,
  };
}

/** Set up a happy-path DB mock: select returns FAKE_SALE, insert returns voidDoc */
function setupHappyPathDb() {
  mockGetDb.mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
  });
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockLimit.mockResolvedValue([FAKE_SALE]);

  mockInsert.mockReturnValue({ values: mockInsertValues });
  mockInsertValues.mockReturnValue({
    onConflictDoNothing: mockOnConflictDoNothing,
  });
  mockOnConflictDoNothing.mockReturnValue({ returning: mockReturning });
  mockReturning.mockResolvedValue([{ id: VOID_ID }]);

  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: mockUpdateWhere });
  // `.where()` è terminale per gli UPDATE post-AdE (awaited → undefined) ma il
  // claim CAS (P1.3) vi concatena `.returning()`. Il thenable soddisfa entrambi.
  // Default: claim vinto (1 riga).
  mockUpdateWhere.mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: VOID_ID }]),
    then: (onFulfilled: (value: undefined) => unknown) =>
      onFulfilled(undefined),
  });

  mockTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: () => ({
          set: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
        }),
        execute: vi.fn().mockResolvedValue(undefined),
      };
      return fn(tx);
    },
  );
}

function setupAdeClient() {
  mockCreateAdeClient.mockReturnValue({
    login: mockAdeLogin,
    getDocument: mockAdeGetDocument,
    submitVoid: mockAdeSubmitVoid,
    searchDocuments: mockAdeSearchDocuments,
    logout: mockAdeLogout,
  });
  mockAdeLogin.mockResolvedValue(undefined);
  // Forma minima del dettaglio GET: la guardia sui resi (HAR.md #19f) legge
  // il cumulativo `reso` di riga prima di trasmettere l'annullo.
  mockAdeGetDocument.mockResolvedValue({
    idtrx: "sale-tx",
    documentoCommerciale: {
      elementiContabili: [{ idElementoContabile: "elem-1", reso: "0" }],
    },
  });
  mockAdeSubmitVoid.mockResolvedValue({
    esito: true,
    idtrx: "void-tx-1",
    progressivo: "2",
  });
  // Default: nessun documento trovato su AdE → il recovery procede al re-submit.
  // I test che vogliono il ramo "match" (finalize-only) sovrascrivono questo mock.
  mockAdeSearchDocuments.mockResolvedValue({
    totalCount: 0,
    elencoRisultati: [],
  });
  mockAdeLogout.mockResolvedValue(undefined);
  mockMapVoidToAdePayload.mockReturnValue({ payload: "void-payload" });
}

// --- Tests ---

/** Origine dalla web app: il titolare, oggi l'unico membro (issue #1099). */
const UI_ORIGIN = { memberId: "member-owner" };

describe("voidReceiptForBusiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADE_MODE = "mock";
    mockFetchAdePrerequisites.mockResolvedValue(FAKE_PREREQUISITES);
  });

  describe("input validation (SALE document checks)", () => {
    // Senza transazione E progressivo AdE l'annullo non si può inviare:
    // basta che manchi uno dei due.
    it.each([
      ["entrambi", { adeTransactionId: null, adeProgressive: null }],
      ["solo il progressivo", { adeProgressive: null }],
      ["solo la transazione", { adeTransactionId: null }],
    ])(
      "rifiuta se mancano i dati AdE della vendita (%s)",
      async (_label, missing) => {
        setupHappyPathDb();
        mockLimit.mockResolvedValue([{ ...FAKE_SALE, ...missing }]);

        const { voidReceiptForBusiness } =
          await import("@/lib/services/void-service");
        const result = await voidReceiptForBusiness(makeInput(), UI_ORIGIN);
        expect(result).toEqual({ error: "Dati AdE mancanti per l'annullo." });
      },
    );
  });

  describe("idempotency (Case A) — same idempotencyKey conflict", () => {
    it("returns rejection error when existing VOID is REJECTED (same key)", async () => {
      setupHappyPathDb();
      mockReturning.mockResolvedValue([]); // INSERT conflict

      mockLimit.mockResolvedValueOnce([FAKE_SALE]).mockResolvedValueOnce([
        {
          id: VOID_ID,
          status: "REJECTED",
          adeTransactionId: null,
          adeProgressive: null,
          createdAt: new Date(),
        },
      ]);

      const { voidReceiptForBusiness } =
        await import("@/lib/services/void-service");
      const result = await voidReceiptForBusiness(makeInput(), UI_ORIGIN);
      expect(result.error).toMatch(/rifiutato/i);
      // Non viene chiamato AdE
      expect(mockAdeSubmitVoid).not.toHaveBeenCalled();
    });
  });

  describe("stale PENDING recovery", () => {
    it("stale PENDING WITH AdE transaction → finalizes only, skips submitVoid", async () => {
      setupHappyPathDb();
      setupAdeClient();
      // INSERT conflict: existing PENDING with submitVoid già successo
      mockReturning.mockResolvedValue([]);
      mockLimit.mockResolvedValueOnce([FAKE_SALE]).mockResolvedValueOnce([
        {
          id: VOID_ID,
          status: "PENDING",
          adeTransactionId: "previously-submitted-tx",
          adeProgressive: "5",
          createdAt: new Date(Date.now() - 35 * 60 * 1000),
          updatedAt: new Date(Date.now() - 35 * 60 * 1000),
        },
      ]);

      const { voidReceiptForBusiness } =
        await import("@/lib/services/void-service");
      const result = await voidReceiptForBusiness(makeInput(), UI_ORIGIN);

      // NESSUNA chiamata a submitVoid (sarebbe doppione su AdE)
      expect(mockAdeSubmitVoid).not.toHaveBeenCalled();
      expect(result).toEqual({
        voidDocumentId: VOID_ID,
        adeTransactionId: "previously-submitted-tx",
        adeProgressive: "5",
      });
    });

    it("returns VOID_SYNC_FAILED when finalize-only transaction fails", async () => {
      setupHappyPathDb();
      mockReturning.mockResolvedValue([]);
      mockLimit.mockResolvedValueOnce([FAKE_SALE]).mockResolvedValueOnce([
        {
          id: VOID_ID,
          status: "PENDING",
          adeTransactionId: "tx-prev",
          adeProgressive: "9",
          createdAt: new Date(Date.now() - 35 * 60 * 1000),
          updatedAt: new Date(Date.now() - 35 * 60 * 1000),
        },
      ]);
      // Tx finalizzazione fallisce
      mockTransaction.mockImplementationOnce(async () => {
        throw new Error("connection lost");
      });

      const { voidReceiptForBusiness } =
        await import("@/lib/services/void-service");
      const result = await voidReceiptForBusiness(makeInput(), UI_ORIGIN);

      expect((result as { code?: string }).code).toBe("VOID_SYNC_FAILED");
      // Critical: non marca ERROR (eviterebbe il blocco da partial unique index)
    });
  });
});
