// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_BUSINESS_ID } from "../_helpers/fixtures";

// --- Hoisted mocks ---

const {
  mockGetDb,
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
  mockInsert,
  mockInsertValues,
  mockInsertReturning,
  mockUpdate,
  mockSet,
  mockUpdateWhere,
  mockTransaction,
  mockFetchAdePrerequisites,
  mockCreateAdeClient,
  mockAdeLogin,
  mockAdeSubmitSale,
  mockAdeLogout,
  mockMapSaleToAdePayload,
} = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockInsert: vi.fn(),
  mockInsertValues: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockTransaction: vi.fn(),
  mockFetchAdePrerequisites: vi.fn(),
  mockCreateAdeClient: vi.fn(),
  mockAdeLogin: vi.fn(),
  mockAdeSubmitSale: vi.fn(),
  mockAdeLogout: vi.fn(),
  mockMapSaleToAdePayload: vi.fn(),
}));

vi.mock("@/db", () => ({ getDb: mockGetDb }));
vi.mock("@/db/schema", () => ({
  commercialDocuments: "commercial_documents",
  commercialDocumentLines: "commercial_document_lines",
}));
vi.mock("@/lib/server-auth", () => ({
  fetchAdePrerequisites: mockFetchAdePrerequisites,
}));
vi.mock("@/lib/ade", () => ({
  createAdeClient: mockCreateAdeClient,
}));
vi.mock("@/lib/ade/mapper", () => ({
  mapSaleToAdePayload: mockMapSaleToAdePayload,
}));
vi.mock("@/lib/ade/errors", () => {
  class AdeError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  class AdeAuthError extends AdeError {
    constructor(msg = "Auth failed") {
      super("ADE_AUTH_FAILED", msg);
    }
  }
  class AdePasswordExpiredError extends AdeError {
    constructor() {
      super("ADE_PASSWORD_EXPIRED", "Password scaduta");
    }
  }
  return { AdeError, AdeAuthError, AdePasswordExpiredError };
});
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/date-utils", () => ({
  getFiscalDate: vi.fn().mockReturnValue("2024-01-01"),
}));
vi.mock("@/lib/validation", () => ({
  isValidLotteryCode: vi.fn().mockReturnValue(false),
}));
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, eq: vi.fn((a, b) => ({ eq: { a, b } })) };
});

// --- Helpers ---

const BIZ_ID = "biz-test";
const DOC_ID = "doc-abc-123";

function makeValidInput() {
  return {
    businessId: BIZ_ID,
    lines: [
      {
        id: "l1",
        description: "Test",
        quantity: 1,
        grossUnitPrice: 10.0,
        vatCode: "22" as const,
      },
    ],
    paymentMethod: "PC" as const,
    idempotencyKey: TEST_BUSINESS_ID,
    lotteryCode: null,
  };
}

function setupDb() {
  // outer db (for idempotency re-select and status updates)
  mockUpdateWhere.mockResolvedValue([]);
  mockSet.mockReturnValue({ where: mockUpdateWhere });
  mockUpdate.mockReturnValue({ set: mockSet });

  mockLimit.mockResolvedValue([]);
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });

  // transaction: tx.insert().values().onConflictDoNothing().returning()
  mockInsertReturning.mockResolvedValue([{ id: DOC_ID }]);
  const mockOnConflict = vi.fn().mockReturnValue({
    returning: mockInsertReturning,
  });
  mockInsertValues.mockReturnValue({ onConflictDoNothing: mockOnConflict });
  // second insert (lines) doesn't need returning
  mockInsert.mockReturnValue({ values: mockInsertValues });

  mockTransaction.mockImplementation(
    async (fn: (tx: object) => Promise<unknown>) =>
      fn({
        insert: mockInsert,
        select: mockSelect,
        update: mockUpdate,
        execute: vi.fn().mockResolvedValue(undefined),
      }),
  );

  mockGetDb.mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
  });
}

// --- Tests ---

describe("emitReceiptForBusiness — AdePasswordExpiredError", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupDb();
    mockFetchAdePrerequisites.mockResolvedValue({
      codiceFiscale: "CF123",
      password: "pw",
      pin: "1234567890",
      cedentePrestatore: {},
    });
    mockMapSaleToAdePayload.mockReturnValue({});
    mockAdeLogout.mockResolvedValue(undefined);
    mockCreateAdeClient.mockReturnValue({
      login: mockAdeLogin,
      submitSale: mockAdeSubmitSale,
      logout: mockAdeLogout,
    });
  });

  it("restituisce passwordExpired: true quando il login AdE fallisce con password scaduta", async () => {
    const { AdePasswordExpiredError } = await import("@/lib/ade/errors");
    mockAdeLogin.mockRejectedValue(new AdePasswordExpiredError());

    const { emitReceiptForBusiness } =
      await import("@/lib/services/receipt-service");
    const result = await emitReceiptForBusiness(makeValidInput());

    expect(result.passwordExpired).toBe(true);
    expect(result.error).toMatch(/scaduta/i);
    expect(result.documentId).toBeUndefined();
  });

  it("NON restituisce passwordExpired per un errore generico", async () => {
    mockAdeLogin.mockRejectedValue(new Error("Network failure"));

    const { emitReceiptForBusiness } =
      await import("@/lib/services/receipt-service");
    const result = await emitReceiptForBusiness(makeValidInput());

    expect(result.passwordExpired).toBeUndefined();
    expect(result.error).toMatch(/Riprova più tardi/);
  });
});
