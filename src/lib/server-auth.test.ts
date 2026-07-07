// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthenticatedError } from "./auth-errors";

// --- Mocks ---

// `getAuthenticatedUser` è wrappata in React `cache()` (dedup del round-trip
// Supabase Auth nel render RSC, REVIEW.md #2). Fuori dal render `cache()` è
// passthrough; mockarlo esplicitamente come tale rende i test deterministici e
// indipendenti dagli internals di React.
vi.mock("react", async (importActual) => {
  const actual = await importActual<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T): T => fn };
});

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

const mockLimit = vi.fn();
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({ select: mockSelect }),
}));

vi.mock("@/db/schema", () => ({
  adeCredentials: "ade-credentials-table",
  businesses: "businesses-table",
  profiles: "profiles-table",
}));

const mockDecrypt = vi.fn().mockReturnValue("decrypted-value");
vi.mock("@/lib/crypto", () => ({
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
  getEncryptionKey: () => Buffer.alloc(32),
}));

const mockBuildCedenteFromBusiness = vi
  .fn()
  .mockReturnValue({ built: "cedente" });
vi.mock("@/lib/ade/mapper", () => ({
  buildCedenteFromBusiness: (...args: unknown[]) =>
    mockBuildCedenteFromBusiness(...args),
}));

const mockLoggerWarn = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: {
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const mockSentrySetUser = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  setUser: (...args: unknown[]) => mockSentrySetUser(...args),
}));

// --- Helpers ---

const FAKE_USER = { id: "user-123", email: "test@example.com" };
const FAKE_BUSINESS = { id: "biz-789", profileId: "profile-456" };
const FAKE_CRED = {
  businessId: "biz-789",
  encryptedCodiceFiscale: "enc-cf",
  encryptedPassword: "enc-pw",
  encryptedPin: "enc-pin",
  keyVersion: 1,
  verifiedAt: new Date(),
};

// --- Tests ---

