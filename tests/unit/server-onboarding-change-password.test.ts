// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks ---

const {
  mockGetAuthenticatedUser,
  mockCheckBusinessOwnership,
  mockRateLimiterCheck,
  mockGetDb,
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
  mockUpdate,
  mockSet,
  mockUpdateWhere,
  mockGetEncryptionKey,
  mockDecrypt,
  mockEncrypt,
  mockCreateAdeClient,
  mockAdeLogin,
  mockAdeChangePassword,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockCheckBusinessOwnership: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
  mockGetDb: vi.fn(),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockGetEncryptionKey: vi.fn(),
  mockDecrypt: vi.fn(),
  mockEncrypt: vi.fn(),
  mockCreateAdeClient: vi.fn(),
  mockAdeLogin: vi.fn(),
  mockAdeChangePassword: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
  checkBusinessOwnership: mockCheckBusinessOwnership,
}));

vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
}));

vi.mock("@/db", () => ({ getDb: mockGetDb }));
vi.mock("@/db/schema", () => ({
  adeCredentials: "ade_credentials",
  businesses: "businesses",
  profiles: "profiles",
}));

vi.mock("@/lib/crypto", () => ({
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
  getEncryptionKey: mockGetEncryptionKey,
  getKeyVersion: vi.fn().mockReturnValue(1),
}));

vi.mock("@/lib/ade", () => ({
  createAdeClient: mockCreateAdeClient,
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

vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/emails/welcome", () => ({ WelcomeEmail: vi.fn() }));
vi.mock("react", () => ({ createElement: vi.fn() }));
vi.mock("@/lib/validation", () => ({ adePinSchema: { parse: vi.fn() } }));

// --- Helpers ---

const USER_ID = "user-test";
const BIZ_ID = "biz-test";

const FAKE_CRED = {
  businessId: BIZ_ID,
  encryptedCodiceFiscale: "enc-cf",
  encryptedPassword: "enc-pw",
  encryptedPin: "enc-pin",
  keyVersion: 1,
  verifiedAt: null,
};

const FAKE_KEY = Buffer.from("a".repeat(64), "hex");

function setupDb(credRow: object | null = FAKE_CRED) {
  mockLimit.mockResolvedValue(credRow ? [credRow] : []);
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });

  mockUpdateWhere.mockResolvedValue([]);
  mockSet.mockReturnValue({ where: mockUpdateWhere });
  mockUpdate.mockReturnValue({ set: mockSet });

  mockGetDb.mockReturnValue({
    select: mockSelect,
    update: mockUpdate,
  });
}

// --- Tests: changeAdePassword ---

describe("changeAdePassword", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue({ id: USER_ID });
    mockCheckBusinessOwnership.mockResolvedValue(null);
    mockRateLimiterCheck.mockReturnValue({ success: true });
    mockGetEncryptionKey.mockReturnValue(FAKE_KEY);
    mockDecrypt.mockReturnValue("CODICEFISCALE12");
    mockEncrypt.mockReturnValue("new-enc-pw");
    mockAdeChangePassword.mockResolvedValue(undefined);
    mockCreateAdeClient.mockReturnValue({
      changePasswordFisconline: mockAdeChangePassword,
    });
    setupDb();
  });

  it("rifiuta quando la nuova password non rispetta il charset/lunghezza", async () => {
    const { changeAdePassword } = await import("@/server/onboarding-actions");
    const result = await changeAdePassword(
      BIZ_ID,
      "OldPass1",
      "àccented",
      "àccented",
    );
    expect(result.error).toMatch(/Password non valida/);
  });

  it("rifiuta quando la nuova password è troppo corta (< 8 caratteri)", async () => {
    const { changeAdePassword } = await import("@/server/onboarding-actions");
    const result = await changeAdePassword(
      BIZ_ID,
      "OldPass1",
      "Short1",
      "Short1",
    );
    expect(result.error).toMatch(/Password non valida/);
  });

  it("rifiuta quando la nuova password è troppo lunga (> 15 caratteri)", async () => {
    const { changeAdePassword } = await import("@/server/onboarding-actions");
    const result = await changeAdePassword(
      BIZ_ID,
      "OldPass1",
      "ThisIsWayTooLong1",
      "ThisIsWayTooLong1",
    );
    expect(result.error).toMatch(/Password non valida/);
  });

  it("rifiuta quando nuova != conferma", async () => {
    const { changeAdePassword } = await import("@/server/onboarding-actions");
    const result = await changeAdePassword(
      BIZ_ID,
      "OldPass1",
      "NewPass12",
      "NewPass99",
    );
    expect(result.error).toMatch(/non coincidono/);
  });

  it("rifiuta quando nuova == attuale", async () => {
    const { changeAdePassword } = await import("@/server/onboarding-actions");
    const result = await changeAdePassword(
      BIZ_ID,
      "SamePass1",
      "SamePass1",
      "SamePass1",
    );
    expect(result.error).toMatch(/diversa da quella attuale/);
  });

  it("rifiuta se il rate limit è superato", async () => {
    mockRateLimiterCheck.mockReturnValue({ success: false, remaining: 0 });
    const { changeAdePassword } = await import("@/server/onboarding-actions");
    const result = await changeAdePassword(
      BIZ_ID,
      "OldPass1",
      "NewPass12",
      "NewPass12",
    );
    expect(result.error).toMatch(/Troppi tentativi/);
  });

  it("restituisce errore se le credenziali non sono trovate nel DB", async () => {
    setupDb(null);
    const { changeAdePassword } = await import("@/server/onboarding-actions");
    const result = await changeAdePassword(
      BIZ_ID,
      "OldPass1",
      "NewPass12",
      "NewPass12",
    );
    expect(result.error).toMatch(/Credenziali non trovate/);
  });

  it("restituisce errore 'Password attuale non corretta' quando AdE lancia AdeAuthError", async () => {
    const { AdeAuthError } = await import("@/lib/ade/errors");
    mockAdeChangePassword.mockRejectedValue(new AdeAuthError());
    const { changeAdePassword } = await import("@/server/onboarding-actions");
    const result = await changeAdePassword(
      BIZ_ID,
      "OldPass1",
      "NewPass12",
      "NewPass12",
    );
    expect(result.error).toMatch(/Password attuale non corretta/);
  });

  it("restituisce errore 'diversa da quella attuale' quando AdE lancia ADE_CHANGE_PW_SAME", async () => {
    const { AdeError } = await import("@/lib/ade/errors");
    mockAdeChangePassword.mockRejectedValue(
      new AdeError("ADE_CHANGE_PW_SAME", "Same password"),
    );
    const { changeAdePassword } = await import("@/server/onboarding-actions");
    const result = await changeAdePassword(
      BIZ_ID,
      "OldPass1",
      "NewPass12",
      "NewPass12",
    );
    expect(result.error).toMatch(/diversa da quella attuale/);
  });

  it("restituisce errore generico quando AdE lancia un errore non classificato", async () => {
    mockAdeChangePassword.mockRejectedValue(new Error("Network error"));
    const { changeAdePassword } = await import("@/server/onboarding-actions");
    const result = await changeAdePassword(
      BIZ_ID,
      "OldPass1",
      "NewPass12",
      "NewPass12",
    );
    expect(result.error).toMatch(/Riprova più tardi/);
  });

  it("aggiorna la password cifrata e verifiedAt in caso di successo", async () => {
    const { changeAdePassword } = await import("@/server/onboarding-actions");
    const result = await changeAdePassword(
      BIZ_ID,
      "OldPass1",
      "NewPass12",
      "NewPass12",
    );
    expect(result.error).toBeUndefined();
    expect(result.businessId).toBe(BIZ_ID);
    expect(mockEncrypt).toHaveBeenCalledWith(
      "NewPass12",
      FAKE_KEY,
      FAKE_CRED.keyVersion,
    );
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedPassword: "new-enc-pw" }),
    );
  });
});

