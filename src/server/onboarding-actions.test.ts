// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

// Drizzle query mock chain
const mockLimit = vi.fn();
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
// leftJoin è chainable (può essere chiamato 2 volte per profile→business→creds);
// ritorna un oggetto che espone leftJoin/innerJoin/where per terminare la chain.
const mockLeftJoin: ReturnType<typeof vi.fn> = vi.fn();
mockLeftJoin.mockReturnValue({
  leftJoin: mockLeftJoin,
  innerJoin: mockInnerJoin,
  where: mockWhere,
});
const mockFrom = vi.fn().mockReturnValue({
  where: mockWhere,
  innerJoin: mockInnerJoin,
  leftJoin: mockLeftJoin,
});
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
const mockReturning = vi.fn();
const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
const mockInsertValues = vi.fn().mockReturnValue({
  returning: mockReturning,
  onConflictDoUpdate: mockOnConflictDoUpdate,
});
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
// The returning mock defaults to 1 row (success). Override per-test with
// mockUpdateReturning.mockResolvedValueOnce([]) to simulate 0-rows-affected.
const mockUpdateReturning = vi.fn().mockResolvedValue([{ id: "mock-cred-id" }]);
const mockUpdateWhere = vi
  .fn()
  .mockReturnValue({ returning: mockUpdateReturning });
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });
const mockTransaction = vi.fn();

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
  }),
}));

vi.mock("@/db/schema", () => ({
  profiles: "profiles-table",
  businesses: "businesses-table",
  adeCredentials: "ade-credentials-table",
}));

const mockEncrypt = vi.fn().mockReturnValue("encrypted-data");
const mockDecrypt = vi.fn().mockReturnValue("decrypted-data");
vi.mock("@/lib/crypto", () => ({
  encrypt: (...args: unknown[]) => mockEncrypt(...args),
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
  getEncryptionKey: () => Buffer.alloc(32),
  getKeyVersion: () => 1,
}));

