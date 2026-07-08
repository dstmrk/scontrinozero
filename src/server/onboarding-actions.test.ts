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
// `.for("update")` (lock select P1.2) è terminale: viene awaitato e il
// risultato ignorato. Risolve a [] di default.
const mockFor = vi.fn().mockResolvedValue([]);
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit, for: mockFor });
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
// trial_vat_ledger anti-frode: insert ... onConflictDoNothing().returning().
// Default [{ id }] = riga inserita (prima volta → trial concesso). Override con
// mockLedgerReturning.mockResolvedValueOnce([]) per simulare conflict (P.IVA già
// nel ledger → trial negato).
const mockLedgerReturning = vi
  .fn()
  .mockResolvedValue([{ id: "ledger-row-id" }]);
const mockOnConflictDoNothing = vi
  .fn()
  .mockReturnValue({ returning: mockLedgerReturning });
const mockInsertValues = vi.fn().mockReturnValue({
  returning: mockReturning,
  onConflictDoUpdate: mockOnConflictDoUpdate,
  onConflictDoNothing: mockOnConflictDoNothing,
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
  trialVatLedger: "trial-vat-ledger-table",
  referralRedemptions: "referral-redemptions-table",
  subscriptions: "subscriptions-table",
}));

// Estensione Stripe del referrer a pagamento: mockata per non tirare dentro
// il client Stripe reale e per poter asserire QUANDO viene chiamata.
const mockExtendSubscriptionForReferral = vi
  .fn()
  .mockResolvedValue({ extended: true });
