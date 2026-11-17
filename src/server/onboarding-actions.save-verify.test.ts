// @vitest-environment node
// saveBusiness: nomi del profilo non riscritti dopo l'onboarding e aliquota
// IVA salvata alla creazione. Il resto di onboarding-actions, con i mock di
// onboarding-actions.test.ts, sta lì.
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const {
  mockGetAuthenticatedUser,
  mockCheckBusinessMembership,
  mockGetDb,
  mockGetEncryptionKey,
  mockGetEncryptionKeys,
  mockGetKeyVersion,
  mockEncrypt,
  mockDecrypt,
  mockCreateAdeClient,
  mockSendEmail,
  mockRevalidatePath,
  mockSelectFrom,
  mockSelectWhere,
  mockSelectLimit,
  mockSelect,
  mockUpdateSet,
  mockUpdateWhere,
  mockUpdate,
  mockTransaction,
  mockLogger,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockCheckBusinessMembership: vi
    .fn()
    .mockResolvedValue({ memberId: "member-owner", role: "owner" }),
  mockGetDb: vi.fn(),
  mockGetEncryptionKey: vi.fn(),
  mockGetEncryptionKeys: vi.fn(),
  mockGetKeyVersion: vi.fn(),
  mockEncrypt: vi.fn(),
  mockDecrypt: vi.fn(),
  mockCreateAdeClient: vi.fn(),
  mockSendEmail: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockSelectFrom: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockUpdate: vi.fn(),
  mockTransaction: vi.fn(),
  mockLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
  checkBusinessMembership: mockCheckBusinessMembership,
}));

vi.mock("@/db", () => ({
  getDb: mockGetDb,
}));

vi.mock("@/db/schema", () => ({
  adeCredentials: "ade-credentials-table",
  businesses: "businesses-table",
  businessMembers: "business-members-table",
  profiles: "profiles-table",
  trialVatLedger: "trial-vat-ledger-table",
}));

vi.mock("@/lib/crypto", () => ({
  getEncryptionKey: mockGetEncryptionKey,
  getEncryptionKeys: mockGetEncryptionKeys,
  getKeyVersion: mockGetKeyVersion,
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
}));

vi.mock("@/lib/ade", () => ({
  getAdeMode: () => "mock",
  createAdeClient: mockCreateAdeClient,
}));

// Il rate limiter di verifyAdeCredentials (verify-ade:${user.id}, 5/15 min) è
// reale di default: senza questo mock il 6° invio con lo stesso USER_ID nei
// test verifyAdeCredentials scatterebbe il limite, facendo ritornare l'action
// PRIMA della SELECT credenziali e lasciando un mockResolvedValueOnce non
// consumato nella coda condivisa di mockSelectLimit (vi.clearAllMocks NON
// resetta le implementazioni in coda), che inquinerebbe i test saveBusiness
// successivi. check() ritorna sempre success: i superamenti del limite sono
// coperti in src/server/onboarding-actions.test.ts.
vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: () => ({ success: true, remaining: 4 }) };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
}));

// Use the real error classes so that `instanceof` checks inside
// `getUserFacingAdeErrorMessage` work as expected.
vi.mock(import("@/lib/ade/errors"), async (importOriginal) => {
  const actual = await importOriginal();
  return actual;
});

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
  isValidItalianZipCode: vi.fn().mockReturnValue(true),
  ITALIAN_ZIP_MESSAGE: "CAP non valido (5 cifre numeriche).",
  BUSINESS_PROFILE_LIMITS: {
    firstName: 80,
    lastName: 80,
    businessName: 120,
    address: 150,
    streetNumber: 20,
    city: 80,
  },
  // Riproduce il contratto reale (trim + maiuscolo, null se vuota): la
  // provincia finisce nel payload di INSERT/UPDATE asserito da questi test.
  normalizeProvince: vi.fn((raw: string | null) => {
    const normalized = raw?.trim().toUpperCase() ?? "";
    return normalized === "" ? null : normalized;
  }),
  validateBusinessOptionalFields: vi.fn().mockReturnValue(null),
}));

vi.mock("@/types/cassa", () => {
  const codes = new Set([
    "4",
    "5",
    "10",
    "22",
    "N1",
    "N2",
    "N3",
    "N4",
    "N5",
    "N6",
  ]);
  return {
    VAT_CODES: ["4", "5", "10", "22", "N1", "N2", "N3", "N4", "N5", "N6"],
    isInvalidPreferredVatCode: (code: string | null) =>
      code !== null && !codes.has(code),
  };
});

