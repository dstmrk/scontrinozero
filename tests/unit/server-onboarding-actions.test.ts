// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const {
  mockGetAuthenticatedUser,
  mockCheckBusinessOwnership,
  mockGetDb,
  mockGetEncryptionKey,
  mockGetKeyVersion,
  mockEncrypt,
  mockDecrypt,
  mockCreateAdeClient,
  mockAdeLogin,
  mockAdeLogout,
  mockSendEmail,
  mockRevalidatePath,
  mockSelectFrom,
  mockSelectWhere,
  mockSelectLimit,
  mockSelect,
  mockUpdateSet,
  mockUpdateWhere,
  mockUpdateReturning,
  mockUpdate,
  mockTransaction,
  mockLogger,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockCheckBusinessOwnership: vi.fn(),
  mockGetDb: vi.fn(),
  mockGetEncryptionKey: vi.fn(),
  mockGetKeyVersion: vi.fn(),
  mockEncrypt: vi.fn(),
  mockDecrypt: vi.fn(),
  mockCreateAdeClient: vi.fn(),
  mockAdeLogin: vi.fn(),
  mockAdeLogout: vi.fn(),
  mockSendEmail: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockSelectFrom: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockUpdateReturning: vi.fn(),
  mockUpdate: vi.fn(),
  mockTransaction: vi.fn(),
  mockLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
  checkBusinessOwnership: mockCheckBusinessOwnership,
}));

vi.mock("@/db", () => ({
  getDb: mockGetDb,
}));

vi.mock("@/db/schema", () => ({
  adeCredentials: "ade-credentials-table",
  businesses: "businesses-table",
  profiles: "profiles-table",
}));

vi.mock("@/lib/crypto", () => ({
  getEncryptionKey: mockGetEncryptionKey,
  getKeyVersion: mockGetKeyVersion,
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
}));

vi.mock("@/lib/ade", () => ({
  createAdeClient: mockCreateAdeClient,
}));

vi.mock("@/lib/ade/errors", () => ({
  AdePasswordExpiredError: class AdePasswordExpiredError extends Error {},
  AdeAuthError: class AdeAuthError extends Error {},
  AdeError: class AdeError extends Error {
    code: string;
    constructor(msg: string, code: string) {
      super(msg);
      this.code = code;
    }
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: mockSendEmail,
}));

vi.mock("@/emails/welcome", () => ({
  WelcomeEmail: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, createElement: vi.fn() };
});

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/logger", () => ({
  logger: mockLogger,
}));

vi.mock("@/lib/validation", () => ({
  adePinSchema: { safeParse: vi.fn().mockReturnValue({ success: true }) },
}));

// --- Helpers ---

const BIZ_ID = "biz-123";
const USER_ID = "user-abc";
const CRED_ID = "cred-uuid";
const CRED_UPDATED_AT = new Date("2026-04-01T10:00:00Z");

function makeCred(overrides = {}) {
  return {
    id: CRED_ID,
    businessId: BIZ_ID,
    encryptedCodiceFiscale: "enc-cf",
    encryptedPassword: "enc-pw",
    encryptedPin: "enc-pin",
    keyVersion: 1,
    verifiedAt: null,
    updatedAt: CRED_UPDATED_AT,
    createdAt: new Date("2026-04-01T09:00:00Z"),
    ...overrides,
  };
}

// --- Tests ---

describe("verifyAdeCredentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetAuthenticatedUser.mockResolvedValue({
      id: USER_ID,
      email: "user@example.com",
    });
    mockCheckBusinessOwnership.mockResolvedValue(null);
    mockGetEncryptionKey.mockReturnValue(Buffer.from("a".repeat(32)));
    mockGetKeyVersion.mockReturnValue(1);
    mockDecrypt.mockReturnValue("decrypted-value");

    mockAdeLogin.mockResolvedValue(undefined);
    mockAdeLogout.mockResolvedValue(undefined);
    mockCreateAdeClient.mockReturnValue({
      login: mockAdeLogin,
      logout: mockAdeLogout,
      getFiscalData: vi.fn().mockResolvedValue({
        identificativiFiscali: {
          partitaIva: "12345678901",
          codiceFiscale: "ABCDEF12G34H567I",
        },
      }),
    });

    // Default DB SELECT chain: returns cred row then no rows (for business/profiles)
    mockSelectLimit.mockResolvedValueOnce([makeCred()]).mockResolvedValue([]);
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    // Default UPDATE chain: 1 row updated (normal case)
    mockUpdateReturning.mockResolvedValue([{ id: CRED_ID }]);
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });

    // Transaction passthrough
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) =>
        fn({ update: mockUpdate, select: mockSelect }),
    );

    mockGetDb.mockReturnValue({
      select: mockSelect,
      update: mockUpdate,
      transaction: mockTransaction,
    });

    mockSendEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns businessId on successful verification", async () => {
    const { verifyAdeCredentials } =
      await import("@/server/onboarding-actions");

    const result = await verifyAdeCredentials(BIZ_ID);

    expect(result.businessId).toBe(BIZ_ID);
    expect(result.error).toBeUndefined();
    expect(mockAdeLogin).toHaveBeenCalled();
  });

  it("returns error when credentials are not found", async () => {
    // Override: SELECT returns no cred row
    mockSelectLimit.mockReset();
    mockSelectLimit.mockResolvedValue([]);
    const { verifyAdeCredentials } =
      await import("@/server/onboarding-actions");

    const result = await verifyAdeCredentials(BIZ_ID);

    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/non trovate/i);
    expect(mockAdeLogin).not.toHaveBeenCalled();
  });

  it("returns error when AdE login fails", async () => {
    mockAdeLogin.mockRejectedValueOnce(new Error("AdE unavailable"));
    const { verifyAdeCredentials } =
      await import("@/server/onboarding-actions");

    const result = await verifyAdeCredentials(BIZ_ID);

    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/verifica fallita/i);
  });

  it("returns passwordExpired flag when AdE reports expired password", async () => {
    const { AdePasswordExpiredError } = await import("@/lib/ade/errors");
    mockAdeLogin.mockRejectedValueOnce(new AdePasswordExpiredError());
    const { verifyAdeCredentials } =
      await import("@/server/onboarding-actions");

    const result = await verifyAdeCredentials(BIZ_ID);

    expect(result.passwordExpired).toBe(true);
    expect(result.error).toBeDefined();
  });

  it("optimistic lock: does not set verifiedAt and returns businessId when credentials were updated during verification", async () => {
    // Simulate race: UPDATE WHERE updatedAt matches returns 0 rows
    mockUpdateReturning.mockReset();
    mockUpdateReturning.mockResolvedValue([]);

    const { verifyAdeCredentials } =
      await import("@/server/onboarding-actions");

    const result = await verifyAdeCredentials(BIZ_ID);

    // Must still return businessId (non-fatal)
    expect(result.businessId).toBe(BIZ_ID);
    expect(result.error).toBeUndefined();
    // Must log a warning about the race
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BIZ_ID }),
      expect.stringContaining("credenziali modificate"),
    );
  });

  it("optimistic lock: UPDATE sets verifiedAt when credentials are unchanged", async () => {
    const { verifyAdeCredentials } =
      await import("@/server/onboarding-actions");

    await verifyAdeCredentials(BIZ_ID);

    // The final UPDATE SET must be called with verifiedAt
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ verifiedAt: expect.any(Date) }),
    );
  });
});