const mockLogin = vi.fn();
const mockLogout = vi.fn();
const mockGetFiscalData = vi.fn();
vi.mock("@/lib/ade", () => ({
  createAdeClient: vi.fn().mockReturnValue({
    login: mockLogin,
    logout: mockLogout,
    getFiscalData: mockGetFiscalData,
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockSendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({
  sendEmail: mockSendEmail,
}));

vi.mock("@/emails/welcome", () => ({
  WelcomeEmail: vi.fn().mockReturnValue(null),
}));

const mockNotifyOperator = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/operator-notification", () => ({
  notifyOperatorOfNewSignup: mockNotifyOperator,
}));

// --- Helpers ---

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

const FAKE_USER = { id: "user-123", email: "test@example.com" };
const FAKE_PROFILE = { id: "profile-456", authUserId: "user-123" };
const FAKE_BUSINESS = { id: "biz-789", profileId: "profile-456" };

// --- Tests ---

describe("onboarding-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // vi.clearAllMocks resetta calls/results ma NON la coda di mockReturnValueOnce.
    // Resettiamo esplicitamente i mock con .mockResolvedValueOnce su mockLimit,
    // mockReturning e mockOnConflictDoUpdate per evitare leakage tra test che
    // refactoring del codice possono indurre (es. saveAdeCredentials oggi non
    // fa più SELECT existing credenziali, lasciando in coda l'item dei test
    // precedenti).
    mockLimit.mockReset();
    mockReturning.mockReset();
    mockOnConflictDoUpdate.mockReset().mockResolvedValue(undefined);
    mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockRevalidatePath.mockReset();
    process.env.ENCRYPTION_KEY = "a".repeat(64);
    process.env.ENCRYPTION_KEY_VERSION = "1";
    process.env.ADE_MODE = "mock";
    // Default: transaction is a passthrough that calls the callback with same mock db
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select: mockSelect, insert: mockInsert, update: mockUpdate }),
    );
  });

  describe("saveBusiness", () => {
    const VALID_DATA = {
      firstName: "Mario",
      lastName: "Rossi",
      address: "Via Roma",
      zipCode: "00100",
    };

    it("returns error for missing first name", async () => {
      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(
        formData({ ...VALID_DATA, firstName: "" }),
      );
      expect(result.error).toContain("nome");
    });

    it("returns error for missing last name", async () => {
      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(
        formData({ ...VALID_DATA, lastName: "" }),
      );
      expect(result.error).toContain("cognome");
    });

    it("returns error for missing address", async () => {
      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(
        formData({ ...VALID_DATA, address: "" }),
      );
      expect(result.error).toContain("indirizzo");
    });

    it("returns error for invalid CAP (non-5-digit)", async () => {
      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(
        formData({ ...VALID_DATA, zipCode: "123" }),
      );
      expect(result.error).toContain("CAP");
    });

    it("returns error for CAP with non-numeric characters", async () => {
      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(
        formData({ ...VALID_DATA, zipCode: "AB123" }),
      );
      expect(result.error).toContain("CAP");
    });

    it("creates a new business when none exists", async () => {
      // Profile found
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      // No existing business
      mockLimit.mockResolvedValueOnce([]);
      // Insert returns new business
      mockReturning.mockResolvedValueOnce([{ id: "new-biz-id" }]);

      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(formData(VALID_DATA));

      expect(result.businessId).toBe("new-biz-id");
      expect(result.error).toBeUndefined();
      expect(mockInsert).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalled(); // profiles firstName/lastName update
    });

    it("updates existing business", async () => {
      // Profile found
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      // Existing business found
      mockLimit.mockResolvedValueOnce([FAKE_BUSINESS]);

      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(
        formData({ ...VALID_DATA, businessName: "Pizzeria Roma" }),
      );

      expect(result.businessId).toBe("biz-789");
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("saves without businessName (optional field)", async () => {
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      mockLimit.mockResolvedValueOnce([]);
      mockReturning.mockResolvedValueOnce([{ id: "new-biz-id" }]);

      const { saveBusiness } = await import("./onboarding-actions");
      // businessName intentionally omitted
      const result = await saveBusiness(formData(VALID_DATA));

      expect(result.error).toBeUndefined();
      expect(result.businessId).toBe("new-biz-id");
    });

    it("returns error when profile not found", async () => {
      mockLimit.mockResolvedValueOnce([]); // No profile

      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(formData(VALID_DATA));

      expect(result.error).toContain("Profilo non trovato");
    });

    it("esegue aggiornamento profilo e business in una transazione", async () => {
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      mockLimit.mockResolvedValueOnce([]);
      mockReturning.mockResolvedValueOnce([{ id: "new-biz-id" }]);

      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(formData(VALID_DATA));

      expect(mockTransaction).toHaveBeenCalled();
      expect(result.businessId).toBe("new-biz-id");
    });

    it("returns error when firstName exceeds 80 characters", async () => {
      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(
        formData({ ...VALID_DATA, firstName: "A".repeat(81) }),
      );
      expect(result.error).toContain("80");
    });

    it("accepts firstName exactly 80 characters", async () => {
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      mockLimit.mockResolvedValueOnce([]);
      mockReturning.mockResolvedValueOnce([{ id: "new-biz-id" }]);

      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(
        formData({ ...VALID_DATA, firstName: "A".repeat(80) }),
      );
      expect(result.error).toBeUndefined();
    });

    it("returns error when lastName exceeds 80 characters", async () => {
      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(
        formData({ ...VALID_DATA, lastName: "B".repeat(81) }),
      );
      expect(result.error).toContain("80");
    });

    it("returns error when businessName exceeds 120 characters", async () => {
      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(
        formData({ ...VALID_DATA, businessName: "X".repeat(121) }),
      );
      expect(result.error).toContain("120");
    });

    it("returns error when address exceeds 150 characters", async () => {
      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(
        formData({ ...VALID_DATA, address: "Y".repeat(151) }),
      );
      expect(result.error).toContain("150");
    });

    it("returns error when city exceeds 80 characters", async () => {
      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(
        formData({ ...VALID_DATA, city: "Z".repeat(81) }),
      );
      expect(result.error).toContain("80");
    });

    it("returns error when province exceeds 3 characters", async () => {
      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(
        formData({ ...VALID_DATA, province: "ROMA" }),
      );
      expect(result.error).toContain("3");
    });

    it("preserva preferredVatCode esistente quando il field è assente dal form (UPDATE)", async () => {
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      mockLimit.mockResolvedValueOnce([FAKE_BUSINESS]);

      const { saveBusiness } = await import("./onboarding-actions");
      // FormData senza la key preferredVatCode
      const result = await saveBusiness(formData(VALID_DATA));

      expect(result.businessId).toBe("biz-789");
      // Due update: [0] profiles (firstName/lastName), [1] businesses
      const businessSetPayload = mockUpdateSet.mock.calls[1]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(businessSetPayload).toBeDefined();
      expect(businessSetPayload).not.toHaveProperty("preferredVatCode");
    });

    it("azzera preferredVatCode quando il field è presente e vuoto (UPDATE)", async () => {
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      mockLimit.mockResolvedValueOnce([FAKE_BUSINESS]);

      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(
        formData({ ...VALID_DATA, preferredVatCode: "" }),
      );

      expect(result.businessId).toBe("biz-789");
      const businessSetPayload = mockUpdateSet.mock.calls[1]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(businessSetPayload?.preferredVatCode).toBeNull();
    });

    it("non valida preferredVatCode quando assente dal form", async () => {
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      mockLimit.mockResolvedValueOnce([]);
      mockReturning.mockResolvedValueOnce([{ id: "new-biz-id" }]);

      const { saveBusiness } = await import("./onboarding-actions");
      // Nessun campo preferredVatCode → validazione skip
      const result = await saveBusiness(formData(VALID_DATA));

      expect(result.error).toBeUndefined();
      expect(result.businessId).toBe("new-biz-id");
    });

    it("rifiuta preferredVatCode invalido se presente e non vuoto", async () => {
      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(
        formData({ ...VALID_DATA, preferredVatCode: "99" }),
      );
      expect(result.error).toContain("Aliquota IVA non valida");
    });

    it("propaga errore se la transazione fallisce (rollback garantito)", async () => {
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      mockTransaction.mockRejectedValue(
        new Error("DB error during transaction"),
      );

      const { saveBusiness } = await import("./onboarding-actions");
      await expect(saveBusiness(formData(VALID_DATA))).rejects.toThrow(
        "DB error during transaction",
      );
    });
  });

  describe("saveAdeCredentials", () => {
    it("encrypts and saves credentials", async () => {
      // Ownership check: JOIN profile+business
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      // No existing credentials
      mockLimit.mockResolvedValueOnce([]);

      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "biz-789",
          codiceFiscale: "RSSMRA80A01H501U",
          password: "securepass",
          pin: "1234567890",
        }),
      );

      expect(result.businessId).toBe("biz-789");
      expect(result.error).toBeUndefined();
      expect(mockEncrypt).toHaveBeenCalledTimes(3);
      expect(mockInsert).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
    });

    it("returns error for missing businessId", async () => {
      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "",
          codiceFiscale: "RSSMRA80A01H501U",
          password: "pass",
          pin: "1234567890",
        }),
      );
      expect(result.error).toContain("Business ID");
    });

    it("returns error for empty password", async () => {
      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "biz-789",
          codiceFiscale: "RSSMRA80A01H501U",
          password: "",
          pin: "1234567890",
        }),
      );
      expect(result.error).toContain("Password");
    });

    it("returns error for invalid codice fiscale length", async () => {
      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "biz-789",
          codiceFiscale: "SHORT",
          password: "pass",
          pin: "1234567890",
        }),
      );
      expect(result.error).toContain("Codice fiscale");
    });

    it("returns error for PIN with fewer than 10 digits", async () => {
      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "biz-789",
          codiceFiscale: "RSSMRA80A01H501U",
          password: "pass",
          pin: "123456789",
        }),
      );
      expect(result.error).toContain("PIN");
    });

    it("returns error for PIN with more than 10 digits", async () => {
      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "biz-789",
          codiceFiscale: "RSSMRA80A01H501U",
          password: "pass",
          pin: "12345678901",
        }),
      );
      expect(result.error).toContain("PIN");
    });

    it("returns error for PIN containing non-numeric characters", async () => {
      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "biz-789",
          codiceFiscale: "RSSMRA80A01H501U",
          password: "pass",
          pin: "abcdefghij",
        }),
      );
      expect(result.error).toContain("PIN");
    });

    it("accepts PIN of exactly 10 numeric digits", async () => {
      // Ownership check: JOIN profile+business
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      // No existing credentials
      mockLimit.mockResolvedValueOnce([]);

      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "biz-789",
          codiceFiscale: "RSSMRA80A01H501U",
          password: "pass",
          pin: "1234567890",
        }),
      );
      expect(result.error).toBeUndefined();
    });

    it("accepts PIN with surrounding whitespace (server trims before validation)", async () => {
      // Ownership check: JOIN profile+business
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      // No existing credentials
      mockLimit.mockResolvedValueOnce([]);

      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "biz-789",
          codiceFiscale: "RSSMRA80A01H501U",
          password: "pass",
          pin: " 1234567890 ",
        }),
      );
      expect(result.error).toBeUndefined();
    });

    it("upserts credentials atomically and resets verifiedAt on conflict", async () => {
      // Ownership check: JOIN profile+business
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);

      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "biz-789",
          codiceFiscale: "RSSMRA80A01H501U",
          password: "newpass",
          pin: "1234567890",
        }),
      );

      expect(result.businessId).toBe("biz-789");
      // Atomic upsert: insert + onConflictDoUpdate (target businessId).
      // Niente più SELECT-then-UPDATE, niente race condition possibile.
      expect(mockInsert).toHaveBeenCalled();
      expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          set: expect.objectContaining({ verifiedAt: null }),
        }),
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
    });

    it("returns error when business does not belong to the user (IDOR)", async () => {
      // Ownership check: JOIN returns no match
      mockLimit.mockResolvedValueOnce([]);

      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "other-user-biz",
          codiceFiscale: "RSSMRA80A01H501U",
          password: "pass",
          pin: "1234567890",
        }),
      );

      expect(result.error).toContain("non autorizzato");
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("verifyAdeCredentials", () => {
    it("verifies credentials successfully and fetches fiscal data", async () => {
      // Ownership check: JOIN profile+business
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      // Credentials found
      mockLimit.mockResolvedValueOnce([
        {
          businessId: "biz-789",
          encryptedCodiceFiscale: "enc-cf",
          encryptedPassword: "enc-pw",
          encryptedPin: "enc-pin",
          keyVersion: 1,
          updatedAt: new Date("2026-03-26T14:36:07.000Z"),
        },
      ]);
      mockLogin.mockResolvedValue({});
      mockLogout.mockResolvedValue(undefined);
      mockGetFiscalData.mockResolvedValue({
        identificativiFiscali: {
          codicePaese: "IT",
          partitaIva: "12345678901",
          codiceFiscale: "RSSMRA80A01H501U",
        },
      });

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.businessId).toBe("biz-789");
      expect(result.error).toBeUndefined();
      expect(mockLogin).toHaveBeenCalled();
      expect(mockLogout).toHaveBeenCalled();
      expect(mockGetFiscalData).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledTimes(3); // businesses vatNumber/fiscalCode + profiles partitaIva + adeCredentials verifiedAt
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
    });

    it("marks credentials as verified even when getFiscalData fails", async () => {
      // Ownership check: JOIN profile+business
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      // Credentials found
      mockLimit.mockResolvedValueOnce([
        {
          businessId: "biz-789",
          encryptedCodiceFiscale: "enc-cf",
          encryptedPassword: "enc-pw",
          encryptedPin: "enc-pin",
          keyVersion: 1,
          updatedAt: new Date("2026-03-26T14:36:07.000Z"),
        },
      ]);
      mockLogin.mockResolvedValue({});
      mockLogout.mockResolvedValue(undefined);
      mockGetFiscalData.mockRejectedValue(
        new Error("AdE fiscal data unavailable"),
      );

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.error).toBeUndefined();
      expect(result.businessId).toBe("biz-789");
      expect(mockGetFiscalData).toHaveBeenCalled();
      // Only 1 update (adeCredentials verifiedAt); businesses update was skipped
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
    });

    it("returns error when credentials not found", async () => {
      // Ownership check: JOIN profile+business
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      // No credentials
      mockLimit.mockResolvedValueOnce([]);

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.error).toContain("Credenziali non trovate");
    });

    it("returns error when AdE login fails", async () => {
      // Ownership check: JOIN profile+business
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      // Credentials found
      mockLimit.mockResolvedValueOnce([
        {
          businessId: "biz-789",
          encryptedCodiceFiscale: "enc-cf",
          encryptedPassword: "enc-pw",
          encryptedPin: "enc-pin",
          keyVersion: 1,
          updatedAt: new Date("2026-03-26T14:36:07.000Z"),
        },
      ]);
      mockLogin.mockRejectedValue(new Error("Invalid credentials"));

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.error).toContain("Verifica fallita");
    });

    it("returns a dedicated message when AdE responds with 5xx", async () => {
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      mockLimit.mockResolvedValueOnce([
        {
          businessId: "biz-789",
          encryptedCodiceFiscale: "enc-cf",
          encryptedPassword: "enc-pw",
          encryptedPin: "enc-pin",
          keyVersion: 1,
          updatedAt: new Date("2026-03-26T14:36:07.000Z"),
        },
      ]);
      const { AdePortalError } = await import("@/lib/ade/errors");
      mockLogin.mockRejectedValue(
        new AdePortalError(500, "wizardTemplate failed with status 500"),
      );

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.error).toContain(
        "portale Agenzia delle Entrate Fatture e Corrispettivi",
      );
      expect(result.error).toContain("non risponde al momento");
      expect(result.error).toContain("Non dipende da te né da ScontrinoZero");
      expect(result.error).not.toContain("Verifica fallita");
    });

    it("returns a dedicated message when AdE is unreachable (network error)", async () => {
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      mockLimit.mockResolvedValueOnce([
        {
          businessId: "biz-789",
          encryptedCodiceFiscale: "enc-cf",
          encryptedPassword: "enc-pw",
          encryptedPin: "enc-pin",
          keyVersion: 1,
          updatedAt: new Date("2026-03-26T14:36:07.000Z"),
        },
      ]);
      const { AdeNetworkError } = await import("@/lib/ade/errors");
      mockLogin.mockRejectedValue(new AdeNetworkError(new Error("ECONNRESET")));

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.error).toContain(
        "portale Agenzia delle Entrate Fatture e Corrispettivi",
      );
      expect(result.error).toContain("non è raggiungibile al momento");
      expect(result.error).not.toContain("Verifica fallita");
    });

    it("returns error when business does not belong to the user (IDOR)", async () => {
      // Ownership check: JOIN returns no match
      mockLimit.mockResolvedValueOnce([]);

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("other-user-biz");

      expect(result.error).toContain("non autorizzato");
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it("sends welcome email on first successful verification", async () => {
      // Ownership check: JOIN profile+business
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      // Credentials found — verifiedAt is null (first verification)
      mockLimit.mockResolvedValueOnce([
        {
          businessId: "biz-789",
          encryptedCodiceFiscale: "enc-cf",
          encryptedPassword: "enc-pw",
          encryptedPin: "enc-pin",
          keyVersion: 1,
          updatedAt: new Date("2026-03-26T14:36:07.000Z"),
          verifiedAt: null,
        },
      ]);
      mockLogin.mockResolvedValue({});
      mockLogout.mockResolvedValue(undefined);
      mockGetFiscalData.mockResolvedValue({
        identificativiFiscali: {
          codicePaese: "IT",
          partitaIva: "12345678901",
          codiceFiscale: "RSSMRA80A01H501U",
        },
      });

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      await verifyAdeCredentials("biz-789");

      // fire-and-forget: advance microtasks so the void promise settles
      await Promise.resolve();
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "test@example.com" }),
      );
      expect(mockNotifyOperator).toHaveBeenCalledWith("user-123");
    });

    it("does not fail when operator notification rejects", async () => {
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      mockLimit.mockResolvedValueOnce([
        {
          businessId: "biz-789",
          encryptedCodiceFiscale: "enc-cf",
          encryptedPassword: "enc-pw",
          encryptedPin: "enc-pin",
          keyVersion: 1,
          updatedAt: new Date("2026-03-26T14:36:07.000Z"),
          verifiedAt: null,
        },
      ]);
      mockLogin.mockResolvedValue({});
      mockLogout.mockResolvedValue(undefined);
      mockGetFiscalData.mockResolvedValue({
        identificativiFiscali: {
          codicePaese: "IT",
          partitaIva: "12345678901",
          codiceFiscale: "RSSMRA80A01H501U",
        },
      });
      mockNotifyOperator.mockRejectedValueOnce(new Error("resend down"));

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      // Caller swallows the rejection via .catch — flush microtasks so the
      // unhandled-rejection guard doesn't trip in the test runner.
      await Promise.resolve();
      await Promise.resolve();
      expect(result.businessId).toBe("biz-789");
      expect(result.error).toBeUndefined();
    });

    it("does not send welcome email on re-verification", async () => {
      // Ownership check: JOIN profile+business
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      // Credentials found — verifiedAt already set (re-verification)
      mockLimit.mockResolvedValueOnce([
        {
          businessId: "biz-789",
          encryptedCodiceFiscale: "enc-cf",
          encryptedPassword: "enc-pw",
          encryptedPin: "enc-pin",
          keyVersion: 1,
          updatedAt: new Date("2026-03-26T14:36:07.000Z"),
          verifiedAt: new Date("2026-01-01"),
        },
      ]);
      mockLogin.mockResolvedValue({});
      mockLogout.mockResolvedValue(undefined);
      mockGetFiscalData.mockResolvedValue({
        identificativiFiscali: {
          codicePaese: "IT",
          partitaIva: "12345678901",
          codiceFiscale: "RSSMRA80A01H501U",
        },
      });

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      await verifyAdeCredentials("biz-789");

      await Promise.resolve();
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockNotifyOperator).not.toHaveBeenCalled();
    });

    it("blocca la verifica se la P.IVA è già in uso su un altro account (anti-abuso trial)", async () => {
      // Ownership check
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      // Credentials found — first verification
      mockLimit.mockResolvedValueOnce([
        {
          businessId: "biz-789",
          encryptedCodiceFiscale: "enc-cf",
          encryptedPassword: "enc-pw",
          encryptedPin: "enc-pin",
          keyVersion: 1,
          updatedAt: new Date("2026-03-26T14:36:07.000Z"),
          verifiedAt: null,
        },
      ]);
      mockLogin.mockResolvedValue({});
      mockLogout.mockResolvedValue(undefined);
      mockGetFiscalData.mockResolvedValue({
        identificativiFiscali: {
          codicePaese: "IT",
          partitaIva: "12345678901",
          codiceFiscale: "RSSMRA80A01H501U",
        },
      });

      // businesses update OK, profiles update → unique constraint violation
      const pgConflictError = Object.assign(new Error("unique constraint"), {
        code: "23505",
      });
      mockUpdateSet
        .mockReturnValueOnce({ where: vi.fn().mockResolvedValue(undefined) }) // businesses
        .mockReturnValueOnce({
          where: vi.fn().mockRejectedValue(pgConflictError),
        }); // profiles

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.error).toContain("P.IVA");
      expect(result.businessId).toBeUndefined();
      // Logout must still be called (finally block)
      expect(mockLogout).toHaveBeenCalled();
      // adeCredentials.verifiedAt must NOT be updated (returned early)
      expect(mockUpdate).toHaveBeenCalledTimes(2); // businesses + profiles only
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("chiama logout anche se getFiscalData lancia un errore", async () => {
      // Ownership check: JOIN profile+business
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      // Credentials found
      mockLimit.mockResolvedValueOnce([
        {
          businessId: "biz-789",
          encryptedCodiceFiscale: "enc-cf",
          encryptedPassword: "enc-pw",
          encryptedPin: "enc-pin",
          keyVersion: 1,
          updatedAt: new Date("2026-03-26T14:36:07.000Z"),
          verifiedAt: null,
        },
      ]);
      mockLogin.mockResolvedValue({});
      mockLogout.mockResolvedValue(undefined);
      mockGetFiscalData.mockRejectedValue(new Error("fiscal data unavailable"));

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      await verifyAdeCredentials("biz-789");

      expect(mockLogout).toHaveBeenCalled();
    });

    it("chiama logout anche nel happy path di verifyAdeCredentials", async () => {
      // Ownership check: JOIN profile+business
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      // Credentials found
      mockLimit.mockResolvedValueOnce([
        {
          businessId: "biz-789",
          encryptedCodiceFiscale: "enc-cf",
          encryptedPassword: "enc-pw",
          encryptedPin: "enc-pin",
          keyVersion: 1,
          updatedAt: new Date("2026-03-26T14:36:07.000Z"),
          verifiedAt: null,
        },
      ]);
      mockLogin.mockResolvedValue({});
      mockLogout.mockResolvedValue(undefined);
      mockGetFiscalData.mockResolvedValue({
        identificativiFiscali: {
          codicePaese: "IT",
          partitaIva: "12345678901",
          codiceFiscale: "RSSMRA80A01H501U",
        },
      });

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      await verifyAdeCredentials("biz-789");

      expect(mockLogout).toHaveBeenCalled();
    });

    // Regression: postgres-js cannot encode a JS Date as a parameter inside a
    // raw `sql` template (no column-type context), and crashes in
    // `Buffer.byteLength(<Date>)`. The snapshot must be serialized to a string
    // before being bound. See https://dstmrk.sentry.io/issues/SCONTRINOZERO-TEST-7
    it("binds the updatedAt snapshot as ISO string, not as a raw Date", async () => {
      const { PgDialect } = await import("drizzle-orm/pg-core");

      const credentialUpdatedAt = new Date("2026-03-26T14:36:07.000Z");

      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      mockLimit.mockResolvedValueOnce([
        {
          businessId: "biz-789",
          encryptedCodiceFiscale: "enc-cf",
          encryptedPassword: "enc-pw",
          encryptedPin: "enc-pin",
          keyVersion: 1,
          verifiedAt: null,
          updatedAt: credentialUpdatedAt,
        },
      ]);
      mockLogin.mockResolvedValue({});
      mockLogout.mockResolvedValue(undefined);
      mockGetFiscalData.mockResolvedValue({
        identificativiFiscali: {
          codicePaese: "IT",
          partitaIva: "12345678901",
          codiceFiscale: "RSSMRA80A01H501U",
        },
      });

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      await verifyAdeCredentials("biz-789");

      // The last db.update(...).where(...) call targets adeCredentials.verifiedAt.
      // Render the SQL fragment via the real PgDialect so we observe exactly
      // what would be sent to postgres-js as bound parameters.
      const whereArg = mockUpdateWhere.mock.calls.at(-1)?.[0];
      const dialect = new PgDialect();
      const compiled = dialect.sqlToQuery(whereArg);

      expect(compiled.params.some((p) => p instanceof Date)).toBe(false);
      expect(compiled.params).toContain(credentialUpdatedAt.toISOString());
      expect(compiled.sql).toContain("::timestamptz");
    });
  });

  describe("getOnboardingStatus", () => {
    // Single JOIN query: profile -> business (leftJoin) -> credentials (leftJoin).
    // Una sola riga risultato, niente più 3 round-trip DB sequenziali.
    it("returns all false when no profile", async () => {
      mockLimit.mockResolvedValueOnce([]);

      const { getOnboardingStatus } = await import("./onboarding-actions");
      const status = await getOnboardingStatus();

      expect(status).toEqual({
        hasProfile: false,
        hasBusiness: false,
        hasCredentials: false,
        credentialsVerified: false,
      });
      // Esattamente 1 query DB: profile JOIN business JOIN creds
      expect(mockSelect).toHaveBeenCalledTimes(1);
    });

    it("returns hasBusiness false when profile exists but no business", async () => {
      mockLimit.mockResolvedValueOnce([
        {
          profileId: "profile-456",
          businessId: null,
          hasCredentials: false,
          credentialsVerified: false,
        },
      ]);

      const { getOnboardingStatus } = await import("./onboarding-actions");
      const status = await getOnboardingStatus();

      expect(status.hasProfile).toBe(true);
      expect(status.hasBusiness).toBe(false);
      expect(mockSelect).toHaveBeenCalledTimes(1);
    });

    it("returns complete status when all steps done", async () => {
      mockLimit.mockResolvedValueOnce([
        {
          profileId: "profile-456",
          businessId: "biz-789",
          hasCredentials: true,
          credentialsVerified: true,
        },
      ]);

      const { getOnboardingStatus } = await import("./onboarding-actions");
      const status = await getOnboardingStatus();

      expect(status).toEqual({
        hasProfile: true,
        hasBusiness: true,
        businessId: "biz-789",
        hasCredentials: true,
        credentialsVerified: true,
      });
      expect(mockSelect).toHaveBeenCalledTimes(1);
    });
  });
});