// --- Helpers ---

const BIZ_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user-abc";

// --- Tests ---

describe("saveBusiness re-entry on already-onboarded profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetAuthenticatedUser.mockResolvedValue({
      id: USER_ID,
      email: "user@example.com",
    });

    mockGetDb.mockReturnValue({
      select: mockSelect,
      transaction: mockTransaction,
    });

    // `.for("update")` è il lock select P1.2 sul profilo (terminale, awaited e
    // ignorato); `.limit()` resta per le SELECT dati.
    mockSelectWhere.mockReturnValue({
      limit: mockSelectLimit,
      for: vi.fn().mockResolvedValue([]),
    });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    mockUpdateWhere.mockResolvedValue(undefined);
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
  });

  function makeValidFd(): FormData {
    const fd = new FormData();
    fd.append("firstName", "Mario");
    fd.append("lastName", "Rossi");
    fd.append("address", "Via Roma");
    fd.append("zipCode", "00100");
    return fd;
  }

  it("does NOT update profile firstName/lastName when business already has fiscalCode", async () => {
    // First SELECT: profile found. Second SELECT (inside tx): business with fiscalCode set.
    mockSelectLimit
      .mockResolvedValueOnce([{ id: "profile-1" }])
      .mockResolvedValueOnce([{ id: BIZ_ID, fiscalCode: "ABCDEF12G34H567I" }]);

    mockTransaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update: mockUpdate, select: mockSelect, insert: vi.fn() }),
    );

    const { saveBusiness } = await import("@/server/onboarding-actions");
    const result = await saveBusiness(makeValidFd());

    expect(result.businessId).toBe(BIZ_ID);

    // The UPDATE on profiles (firstName/lastName) must NOT be issued.
    const setCalls = mockUpdateSet.mock.calls.map((c) => c[0]);
    const profileNameUpdate = setCalls.find(
      (payload: Record<string, unknown>) =>
        "firstName" in payload || "lastName" in payload,
    );
    expect(profileNameUpdate).toBeUndefined();
  });

  it("updates profile firstName/lastName when business is not yet verified (no fiscalCode)", async () => {
    mockSelectLimit
      .mockResolvedValueOnce([{ id: "profile-1" }])
      .mockResolvedValueOnce([{ id: BIZ_ID, fiscalCode: null }]);

    mockTransaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update: mockUpdate, select: mockSelect, insert: vi.fn() }),
    );

    const { saveBusiness } = await import("@/server/onboarding-actions");
    await saveBusiness(makeValidFd());

    const setCalls = mockUpdateSet.mock.calls.map((c) => c[0]);
    const profileNameUpdate = setCalls.find(
      (payload: Record<string, unknown>) =>
        "firstName" in payload && "lastName" in payload,
    );
    expect(profileNameUpdate).toEqual({
      firstName: "Mario",
      lastName: "Rossi",
    });
  });
});

describe("saveBusiness preferredVatCode persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetAuthenticatedUser.mockResolvedValue({
      id: USER_ID,
      email: "user@example.com",
    });

    mockGetDb.mockReturnValue({
      select: mockSelect,
      transaction: mockTransaction,
    });

    // `.for("update")` è il lock select P1.2 sul profilo; `.limit()` per le SELECT dati.
    mockSelectWhere.mockReturnValue({
      limit: mockSelectLimit,
      for: vi.fn().mockResolvedValue([]),
    });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    mockUpdateWhere.mockResolvedValue(undefined);
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
  });

  function makeFd(preferredVatCode?: string): FormData {
    const fd = new FormData();
    fd.append("firstName", "Mario");
    fd.append("lastName", "Rossi");
    fd.append("address", "Via Roma");
    fd.append("zipCode", "00100");
    if (preferredVatCode !== undefined) {
      fd.append("preferredVatCode", preferredVatCode);
    }
    return fd;
  }

  it("persiste un preferredVatCode valido nell'INSERT di un nuovo business", async () => {
    const mockInsertValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: BIZ_ID }]),
    });
    const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

    // Profilo trovato, nessun business esistente → ramo INSERT.
    mockSelectLimit
      .mockResolvedValueOnce([{ id: "profile-1" }])
      .mockResolvedValueOnce([]);

    mockTransaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update: mockUpdate, select: mockSelect, insert: mockInsert }),
    );

    const { saveBusiness } = await import("@/server/onboarding-actions");
    const result = await saveBusiness(makeFd("10"));

    expect(result.businessId).toBe(BIZ_ID);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ preferredVatCode: "10" }),
    );
  });
});