describe("server-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAuthenticatedUser", () => {
    it("returns the authenticated user", async () => {
      mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } });

      const { getAuthenticatedUser } = await import("./server-auth");
      const user = await getAuthenticatedUser();

      expect(user).toEqual(FAKE_USER);
    });

    it("throws UnauthenticatedError when user is not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const { getAuthenticatedUser } = await import("./server-auth");

      await expect(getAuthenticatedUser()).rejects.toThrow("Not authenticated");
      await expect(getAuthenticatedUser()).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
    });

    it("logs structured warn and throws when getUser rejects (stale refresh token)", async () => {
      // @supabase/ssr throws an AuthApiError when the stored refresh token is
      // missing/expired/revoked. It must NOT bubble up as a raw stack trace.
      const authError = Object.assign(
        new Error("Invalid Refresh Token: Refresh Token Not Found"),
        { __isAuthError: true, status: 400, code: "refresh_token_not_found" },
      );
      mockGetUser.mockRejectedValue(authError);

      const { getAuthenticatedUser } = await import("./server-auth");

      await expect(getAuthenticatedUser()).rejects.toThrow("Not authenticated");
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "getAuthenticatedUser",
          errorClass: "refresh_token_not_found",
        }),
        expect.any(String),
      );
    });

    it("falls back to a generic errorClass when the rejection has no code", async () => {
      mockGetUser.mockRejectedValue(new Error("network down"));

      const { getAuthenticatedUser } = await import("./server-auth");

      await expect(getAuthenticatedUser()).rejects.toThrow("Not authenticated");
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "getAuthenticatedUser",
          errorClass: "auth_error",
        }),
        expect.any(String),
      );
    });

    it("R22: binds the authenticated user id to Sentry scope (Users Impacted)", async () => {
      // Senza setUser ogni issue Sentry mostrava 'Users Impacted: 0' anche
      // quando l'incidente toccava decine di utenti — il triage non poteva
      // prioritizzare per impatto. Regola 22 di CLAUDE.md.
      mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } });

      const { getAuthenticatedUser } = await import("./server-auth");
      await getAuthenticatedUser();

      expect(mockSentrySetUser).toHaveBeenCalledWith({ id: FAKE_USER.id });
    });

    it("R22: does NOT pass email or other PII to Sentry (only id)", async () => {
      // L'UUID di Supabase Auth e' identificativo opaco (non PII diretta).
      // Email/nome/ip restano fuori dallo scope Sentry per coerenza con il
      // SAFE_KEYS denylist di logger.ts.
      mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } });

      const { getAuthenticatedUser } = await import("./server-auth");
      await getAuthenticatedUser();

      const callArg = mockSentrySetUser.mock.calls[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(callArg).toBeDefined();
      expect(callArg).not.toHaveProperty("email");
      expect(callArg).not.toHaveProperty("username");
      expect(callArg).not.toHaveProperty("ip_address");
      expect(Object.keys(callArg ?? {})).toEqual(["id"]);
    });

    it("R22: does NOT call Sentry.setUser when user is null (no leak)", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const { getAuthenticatedUser } = await import("./server-auth");
      await expect(getAuthenticatedUser()).rejects.toThrow("Not authenticated");

      expect(mockSentrySetUser).not.toHaveBeenCalled();
    });

    it("R22: does NOT call Sentry.setUser when getUser rejects", async () => {
      mockGetUser.mockRejectedValue(new Error("network down"));

      const { getAuthenticatedUser } = await import("./server-auth");
      await expect(getAuthenticatedUser()).rejects.toThrow("Not authenticated");

      expect(mockSentrySetUser).not.toHaveBeenCalled();
    });

    it("is wrapped in React cache() to dedupe the auth round-trip (REVIEW.md #2)", async () => {
      // La dedup per-render evita 3 chiamate a supabase.auth.getUser() nel
      // render di /dashboard (page + getOnboardingStatus + getCatalogItems).
      // `cache` è mockato come passthrough sopra, quindi qui verifichiamo solo
      // che l'export sia una funzione invocabile (il wrap non rompe l'API).
      const { getAuthenticatedUser } = await import("./server-auth");
      expect(typeof getAuthenticatedUser).toBe("function");
    });
  });

  describe("checkBusinessOwnership", () => {
    it("returns null when business belongs to the user", async () => {
      mockLimit.mockResolvedValueOnce([{ id: FAKE_BUSINESS.id }]);

      const { checkBusinessOwnership } = await import("./server-auth");
      const result = await checkBusinessOwnership("user-123", "biz-789");

      expect(result).toBeNull();
    });

    it("returns error when business is not found or not authorized", async () => {
      mockLimit.mockResolvedValueOnce([]);

      const { checkBusinessOwnership } = await import("./server-auth");
      const result = await checkBusinessOwnership("user-123", "other-biz");

      expect(result).toEqual({
        error: "Business non trovato o non autorizzato.",
      });
    });
  });

  describe("fetchAdePrerequisites", () => {
    it("returns decrypted credentials and cedentePrestatore on success", async () => {
      mockLimit.mockResolvedValueOnce([
        { cred: FAKE_CRED, business: FAKE_BUSINESS },
      ]);

      const { fetchAdePrerequisites } = await import("./server-auth");
      const result = await fetchAdePrerequisites("biz-789");

      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.method).toBe("fisconline");
      if (result.method !== "fisconline") return;
      expect(result.codiceFiscale).toBe("decrypted-value");
      expect(result.password).toBe("decrypted-value");
      expect(result.pin).toBe("decrypted-value");
      expect(result.cedentePrestatore).toEqual({ built: "cedente" });
      expect(mockBuildCedenteFromBusiness).toHaveBeenCalledWith(FAKE_BUSINESS);
    });

    it("returns error when credentials are not found", async () => {
      mockLimit.mockResolvedValueOnce([]);

      const { fetchAdePrerequisites } = await import("./server-auth");
      const result = await fetchAdePrerequisites("biz-789");

      expect(result).toEqual({
        error: "Credenziali AdE non trovate. Completa la configurazione.",
      });
      expect(mockBuildCedenteFromBusiness).not.toHaveBeenCalled();
    });

    it("returns error when credentials are not verified", async () => {
      mockLimit.mockResolvedValueOnce([
        { cred: { ...FAKE_CRED, verifiedAt: null }, business: FAKE_BUSINESS },
      ]);

      const { fetchAdePrerequisites } = await import("./server-auth");
      const result = await fetchAdePrerequisites("biz-789");

      expect(result).toEqual({
        error:
          "Credenziali AdE non verificate. Verifica le credenziali nelle impostazioni.",
      });
      expect(mockBuildCedenteFromBusiness).not.toHaveBeenCalled();
    });
  });
});