// --- Tests: verifyAdeCredentials — password scaduta ---

describe("verifyAdeCredentials — AdePasswordExpiredError", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetAuthenticatedUser.mockResolvedValue({ id: USER_ID });
    mockCheckBusinessOwnership.mockResolvedValue(null);
    mockGetEncryptionKey.mockReturnValue(FAKE_KEY);
    mockDecrypt.mockReturnValue("decoded");
    mockAdeLogin.mockResolvedValue({});
    mockCreateAdeClient.mockReturnValue({
      login: mockAdeLogin,
      getFiscalData: vi.fn().mockResolvedValue({
        identificativiFiscali: {
          partitaIva: "12345678901",
          codiceFiscale: "CF",
        },
      }),
      logout: vi.fn().mockResolvedValue(undefined),
    });
    setupDb();
  });

  it("restituisce passwordExpired: true quando AdE lancia AdePasswordExpiredError", async () => {
    const { AdePasswordExpiredError } = await import("@/lib/ade/errors");
    mockAdeLogin.mockRejectedValue(new AdePasswordExpiredError());
    const { verifyAdeCredentials } =
      await import("@/server/onboarding-actions");
    const result = await verifyAdeCredentials(BIZ_ID);
    expect(result.passwordExpired).toBe(true);
    expect(result.error).toMatch(/scaduta/i);
  });

  it("NON restituisce passwordExpired per un errore generico di credenziali", async () => {
    const { AdeAuthError } = await import("@/lib/ade/errors");
    mockAdeLogin.mockRejectedValue(new AdeAuthError());
    const { verifyAdeCredentials } =
      await import("@/server/onboarding-actions");
    const result = await verifyAdeCredentials(BIZ_ID);
    expect(result.passwordExpired).toBeUndefined();
    expect(result.error).toMatch(/Verifica fallita/);
  });
});
