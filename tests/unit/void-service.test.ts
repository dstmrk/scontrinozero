// @vitest-environment node
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
  mockAdeLogout: vi.fn(),
  mockMapVoidToAdePayload: vi.fn(),
}));

vi.mock("@/db", () => ({ getDb: mockGetDb }));
vi.mock("@/db/schema", () => ({
  commercialDocuments: "commercial_documents",
}));
vi.mock("@/lib/server-auth", () => ({
  fetchAdePrerequisites: mockFetchAdePrerequisites,
}));
vi.mock("@/lib/ade", () => ({
  createAdeClient: mockCreateAdeClient,
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
  mockUpdateWhere.mockResolvedValue(undefined);

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
    logout: mockAdeLogout,
  });
  mockAdeLogin.mockResolvedValue(undefined);
  mockAdeGetDocument.mockResolvedValue({ idElementoContabile: "elem-1" });
  mockAdeSubmitVoid.mockResolvedValue({
    esito: true,
    idtrx: "void-tx-1",
    progressivo: "2",
  });
  mockAdeLogout.mockResolvedValue(undefined);
  mockMapVoidToAdePayload.mockReturnValue({ payload: "void-payload" });
}

// --- Tests ---

describe("voidReceiptForBusiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADE_MODE = "mock";
    mockFetchAdePrerequisites.mockResolvedValue(FAKE_PREREQUISITES);
  });

  describe("input validation (SALE document checks)", () => {
    it("returns error when SALE document is not found", async () => {
      setupHappyPathDb();
      mockLimit.mockResolvedValue([]); // no SALE found

      const { voidReceiptForBusiness } =
        await import("@/lib/services/void-service");
      const result = await voidReceiptForBusiness(makeInput());
      expect(result).toEqual({ error: "Scontrino non trovato." });
    });

    it("returns error when document kind is not SALE", async () => {
      setupHappyPathDb();
      mockLimit.mockResolvedValue([{ ...FAKE_SALE, kind: "VOID" }]);

      const { voidReceiptForBusiness } =
        await import("@/lib/services/void-service");
      const result = await voidReceiptForBusiness(makeInput());
      expect(result).toEqual({
        error: "Solo i documenti di vendita possono essere annullati.",
      });
    });

    it("returns error when SALE status is not ACCEPTED", async () => {
      setupHappyPathDb();
      mockLimit.mockResolvedValue([{ ...FAKE_SALE, status: "VOID_ACCEPTED" }]);

      const { voidReceiptForBusiness } =
        await import("@/lib/services/void-service");
      const result = await voidReceiptForBusiness(makeInput());
      expect((result as { error: string }).error).toMatch(/annullabile/i);
    });

    it("returns error when AdE transaction data is missing", async () => {
      setupHappyPathDb();
      mockLimit.mockResolvedValue([
        { ...FAKE_SALE, adeTransactionId: null, adeProgressive: null },
      ]);

      const { voidReceiptForBusiness } =
        await import("@/lib/services/void-service");
      const result = await voidReceiptForBusiness(makeInput());
      expect(result).toEqual({ error: "Dati AdE mancanti per l'annullo." });
    });
  });

  describe("idempotency (Case A) — same idempotencyKey conflict", () => {
    it("returns existing VOID_ACCEPTED data when same key is retried", async () => {
      setupHappyPathDb();
      mockReturning.mockResolvedValue([]); // INSERT conflict → no voidDoc

      // idempotencyKey lookup finds VOID_ACCEPTED
      const existingVoid = {
        id: VOID_ID,
        status: "VOID_ACCEPTED",
        adeTransactionId: "void-tx-1",
        adeProgressive: "2",
      };
      mockLimit
        .mockResolvedValueOnce([FAKE_SALE]) // first SELECT (fetch SALE)
        .mockResolvedValueOnce([existingVoid]); // second SELECT (idempotency lookup)

      const { voidReceiptForBusiness } =
        await import("@/lib/services/void-service");
      const result = await voidReceiptForBusiness(makeInput());
      expect(result).toEqual({
        voidDocumentId: VOID_ID,
        adeTransactionId: "void-tx-1",
        adeProgressive: "2",
      });
    });

    it("returns inconsistent-state error when existing VOID is PENDING", async () => {
      setupHappyPathDb();
      mockReturning.mockResolvedValue([]); // INSERT conflict

      mockLimit.mockResolvedValueOnce([FAKE_SALE]).mockResolvedValueOnce([
        {
          id: VOID_ID,
          status: "PENDING",
          adeTransactionId: null,
          adeProgressive: null,
        },
      ]);

      const { voidReceiptForBusiness } =
        await import("@/lib/services/void-service");
      const result = await voidReceiptForBusiness(makeInput());
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toMatch(/inconsistente/i);
    });
  });

  describe("race condition guard (Case B) — different key, same SALE", () => {
    it("returns error when another VOID already exists for the same SALE (voidedDocumentId conflict)", async () => {
      setupHappyPathDb();
      // INSERT skipped (conflict on voidedDocumentId with a different idempotencyKey)
      mockReturning.mockResolvedValue([]);

      // idempotencyKey lookup returns nothing (different key was used by first request)
      mockLimit
        .mockResolvedValueOnce([FAKE_SALE]) // first SELECT (fetch SALE)
        .mockResolvedValueOnce([]); // second SELECT (idempotency lookup — no match)

      const { voidReceiptForBusiness } =
        await import("@/lib/services/void-service");
      const result = await voidReceiptForBusiness(makeInput());
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toMatch(/annullato|annullo/i);
    });
  });

  describe("happy path", () => {
    it("returns voidDocumentId and AdE data on success", async () => {
      setupHappyPathDb();
      setupAdeClient();

      const { voidReceiptForBusiness } =
        await import("@/lib/services/void-service");
      const result = await voidReceiptForBusiness(makeInput());
      expect(result).toEqual({
        voidDocumentId: VOID_ID,
        adeTransactionId: "void-tx-1",
        adeProgressive: "2",
      });
    });
  });

  describe("retry after failed void attempt (new idempotencyKey)", () => {
    // These tests document the behaviour enabled by the partial unique index fix
    // (migration 0012): REJECTED/ERROR voids no longer block a retry with a NEW key.
    // At DB level the new index predicate is: WHERE voided_document_id IS NOT NULL
    // AND status IN ('PENDING', 'VOID_ACCEPTED').

    it("allows a new void attempt after the previous VOID was REJECTED", async () => {
      setupHappyPathDb();
      setupAdeClient();
      // INSERT succeeds: the REJECTED row is not covered by the updated index
      mockReturning.mockResolvedValue([{ id: VOID_ID }]);

      const NEW_KEY = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
      const { voidReceiptForBusiness } =
        await import("@/lib/services/void-service");
      const result = await voidReceiptForBusiness(
        makeInput({ idempotencyKey: NEW_KEY }),
      );
      expect(result).toEqual({
        voidDocumentId: VOID_ID,
        adeTransactionId: "void-tx-1",
        adeProgressive: "2",
      });
    });

    it("allows a new void attempt after the previous VOID ended in ERROR", async () => {
      setupHappyPathDb();
      setupAdeClient();
      // INSERT succeeds: the ERROR row is not covered by the updated index
      mockReturning.mockResolvedValue([{ id: VOID_ID }]);

      const NEW_KEY = "ffffffff-ffff-ffff-ffff-ffffffffffff";
      const { voidReceiptForBusiness } =
        await import("@/lib/services/void-service");
      const result = await voidReceiptForBusiness(
        makeInput({ idempotencyKey: NEW_KEY }),
      );
      expect(result).toEqual({
        voidDocumentId: VOID_ID,
        adeTransactionId: "void-tx-1",
        adeProgressive: "2",
      });
    });

    it("still blocks concurrent void when an active PENDING VOID exists (different key)", async () => {
      setupHappyPathDb();
      // INSERT skipped: PENDING is still covered by the updated index
      mockReturning.mockResolvedValue([]);
      // idempotencyKey lookup returns nothing (different key used by concurrent request)
      mockLimit.mockResolvedValueOnce([FAKE_SALE]).mockResolvedValueOnce([]);

      const { voidReceiptForBusiness } =
        await import("@/lib/services/void-service");
      const result = await voidReceiptForBusiness(makeInput());
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toMatch(/annullato|annullo/i);
    });

    it("still blocks re-void when VOID_ACCEPTED already exists (different key)", async () => {
      setupHappyPathDb();
      // INSERT skipped: VOID_ACCEPTED is still covered by the updated index
      mockReturning.mockResolvedValue([]);
      // idempotencyKey lookup returns nothing (different key was used)
      mockLimit.mockResolvedValueOnce([FAKE_SALE]).mockResolvedValueOnce([]);

      const { voidReceiptForBusiness } =
        await import("@/lib/services/void-service");
      const result = await voidReceiptForBusiness(makeInput());
      expect(result).toHaveProperty("error");
    });
  });
});