vi.mock("@/server/referral-reward", () => ({
  extendSubscriptionForReferral: mockExtendSubscriptionForReferral,
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
const mockLoginCie = vi.fn();
const mockLogout = vi.fn();
const mockGetFiscalData = vi.fn();
vi.mock("@/lib/ade", () => ({
  getAdeMode: () => "mock",
  createAdeClient: vi.fn().mockReturnValue({
    login: mockLogin,
    loginCie: mockLoginCie,
    logout: mockLogout,
    getFiscalData: mockGetFiscalData,
  }),
}));

const mockRateLimiterCheck = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
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
    // I claim atomici welcome/operator (verifyAdeCredentials) usano
    // mockResolvedValueOnce ordinati su mockUpdateReturning: reset esplicito per
    // evitare leak della coda Once tra test (clearAllMocks non la svuota).
    mockUpdateReturning.mockReset().mockResolvedValue([{ id: "mock-cred-id" }]);
    mockOnConflictDoUpdate.mockReset().mockResolvedValue(undefined);
    mockLedgerReturning
      .mockReset()
      .mockResolvedValue([{ id: "ledger-row-id" }]);
    mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockRateLimiterCheck.mockReset().mockReturnValue({
      success: true,
      remaining: 4,
      resetAt: Date.now() + 15 * 60 * 1000,
    });
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

    it("degrada a 'Non autenticato.' quando la sessione è scaduta (no throw)", async () => {
      // Sessione assente → getAuthenticatedUser lancia UnauthenticatedError;
      // l'action degrada a { error } inline (regola 19/20), non propaga.
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(formData(VALID_DATA));
      expect(result.error).toBe("Non autenticato.");
    });

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

    it("acquisisce un lock FOR UPDATE sul profilo per serializzare submit concorrenti (P1.2)", async () => {
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      mockLimit.mockResolvedValueOnce([]);
      mockReturning.mockResolvedValueOnce([{ id: "new-biz-id" }]);

      const { saveBusiness } = await import("./onboarding-actions");
      await saveBusiness(formData(VALID_DATA));

      // Il lock select è dentro la transazione, prima di leggere il profilo.
      expect(mockFor).toHaveBeenCalledWith("update");
      expect(mockTransaction).toHaveBeenCalled();
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

    it("returns error when streetNumber exceeds 20 characters", async () => {
      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(
        formData({ ...VALID_DATA, streetNumber: "1".repeat(21) }),
      );
      expect(result.error).toContain("numero civico");
    });

    it("accepts streetNumber exactly 20 characters", async () => {
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      mockLimit.mockResolvedValueOnce([]);
      mockReturning.mockResolvedValueOnce([{ id: "new-biz-id" }]);

      const { saveBusiness } = await import("./onboarding-actions");
      const result = await saveBusiness(
        formData({ ...VALID_DATA, streetNumber: "1".repeat(20) }),
      );
      expect(result.error).toBeUndefined();
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
        Record<string, unknown> | undefined;
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
        Record<string, unknown> | undefined;
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
    it("degrada a 'Non autenticato.' quando la sessione è scaduta (no throw)", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({ businessId: "biz-789" }),
      );
      expect(result.error).toBe("Non autenticato.");
    });

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

    it.each([
      { scenario: "fewer than 10 digits", pin: "123456789" },
      { scenario: "more than 10 digits", pin: "12345678901" },
      { scenario: "non-numeric characters", pin: "abcdefghij" },
    ])("returns error for PIN with $scenario", async ({ pin }) => {
      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "biz-789",
          codiceFiscale: "RSSMRA80A01H501U",
          password: "pass",
          pin,
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

    it("CIE: salva username(email)+password con login_method 'cie'", async () => {
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);

      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "biz-789",
          loginMethod: "cie",
          username: "mario.rossi@example.com",
          password: "cie-pass",
        }),
      );

      expect(result.businessId).toBe("biz-789");
      expect(mockInsert).toHaveBeenCalled();
      // login_method 'cie' + reset dei campi Fisconline (CF/PIN null).
      expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          set: expect.objectContaining({
            loginMethod: "cie",
            encryptedCodiceFiscale: null,
            encryptedPin: null,
            verifiedAt: null,
          }),
        }),
      );
    });

    it("CIE: rifiuta uno username non-email prima dell'ownership check", async () => {
      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "biz-789",
          loginMethod: "cie",
          username: "non-una-email",
          password: "cie-pass",
        }),
      );

      expect(result.error).toContain("email");
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("SPID: rifiutato (non supportato da PWA), nessun insert", async () => {
      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "biz-789",
          loginMethod: "spid",
          username: "mario.rossi@example.com",
          password: "pw",
        }),
      );

      expect(result.error).toContain("SPID");
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  describe("verifyAdeCredentials", () => {
    beforeEach(() => {
      // Default snapshot for the businesses.fiscalCode read added in
      // verifyAdeCredentials (gates the welcome/operator emails on first
      // onboarding). Tests that need "already onboarded" semantics override
      // with mockResolvedValueOnce({ fiscalCode: "..." }) AFTER queuing the
      // ownership + credentials mocks.
      mockLimit.mockResolvedValue([{ fiscalCode: null }]);
    });

    it("degrada a 'Non autenticato.' quando la sessione è scaduta (no throw)", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");
      expect(result.error).toBe("Non autenticato.");
    });

    it("R36: alla soglia rate limit → warn + errore standard, senza toccare AdE", async () => {
      // Simmetria con changeAdePassword: stesso profilo di costo (login AdE),
      // stessa protezione. Senza il gate un utente autenticato puo' martellare
      // il login AdE rischiando un IP-block sull'egress condiviso (REVIEW.md #36).
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      mockRateLimiterCheck.mockReturnValueOnce({
        success: false,
        remaining: 0,
        resetAt: Date.now() + 15 * 60 * 1000,
      });

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.error).toBe(
        "Troppi tentativi. Riprova tra qualche minuto.",
      );
      // Degrada, non lancia (regola 19); nessuna chiamata AdE (decrypt/login).
      expect(mockDecrypt).not.toHaveBeenCalled();
      expect(mockLogin).not.toHaveBeenCalled();
      expect(mockGetFiscalData).not.toHaveBeenCalled();

      // warn (input prevedibile, regola 20 — niente Sentry), mai error.
      const { logger } = await import("@/lib/logger");
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ userId: FAKE_USER.id }),
        expect.stringContaining("rate limit exceeded"),
      );
    });

    it("R36: chiave per-utente, controllata DOPO l'ownership gate", async () => {
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

      // Chiave isolata per utente: un business non blocca l'altro.
      expect(mockRateLimiterCheck).toHaveBeenCalledWith(
        `verify-ade:${FAKE_USER.id}`,
      );
      // Sotto soglia → il flusso AdE procede normalmente.
      expect(mockLogin).toHaveBeenCalled();
    });

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
      // 3 update "core" (adeCredentials verifiedAt + businesses vatNumber/
      // fiscalCode + profiles partitaIva) + 2 update del claim referral
      // (referral_redemptions.rewardedAt + profiles.referralBonusDays) + 2 claim
      // email (welcome_email_sent_at + operator_notified_at, migration 0023) che
      // scattano sempre sotto i mock generici condivisi (returning() risolve
      // sempre a una riga non-vuota di default).
      expect(mockUpdate).toHaveBeenCalledTimes(7);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
    });

    it("CIE: verifica via loginCie (non login Fisconline)", async () => {
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      // Riga credenziali con metodo CIE: username(email) + password, niente CF/PIN.
      mockLimit.mockResolvedValueOnce([
        {
          businessId: "biz-789",
          loginMethod: "cie",
          encryptedCodiceFiscale: null,
          encryptedUsername: "enc-email",
          encryptedPassword: "enc-pw",
          encryptedPin: null,
          keyVersion: 1,
          updatedAt: new Date("2026-03-26T14:36:07.000Z"),
        },
      ]);
      mockLoginCie.mockResolvedValue({});
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

      expect(result.error).toBeUndefined();
      expect(mockLoginCie).toHaveBeenCalled();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it("SPID: riga con metodo spid degrada senza tentare login", async () => {
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      mockLimit.mockResolvedValueOnce([
        {
          businessId: "biz-789",
          loginMethod: "spid",
          encryptedCodiceFiscale: null,
          encryptedUsername: null,
          encryptedPassword: null,
          encryptedPin: null,
          keyVersion: 1,
          updatedAt: new Date("2026-03-26T14:36:07.000Z"),
        },
      ]);

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.error).toContain("SPID");
      expect(mockLogin).not.toHaveBeenCalled();
      expect(mockLoginCie).not.toHaveBeenCalled();
    });

    it("referrer in trial: incrementa referralBonusDays, niente estensione Stripe", async () => {
      // Default delle SELECT trailing (referrerSub) = nessun abbonamento attivo
      // → ramo referralBonusDays. Ownership + credenziali in coda.
      mockLimit.mockResolvedValue([
        { status: null, stripeSubscriptionId: null },
      ]);
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

      // 3 core update + rewardedAt + referralBonusDays + 2 claim email = 7;
      // nessuna Stripe.
      expect(mockUpdate).toHaveBeenCalledTimes(7);
      expect(mockExtendSubscriptionForReferral).not.toHaveBeenCalled();
    });

    it("referrer con abbonamento Stripe attivo: estende su Stripe, NON tocca referralBonusDays", async () => {
      // Default delle SELECT trailing (referrerSub) = abbonamento attivo →
      // ramo estensione Stripe (post-commit), niente incremento bonus.
      mockLimit.mockResolvedValue([
        { status: "active", stripeSubscriptionId: "sub_active" },
      ]);
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

      // 3 core update + rewardedAt + 2 claim email = 6 (NESSUN update
      // referralBonusDays: ramo estensione Stripe).
      expect(mockUpdate).toHaveBeenCalledTimes(6);
      expect(mockExtendSubscriptionForReferral).toHaveBeenCalledTimes(1);
      expect(mockExtendSubscriptionForReferral).toHaveBeenCalledWith(
        expect.objectContaining({ stripeSubscriptionId: "sub_active" }),
      );
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
      // 1 update core (adeCredentials verifiedAt; businesses/profiles update
      // skipped perché fiscalData è null) + 2 claim email (welcome/operator):
      // la verifica è riuscita (verifiedAt impostato), quindi le email di
      // onboarding partono comunque, come nel comportamento precedente.
      expect(mockUpdate).toHaveBeenCalledTimes(3);
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

    it("M3: AdE transient (AdePortalError 5xx) logga a warn invece di error", async () => {
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
      mockLogin.mockRejectedValue(new AdePortalError(503, "down"));

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      await verifyAdeCredentials("biz-789");

      const { logger } = await import("@/lib/logger");
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: "biz-789",
          errorClass: "ade_transient",
        }),
        expect.stringContaining("transient failure"),
      );
      const errorCalls = (logger.error as ReturnType<typeof vi.fn>).mock.calls;
      const failedCalls = errorCalls.filter((c) =>
        String(c[1] ?? "").includes("AdE credential verification failed"),
      );
      expect(failedCalls).toHaveLength(0);
    });

    it("R21: AdeAuthError in verifyAdeCredentials logga warn con errorClass ade_user_error (no Sentry noise: SCONTRINOZERO-7)", async () => {
      // Era il root cause di SCONTRINOZERO-7 (23 eventi in 5 settimane,
      // archiviata come noise): utenti che digitano credenziali AdE
      // sbagliate da /dashboard/settings finivano come logger.error ->
      // Sentry issue. Ora -> warn + ade_user_error, niente Sentry.
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
      const { AdeAuthError } = await import("@/lib/ade/errors");
      mockLogin.mockRejectedValue(new AdeAuthError());

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      await verifyAdeCredentials("biz-789");

      const { logger } = await import("@/lib/logger");
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: "biz-789",
          errorClass: "ade_user_error",
        }),
        expect.stringContaining("AdE credential verification"),
      );
      expect(logger.error).not.toHaveBeenCalledWith(
        expect.objectContaining({ errorClass: "ade_failure" }),
        expect.anything(),
      );
    });

    it("R23: generic Error in verifyAdeCredentials logga error con sentryFingerprint per flow onboarding-verify", async () => {
      // SCONTRINOZERO-9/-A condividevano trace_id ma generavano 2 issue
      // Sentry distinte perche' i message divergevano. Con il flow propagato,
      // due errori "ade_failure" nello stesso flow finiscono in un unico
      // group Sentry (regola 23 di CLAUDE.md).
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
      mockLogin.mockRejectedValue(new Error("unexpected wizard failure"));

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      await verifyAdeCredentials("biz-789");

      const { logger } = await import("@/lib/logger");
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: "biz-789",
          errorClass: "ade_failure",
          flow: "onboarding-verify",
          sentryFingerprint: ["onboarding-verify", "ade_failure"],
        }),
        expect.stringContaining("AdE credential verification failed"),
      );
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

    it("does not send welcome/operator email when both flags are already set (claim returns 0 rows)", async () => {
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
      // Idempotency durabile (migration 0023): i flag welcome/operator sono già
      // valorizzati, quindi i due UPDATE ... WHERE ... IS NULL non matchano
      // alcuna riga (returning() vuoto) → nessuna email. Ordine returning():
      // verifiedAt, referral redemption, welcome claim, operator claim.
      mockUpdateReturning
        .mockResolvedValueOnce([{ id: "mock-cred-id" }]) // verifiedAt: procede
        .mockResolvedValueOnce([]) // referral: nessuna redemption pendente
        .mockResolvedValueOnce([]) // welcome claim: flag già set
        .mockResolvedValueOnce([]); // operator claim: flag già set

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      await verifyAdeCredentials("biz-789");

      await Promise.resolve();
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockNotifyOperator).not.toHaveBeenCalled();
    });

    // Regression: il vecchio gating su cred.verifiedAt re-inviava welcome +
    // operator quando l'utente sostituiva le credenziali (saveAdeCredentials
    // azzera verifiedAt) e ri-verificava. Ora il flag durabile
    // welcome_email_sent_at sopravvive al reset delle credenziali: il claim
    // atomico torna 0 righe e nessuna email parte, anche con verifiedAt = null.
    it("does not re-send welcome email after credential reset (durable flag survives)", async () => {
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
      // verifiedAt is null (credentials were just replaced) — ma i flag email
      // erano già stati valorizzati nella prima verifica andata a buon fine.
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
      mockUpdateReturning
        .mockResolvedValueOnce([{ id: "mock-cred-id" }]) // verifiedAt: procede
        .mockResolvedValueOnce([]) // referral: nessuna redemption pendente
        .mockResolvedValueOnce([]) // welcome claim: flag già set
        .mockResolvedValueOnce([]); // operator claim: flag già set

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      await verifyAdeCredentials("biz-789");

      await Promise.resolve();
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockNotifyOperator).not.toHaveBeenCalled();
    });

    it("invia solo la notifica operatore quando il flag welcome è già set ma operator no (flag indipendenti)", async () => {
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
      // welcome già inviato (claim vuoto), operator ancora da fare (claim 1 riga):
      // i due flag si reclamano in modo indipendente.
      mockUpdateReturning
        .mockResolvedValueOnce([{ id: "mock-cred-id" }]) // verifiedAt
        .mockResolvedValueOnce([]) // referral: nessuna redemption
        .mockResolvedValueOnce([]) // welcome claim: già inviato
        .mockResolvedValueOnce([{ id: "biz-789" }]); // operator claim: vinto

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      await verifyAdeCredentials("biz-789");

      await Promise.resolve();
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockNotifyOperator).toHaveBeenCalledWith("user-123");
    });

    // Identity guard: cambiare credenziali verso una P.IVA DIVERSA su un
    // business già onboardato sovrascriverebbe businesses.vatNumber, facendo
    // mostrare la nuova P.IVA su scontrini già emessi sotto la vecchia (storico
    // e PDF leggono live businesses.vatNumber). Va bloccato prima di scrivere.
    it("blocca il cambio credenziali verso una P.IVA diversa su business già onboardato (pivaMismatch)", async () => {
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]); // ownership
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
      ]); // credentials
      // Business snapshot: già onboardato con P.IVA1.
      mockLimit.mockResolvedValueOnce([
        { fiscalCode: "RSSMRA80A01H501U", vatNumber: "12345678901" },
      ]);
      mockLogin.mockResolvedValue({});
      mockLogout.mockResolvedValue(undefined);
      mockGetFiscalData.mockResolvedValue({
        identificativiFiscali: {
          codicePaese: "IT",
          partitaIva: "99999999999", // P.IVA2 diversa
          codiceFiscale: "VRDLGI85M01H501Z",
        },
      });

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.pivaMismatch).toBe(true);
      expect(result.error).toContain("partita IVA diversa");
      expect(result.businessId).toBeUndefined();
      // Nessuna transazione: verifiedAt non impostato, identità non sovrascritta.
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      // Logout comunque chiamato (finally del blocco getFiscalData).
      expect(mockLogout).toHaveBeenCalled();
      const { logger } = await import("@/lib/logger");
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ errorClass: "ade_piva_mismatch" }),
        expect.stringContaining("P.IVA diversa"),
      );
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("consente la riverifica con la stessa P.IVA su business già onboardato (rotazione password)", async () => {
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
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
      mockLimit.mockResolvedValueOnce([
        { fiscalCode: "RSSMRA80A01H501U", vatNumber: "12345678901" },
      ]);
      mockLogin.mockResolvedValue({});
      mockLogout.mockResolvedValue(undefined);
      mockGetFiscalData.mockResolvedValue({
        identificativiFiscali: {
          codicePaese: "IT",
          partitaIva: "12345678901", // stessa P.IVA → consentito
          codiceFiscale: "RSSMRA80A01H501U",
        },
      });

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.error).toBeUndefined();
      expect(result.pivaMismatch).toBeUndefined();
      expect(result.businessId).toBe("biz-789");
      // 3 update core (verifiedAt + businesses + profiles, idempotente) + 2 claim
      // email (welcome/operator): sotto i mock condivisi i claim risolvono a una
      // riga; la soppressione su re-verifica reale è coperta dai test dedicati.
      expect(mockUpdate).toHaveBeenCalledTimes(5);
    });

    // Edge: se getFiscalData fallisce su un business già onboardato non possiamo
    // confermare che la P.IVA combaci → non marcare "verificate" credenziali mai
    // confrontate (chiuderebbe il guard a un bypass). Errore transitorio.
    it("blocca la verifica se getFiscalData fallisce su business già onboardato (identità non confermabile)", async () => {
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
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
      mockLimit.mockResolvedValueOnce([
        { fiscalCode: "RSSMRA80A01H501U", vatNumber: "12345678901" },
      ]);
      mockLogin.mockResolvedValue({});
      mockLogout.mockResolvedValue(undefined);
      mockGetFiscalData.mockRejectedValue(
        new Error("AdE fiscal data unavailable"),
      );

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.error).toContain("Riprova");
      expect(result.pivaMismatch).toBeUndefined();
      expect(result.businessId).toBeUndefined();
      // verifiedAt NON impostato: nessuna transazione.
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockLogout).toHaveBeenCalled();
      const { logger } = await import("@/lib/logger");
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ errorClass: "ade_identity_unconfirmed" }),
        expect.stringContaining("non confermabile"),
      );
    });

    it("usa il codice fiscale come fallback quando la P.IVA registrata è assente (mismatch via CF)", async () => {
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);
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
      // Onboarding parziale: fiscalCode presente ma vatNumber null.
      mockLimit.mockResolvedValueOnce([
        { fiscalCode: "RSSMRA80A01H501U", vatNumber: null },
      ]);
      mockLogin.mockResolvedValue({});
      mockLogout.mockResolvedValue(undefined);
      mockGetFiscalData.mockResolvedValue({
        identificativiFiscali: {
          codicePaese: "IT",
          partitaIva: "12345678901",
          codiceFiscale: "VRDLGI85M01H501Z", // CF diverso → mismatch via fallback
        },
      });

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.pivaMismatch).toBe(true);
      expect(mockUpdate).not.toHaveBeenCalled();
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

      // P1.1: la finalizzazione è una sola transazione che parte dall'UPDATE
      // guardato di verifiedAt, poi businesses, poi profiles. Ordine dei
      // .set(): [0] adeCredentials.verifiedAt (returning 1 riga → lock OK),
      // [1] businesses OK, [2] profiles → unique constraint violation.
      const pgConflictError = Object.assign(new Error("unique constraint"), {
        code: "23505",
      });
      mockUpdateSet
        .mockReturnValueOnce({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "mock-cred-id" }]),
          }),
        }) // adeCredentials verifiedAt (guard)
        .mockReturnValueOnce({ where: vi.fn().mockResolvedValue(undefined) }) // businesses
        .mockReturnValueOnce({
          where: vi.fn().mockRejectedValue(pgConflictError),
        }); // profiles

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.error).toContain("P.IVA");
      // Flag che permette alla UI di offrire il pointer all'assistenza per
      // l'utente legittimo (vecchio account / trial abbandonato).
      expect(result.pivaConflict).toBe(true);
      expect(result.businessId).toBeUndefined();
      // Logout must still be called (getFiscalData finally block)
      expect(mockLogout).toHaveBeenCalled();
      // Tutti e 3 gli UPDATE sono tentati nella stessa transazione (verifiedAt
      // + businesses + profiles); il vincolo unique su profiles fa il rollback
      // dell'intera transazione, verifiedAt incluso.
      expect(mockUpdate).toHaveBeenCalledTimes(3);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("concede il trial e registra la P.IVA nel ledger alla prima verifica", async () => {
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]); // ownership
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
      // businessSnapshot default [{ fiscalCode: null }] → vatNumber undefined →
      // primo claim della P.IVA.
      mockLogin.mockResolvedValue({});
      mockLogout.mockResolvedValue(undefined);
      mockGetFiscalData.mockResolvedValue({
        identificativiFiscali: {
          codicePaese: "IT",
          partitaIva: "12345678901",
          codiceFiscale: "RSSMRA80A01H501U",
        },
      });
      // Default mockLedgerReturning [{ id }] = riga inserita (P.IVA mai vista).

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.error).toBeUndefined();
      expect(result.businessId).toBe("biz-789");
      expect(result.trialAlreadyUsed).toBeUndefined();
      // Inserisce nel ledger con ON CONFLICT DO NOTHING e un HMAC esadecimale.
      expect(mockOnConflictDoNothing).toHaveBeenCalled();
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          pivaHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      );
      // 3 update "core" (verifiedAt + businesses + profiles.partitaIva,
      // nessun azzeramento di trialStartedAt: trial concesso) + 2 update del
      // claim referral (referral_redemptions.rewardedAt +
      // profiles.referralBonusDays) + 2 claim email (welcome/operator) che
      // scattano sempre sotto i mock generici condivisi (returning() risolve
      // sempre a una riga non-vuota).
      expect(mockUpdate).toHaveBeenCalledTimes(7);
      expect(mockUpdateSet).not.toHaveBeenCalledWith({ trialStartedAt: null });
    });

    it("nega il trial e mette in sola lettura se la P.IVA ha già consumato un trial (ledger conflict)", async () => {
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]); // ownership
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
      // Conflict: la P.IVA è già nel ledger da un account precedente (cancellato).
      mockLedgerReturning.mockResolvedValueOnce([]);

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.error).toBeUndefined();
      expect(result.businessId).toBe("biz-789");
      expect(result.trialAlreadyUsed).toBe(true);
      // 4 update "core": verifiedAt + businesses + profiles.partitaIva +
      // profiles.trialStartedAt=null (sola lettura immediata) + 2 claim email
      // (welcome/operator). Il claim referral NON scatta: la P.IVA era già nel
      // ledger → trial negato → niente reward al referrer (il blocco reward è
      // gatato sul trial effettivamente concesso, esce prima via early-return).
      expect(mockUpdate).toHaveBeenCalledTimes(6);
      expect(mockUpdateSet).toHaveBeenCalledWith({ trialStartedAt: null });
      const { logger } = await import("@/lib/logger");
      expect(logger.warn).toHaveBeenCalledWith(
        { businessId: "biz-789" },
        expect.stringContaining("Trial già usato"),
      );
    });

    it("non azzera il trial e non tocca il ledger se lo stesso account ri-verifica la propria P.IVA", async () => {
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]); // ownership
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
      // businessSnapshot: già onboardato con la STESSA P.IVA → wasFirstClaim false.
      mockLimit.mockResolvedValueOnce([
        { fiscalCode: "RSSMRA80A01H501U", vatNumber: "12345678901" },
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

      expect(result.error).toBeUndefined();
      expect(result.trialAlreadyUsed).toBeUndefined();
      // Nessun insert nel ledger e nessun azzeramento di trialStartedAt.
      expect(mockOnConflictDoNothing).not.toHaveBeenCalled();
      // 3 update "core" (verifiedAt + businesses + profiles.partitaIva) + 2
      // claim email (welcome/operator): i claim risolvono a una riga sotto i
      // mock condivisi; la soppressione su re-verifica reale (flag già set) è
      // coperta dai test dedicati di idempotency 0023.
      expect(mockUpdate).toHaveBeenCalledTimes(5);
      expect(mockUpdateSet).not.toHaveBeenCalledWith({ trialStartedAt: null });
    });

    // P1.1 (code review): se le credenziali vengono sostituite mentre AdE
    // login/getFiscalData è in corso, l'UPDATE guardato di verifiedAt matcha 0
    // righe e l'intera transazione viene abbandonata: i dati fiscali della
    // sessione STALE non devono MAI finire su businesses/profiles. Prima del
    // fix solo verifiedAt era guardato, mentre vatNumber/fiscalCode/partitaIva
    // venivano scritti incondizionatamente.
    it("non scrive i dati fiscali su businesses/profiles se le credenziali cambiano durante la verifica (P1.1)", async () => {
      // Ownership check
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
      // Optimistic-lock miss: l'UPDATE guardato di verifiedAt matcha 0 righe.
      mockUpdateReturning.mockReset();
      mockUpdateReturning.mockResolvedValue([]);

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      // Ritorno non fatale con businessId (le nuove credenziali verranno
      // verificate al prossimo tentativo) + warning sulla race.
      expect(result.businessId).toBe("biz-789");
      expect(result.error).toBeUndefined();
      const { logger } = await import("@/lib/logger");
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: "biz-789" }),
        expect.stringContaining("credenziali modificate"),
      );

      // Nessuna scrittura fiscale: l'unico UPDATE è il verifiedAt guardato
      // (poi rollback). businesses/profiles non vengono toccati.
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      const setPayloads = mockUpdateSet.mock.calls.map((c) => c[0]);
      const wroteFiscalIdentity = setPayloads.some(
        (p: Record<string, unknown>) =>
          "vatNumber" in p || "fiscalCode" in p || "partitaIva" in p,
      );
      expect(wroteFiscalIdentity).toBe(false);
      // Lock miss → return anticipato PRIMA dei claim email: nessuna welcome né
      // notifica operatore (idempotency 0023 non viene nemmeno tentata).
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockNotifyOperator).not.toHaveBeenCalled();
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

      // P1.1: l'UPDATE guardato di adeCredentials.verifiedAt è ora il PRIMO
      // statement della transazione di finalizzazione, quindi la prima
      // chiamata a db.update(...).where(...). Render del fragment SQL via il
      // vero PgDialect per osservare i parametri inviati a postgres-js.
      const whereArg = mockUpdateWhere.mock.calls[0]?.[0];
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

  describe("getOnboardingTourSeen", () => {
    it("returns false when the tour was never seen (NULL)", async () => {
      mockLimit.mockResolvedValueOnce([{ seenAt: null }]);

      const { getOnboardingTourSeen } = await import("./onboarding-actions");
      const seen = await getOnboardingTourSeen();

      expect(seen).toBe(false);
      expect(mockSelect).toHaveBeenCalledTimes(1);
    });

    it("returns true when the tour has a timestamp", async () => {
      mockLimit.mockResolvedValueOnce([{ seenAt: new Date() }]);

      const { getOnboardingTourSeen } = await import("./onboarding-actions");
      const seen = await getOnboardingTourSeen();

      expect(seen).toBe(true);
    });

    it("returns false when no profile row is found", async () => {
      mockLimit.mockResolvedValueOnce([]);

      const { getOnboardingTourSeen } = await import("./onboarding-actions");
      const seen = await getOnboardingTourSeen();

      expect(seen).toBe(false);
    });

    it("degrades to true (don't show tour) on a DB failure", async () => {
      mockLimit.mockRejectedValueOnce(new Error("db down"));

      const { getOnboardingTourSeen } = await import("./onboarding-actions");
      const seen = await getOnboardingTourSeen();

      // Fail-safe: non far esplodere l'error boundary del dashboard per una
      // feature cosmetica (regola 19).
      expect(seen).toBe(true);
    });
  });

  describe("markOnboardingTourSeen", () => {
    it("degrada a 'Non autenticato.' quando la sessione è scaduta (no throw)", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { markOnboardingTourSeen } = await import("./onboarding-actions");
      const result = await markOnboardingTourSeen();
      expect(result.error).toBe("Non autenticato.");
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("updates the profile and returns no error on success", async () => {
      const { markOnboardingTourSeen } = await import("./onboarding-actions");
      const result = await markOnboardingTourSeen();

      expect(result).toEqual({});
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ onboardingTourSeenAt: expect.any(Date) }),
      );
    });

    it("degrades to { error } without throwing on a DB failure", async () => {
      mockUpdateWhere.mockImplementationOnce(() => {
        throw new Error("db down");
      });

      const { markOnboardingTourSeen } = await import("./onboarding-actions");
      const result = await markOnboardingTourSeen();

      expect(result.error).toBeTruthy();
    });
  });

  describe("changeAdePassword", () => {
    it("degrada a 'Non autenticato.' quando la sessione è scaduta (no throw)", async () => {
      // Sessione assente → degrada prima di ownership/rate-limit/AdE (regola 19/20).
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { changeAdePassword } = await import("./onboarding-actions");
      const result = await changeAdePassword(
        "biz-789",
        "OldPass1!",
        "NewPass1!",
        "NewPass1!",
      );
      expect(result.error).toBe("Non autenticato.");
    });
  });
});
