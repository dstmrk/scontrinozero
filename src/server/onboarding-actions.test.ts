// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

// Drizzle query mock chain
const mockLimit = vi.fn();
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
const mockReturning = vi.fn();
const mockInsertValues = vi.fn().mockReturnValue({ returning: mockReturning });
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
const mockUpdateSet = vi.fn().mockReturnValue({ where: vi.fn() });
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
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
    mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } });
    process.env.ENCRYPTION_KEY = "a".repeat(64);
    process.env.ENCRYPTION_KEY_VERSION = "1";
    process.env.ADE_MODE = "mock";
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
  });

  describe("saveAdeCredentials", () => {
    it("encrypts and saves credentials", async () => {
      // Ownership check: profile found
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      // Ownership check: business belongs to profile
      mockLimit.mockResolvedValueOnce([FAKE_BUSINESS]);
      // No existing credentials
      mockLimit.mockResolvedValueOnce([]);

      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "biz-789",
          codiceFiscale: "RSSMRA80A01H501U",
          password: "securepass",
          pin: "123456",
        }),
      );

      expect(result.businessId).toBe("biz-789");
      expect(result.error).toBeUndefined();
      expect(mockEncrypt).toHaveBeenCalledTimes(3);
      expect(mockInsert).toHaveBeenCalled();
    });

    it("returns error for missing businessId", async () => {
      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "",
          codiceFiscale: "RSSMRA80A01H501U",
          password: "pass",
          pin: "123456",
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
          pin: "123456",
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
          pin: "123456",
        }),
      );
      expect(result.error).toContain("Codice fiscale");
    });

    it("returns error for short PIN", async () => {
      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "biz-789",
          codiceFiscale: "RSSMRA80A01H501U",
          password: "pass",
          pin: "12",
        }),
      );
      expect(result.error).toContain("PIN");
    });

    it("updates existing credentials and resets verification", async () => {
      // Ownership check: profile found
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      // Ownership check: business belongs to profile
      mockLimit.mockResolvedValueOnce([FAKE_BUSINESS]);
      // Existing credentials found
      mockLimit.mockResolvedValueOnce([
        { id: "cred-123", businessId: "biz-789" },
      ]);

      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "biz-789",
          codiceFiscale: "RSSMRA80A01H501U",
          password: "newpass",
          pin: "654321",
        }),
      );

      expect(result.businessId).toBe("biz-789");
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("returns error when business does not belong to the user (IDOR)", async () => {
      // Ownership check: profile found
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      // Ownership check: business NOT found for this profile
      mockLimit.mockResolvedValueOnce([]);

      const { saveAdeCredentials } = await import("./onboarding-actions");
      const result = await saveAdeCredentials(
        formData({
          businessId: "other-user-biz",
          codiceFiscale: "RSSMRA80A01H501U",
          password: "pass",
          pin: "123456",
        }),
      );

      expect(result.error).toContain("non autorizzato");
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe("verifyAdeCredentials", () => {
    it("verifies credentials successfully and fetches fiscal data", async () => {
      // Ownership check: profile found
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      // Ownership check: business belongs to profile
      mockLimit.mockResolvedValueOnce([FAKE_BUSINESS]);
      // Credentials found
      mockLimit.mockResolvedValueOnce([
        {
          businessId: "biz-789",
          encryptedCodiceFiscale: "enc-cf",
          encryptedPassword: "enc-pw",
          encryptedPin: "enc-pin",
          keyVersion: 1,
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
      expect(mockUpdate).toHaveBeenCalledTimes(2); // businesses vatNumber/fiscalCode + adeCredentials verifiedAt
    });

    it("marks credentials as verified even when getFiscalData fails", async () => {
      // Ownership check: profile found
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      // Ownership check: business belongs to profile
      mockLimit.mockResolvedValueOnce([FAKE_BUSINESS]);
      // Credentials found
      mockLimit.mockResolvedValueOnce([
        {
          businessId: "biz-789",
          encryptedCodiceFiscale: "enc-cf",
          encryptedPassword: "enc-pw",
          encryptedPin: "enc-pin",
          keyVersion: 1,
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
    });

    it("returns error when credentials not found", async () => {
      // Ownership check: profile found
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      // Ownership check: business belongs to profile
      mockLimit.mockResolvedValueOnce([FAKE_BUSINESS]);
      // No credentials
      mockLimit.mockResolvedValueOnce([]);

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.error).toContain("Credenziali non trovate");
    });

    it("returns error when AdE login fails", async () => {
      // Ownership check: profile found
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      // Ownership check: business belongs to profile
      mockLimit.mockResolvedValueOnce([FAKE_BUSINESS]);
      // Credentials found
      mockLimit.mockResolvedValueOnce([
        {
          businessId: "biz-789",
          encryptedCodiceFiscale: "enc-cf",
          encryptedPassword: "enc-pw",
          encryptedPin: "enc-pin",
          keyVersion: 1,
        },
      ]);
      mockLogin.mockRejectedValue(new Error("Invalid credentials"));

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("biz-789");

      expect(result.error).toContain("Verifica fallita");
    });

    it("returns error when business does not belong to the user (IDOR)", async () => {
      // Ownership check: profile found
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      // Ownership check: business NOT found for this profile
      mockLimit.mockResolvedValueOnce([]);

      const { verifyAdeCredentials } = await import("./onboarding-actions");
      const result = await verifyAdeCredentials("other-user-biz");

      expect(result.error).toContain("non autorizzato");
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  describe("getOnboardingStatus", () => {
    it("returns all false when no profile", async () => {
      mockLimit.mockResolvedValueOnce([]); // No profile

      const { getOnboardingStatus } = await import("./onboarding-actions");
      const status = await getOnboardingStatus();

      expect(status).toEqual({
        hasProfile: false,
        hasBusiness: false,
        hasCredentials: false,
        credentialsVerified: false,
      });
    });

    it("returns hasBusiness false when profile exists but no business", async () => {
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]); // Profile found
      mockLimit.mockResolvedValueOnce([]); // No business

      const { getOnboardingStatus } = await import("./onboarding-actions");
      const status = await getOnboardingStatus();

      expect(status.hasProfile).toBe(true);
      expect(status.hasBusiness).toBe(false);
    });

    it("returns complete status when all steps done", async () => {
      mockLimit.mockResolvedValueOnce([FAKE_PROFILE]);
      mockLimit.mockResolvedValueOnce([FAKE_BUSINESS]);
      mockLimit.mockResolvedValueOnce([
        { businessId: "biz-789", verifiedAt: new Date() },
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
    });
  });
});
