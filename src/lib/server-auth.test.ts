// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthenticatedError } from "./auth-errors";

// --- Mocks ---

// `getAuthenticatedUser` è wrappata in React `cache()` (dedup del round-trip
// Supabase Auth nel render RSC, PR #606). Fuori dal render `cache()` è
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
const mockFrom = vi
  .fn()
  .mockReturnValue({ innerJoin: mockInnerJoin, where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

// Touch di `last_seen_at` (GDPR pruning, REVIEW audit 2026-07-07): raw SQL
// via db.execute (no builder → niente bump di updated_at, now() server-side).
const mockExecute = vi.fn().mockResolvedValue(undefined);

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({ select: mockSelect, execute: mockExecute }),
}));

vi.mock("@/db/schema", () => ({
  adeCredentials: "ade-credentials-table",
  businesses: "businesses-table",
  businessMembers: {
    id: "id",
    role: "role",
    authUserId: "auth_user_id",
    businessId: "business_id",
  },
  profiles: { authUserId: "auth_user_id", lastSeenAt: "last_seen_at" },
}));

const mockDecrypt = vi.fn().mockReturnValue("decrypted-value");
vi.mock("@/lib/crypto", () => ({
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
  getEncryptionKey: () => Buffer.alloc(32),
  getEncryptionKeys: () => new Map([[1, Buffer.alloc(32)]]),
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
  updatedAt: new Date("2026-10-01T08:00:00.123Z"),
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
        Record<string, unknown> | undefined;
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

    it("tocca last_seen_at (fire-and-forget) dopo autenticazione riuscita", async () => {
      // Segnale di attività per il GDPR pruning: last_sign_in_at di Supabase
      // NON si aggiorna sul refresh token, quindi un utente PWA con sessione
      // persistente che usa l'app in sola lettura risulterebbe inattivo.
      // Il touch (throttled, scrittura condizionale) registra la visita.
      mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } });

      const { getAuthenticatedUser } = await import("./server-auth");
      await getAuthenticatedUser();
      // Flush del microtask del touch fire-and-forget.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockExecute).toHaveBeenCalledTimes(1);
      const sqlText = JSON.stringify(mockExecute.mock.calls[0]?.[0]);
      // Scrittura condizionale: colonna touched + throttle 24h nel WHERE.
      expect(sqlText).toContain("last_seen_at");
      expect(sqlText).toContain("interval '24 hours'");
    });

    // Issue #1099: il collaboratore non ha un profilo, il suo ultimo accesso
    // sta su `business_members`. Un solo statement per entrambe le tabelle:
    // il touch gira a ogni richiesta e non deve diventare due round trip.
    it("tocca anche l'ultimo accesso del collaboratore, nella stessa query", async () => {
      mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } });

      const { getAuthenticatedUser } = await import("./server-auth");
      await getAuthenticatedUser();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockExecute).toHaveBeenCalledTimes(1);
      const sqlText = JSON.stringify(mockExecute.mock.calls[0]?.[0]);
      expect(sqlText).toContain("UPDATE profiles");
      expect(sqlText).toContain("UPDATE business_members");
      expect(sqlText).toContain("role = 'collaborator'");
    });

    it("un fallimento del touch non fa fallire getAuthenticatedUser (warn, no throw)", async () => {
      mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } });
      mockExecute.mockRejectedValueOnce(new Error("DB down"));

      const { getAuthenticatedUser } = await import("./server-auth");
      const user = await getAuthenticatedUser();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(user).toEqual(FAKE_USER);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({ action: "touchLastSeen" }),
        expect.any(String),
      );
    });

    it("NON tocca last_seen_at quando l'utente non è autenticato", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const { getAuthenticatedUser } = await import("./server-auth");
      await expect(getAuthenticatedUser()).rejects.toThrow("Not authenticated");
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockExecute).not.toHaveBeenCalled();
    });

    it("is wrapped in React cache() to dedupe the auth round-trip (PR #606)", async () => {
      // La dedup per-render evita 3 chiamate a supabase.auth.getUser() nel
      // render di /dashboard (page + getOnboardingStatus + getCatalogItems).
      // `cache` è mockato come passthrough sopra, quindi qui verifichiamo solo
      // che l'export sia una funzione invocabile (il wrap non rompe l'API).
      const { getAuthenticatedUser } = await import("./server-auth");
      expect(typeof getAuthenticatedUser).toBe("function");
    });
  });

  // Issue #1099: l'accesso a un'attività passa dall'appartenenza, non dalla
  // proprietà del profilo. Oggi i membri sono solo titolari, quindi per chi
  // usa l'app non cambia nulla; l'id del membro serve a firmare i documenti.
  describe("checkBusinessMembership", () => {
    it("restituisce il membro e il ruolo quando l'utente appartiene all'attività", async () => {
      mockLimit.mockResolvedValueOnce([
        { memberId: "member-1", role: "owner" },
      ]);

      const { checkBusinessMembership } = await import("./server-auth");
      const result = await checkBusinessMembership("user-123", "biz-789");

      expect(result).toEqual({ memberId: "member-1", role: "owner" });
    });

    it("rifiuta chi non appartiene all'attività, con lo stesso messaggio di prima", async () => {
      mockLimit.mockResolvedValueOnce([]);

      const { checkBusinessMembership } = await import("./server-auth");
      const result = await checkBusinessMembership("user-123", "other-biz");

      expect(result).toEqual({
        error: "Business non trovato o non autorizzato.",
      });
    });

    it("legge solo business_members, con una query sola", async () => {
      mockLimit.mockResolvedValueOnce([
        { memberId: "member-1", role: "owner" },
      ]);

      const { checkBusinessMembership } = await import("./server-auth");
      await checkBusinessMembership("user-123", "biz-789");

      expect(mockSelect).toHaveBeenCalledTimes(1);
      expect(mockInnerJoin).not.toHaveBeenCalled();
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

    // Issue #1099: è la versione con cui un rifiuto dell'AdE viene registrato
    // senza invalidare credenziali risalvate nel frattempo.
    it("espone updated_at della riga come versione delle credenziali", async () => {
      mockLimit.mockResolvedValueOnce([
        { cred: FAKE_CRED, business: FAKE_BUSINESS },
      ]);

      const { fetchAdePrerequisites } = await import("./server-auth");
      const result = await fetchAdePrerequisites("biz-789");

      expect(result).toMatchObject({ credentialVersion: FAKE_CRED.updatedAt });
    });

    // Regressione v1.8.4 (HAR.md #18): senza questo campo l'emissione apriva
    // un login senza scelta dell'utenza di lavoro e il portale la rifiutava,
    // pur avendola l'esercente già scelta in onboarding.
    it("carries the chosen utenza di lavoro when the row has one", async () => {
      mockLimit.mockResolvedValueOnce([
        {
          cred: { ...FAKE_CRED, utenzaPiva: "07790350966" },
          business: FAKE_BUSINESS,
        },
      ]);

      const { fetchAdePrerequisites } = await import("./server-auth");
      const result = await fetchAdePrerequisites("biz-789");

      expect(result).toMatchObject({
        method: "fisconline",
        utenzaPiva: "07790350966",
      });
    });

    it("leaves the utenza undefined when the row has none (caso storico)", async () => {
      mockLimit.mockResolvedValueOnce([
        { cred: { ...FAKE_CRED, utenzaPiva: null }, business: FAKE_BUSINESS },
      ]);

      const { fetchAdePrerequisites } = await import("./server-auth");
      const result = await fetchAdePrerequisites("biz-789");

      expect("error" in result).toBe(false);
      if ("error" in result || result.method !== "fisconline") return;
      expect(result.utenzaPiva).toBeUndefined();
    });

    it.each(["cie", "spid"] as const)(
      "una riga %s non porta credenziali: la sessione è nello store",
      async (loginMethod) => {
        mockLimit.mockResolvedValueOnce([
          { cred: { ...FAKE_CRED, loginMethod }, business: FAKE_BUSINESS },
        ]);

        const { fetchAdePrerequisites } = await import("./server-auth");
        const result = await fetchAdePrerequisites("biz-789");

        expect(result).toEqual({
          method: loginMethod,
          cedentePrestatore: { built: "cedente" },
        });
      },
    );

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

    // Issue #1099: dopo lo stop dei login per password scaduta, ogni chiamata
    // successiva deve portare lo stesso codice della prima. `409
    // ADE_PASSWORD_EXPIRED` è contratto pubblico (DEVELOPER.md): degradarlo a
    // "non verificate" lo farebbe diventare `422 ADE_REJECTED`.
    it("con la password scaduta registrata risponde col codice del login che l'ha scoperta", async () => {
      mockLimit.mockResolvedValueOnce([
        {
          cred: {
            ...FAKE_CRED,
            verifiedAt: null,
            lastVerifyOutcome: "password_expired",
            lastVerifyAt: new Date("2026-10-01T09:00:00.000Z"),
          },
          business: FAKE_BUSINESS,
        },
      ]);

      const { fetchAdePrerequisites } = await import("./server-auth");
      const result = await fetchAdePrerequisites("biz-789");

      expect(result).toEqual({
        error: "La password Fisconline è scaduta.",
        code: "ADE_PASSWORD_EXPIRED",
        passwordExpired: true,
      });
    });

    // Il salvataggio non azzera `last_verify_outcome`: dopo che il titolare ha
    // inserito la password nuova, l'esito vecchio non descrive più le
    // credenziali salvate e "password scaduta" sarebbe falso.
    it.each([
      ["risalvate dopo l'esito", new Date("2026-10-01T07:00:00.000Z")],
      ["senza data dell'esito", null],
    ])(
      "una password scaduta registrata su credenziali %s non vale più",
      async (_label, lastVerifyAt) => {
        mockLimit.mockResolvedValueOnce([
          {
            cred: {
              ...FAKE_CRED,
              verifiedAt: null,
              lastVerifyOutcome: "password_expired",
              lastVerifyAt,
            },
            business: FAKE_BUSINESS,
          },
        ]);

        const { fetchAdePrerequisites } = await import("./server-auth");
        const result = await fetchAdePrerequisites("biz-789");

        expect(result).toEqual({
          error:
            "Credenziali AdE non verificate. Verifica le credenziali nelle impostazioni.",
        });
      },
    );

    it.each(["auth_error", "account_locked", "success", null])(
      "con esito %s e credenziali non verificate resta il messaggio generico",
      async (lastVerifyOutcome) => {
        mockLimit.mockResolvedValueOnce([
          {
            cred: { ...FAKE_CRED, verifiedAt: null, lastVerifyOutcome },
            business: FAKE_BUSINESS,
          },
        ]);

        const { fetchAdePrerequisites } = await import("./server-auth");
        const result = await fetchAdePrerequisites("biz-789");

        expect(result).toEqual({
          error:
            "Credenziali AdE non verificate. Verifica le credenziali nelle impostazioni.",
        });
      },
    );
  });

  describe("toAdeSessionParams", () => {
    const CEDENTE = { built: "cedente" } as never;
    const CREDENTIAL_VERSION = new Date("2026-10-01T08:00:00.123Z");

    it("maps fisconline prerequisites to session params with credentials", async () => {
      const { toAdeSessionParams } = await import("./server-auth");

      const params = toAdeSessionParams("biz-789", {
        method: "fisconline",
        codiceFiscale: "RSSMRA80A01H501U",
        password: "secret-pw",
        pin: "12345678",
        credentialVersion: CREDENTIAL_VERSION,
        cedentePrestatore: CEDENTE,
      });

      expect(params).toEqual({
        businessId: "biz-789",
        method: "fisconline",
        credentials: {
          codiceFiscale: "RSSMRA80A01H501U",
          password: "secret-pw",
          pin: "12345678",
        },
        credentialVersion: CREDENTIAL_VERSION,
        onLoginRejected: expect.any(Function),
      });
    });

    it("carries the utenza di lavoro through to the session params", async () => {
      const { toAdeSessionParams } = await import("./server-auth");

      const params = toAdeSessionParams("biz-789", {
        method: "fisconline",
        codiceFiscale: "RSSMRA80A01H501U",
        password: "secret-pw",
        pin: "12345678",
        utenzaPiva: "07790350966",
        credentialVersion: CREDENTIAL_VERSION,
        cedentePrestatore: CEDENTE,
      });

      expect(params).toMatchObject({ utenzaPiva: "07790350966" });
    });

    it.each(["cie", "spid"] as const)(
      "maps %s prerequisites to session params without credentials",
      async (method) => {
        const { toAdeSessionParams } = await import("./server-auth");

        const params = toAdeSessionParams("biz-789", {
          method,
          cedentePrestatore: CEDENTE,
        });

        expect(params).toEqual({ businessId: "biz-789", method });
        expect(params).not.toHaveProperty("credentials");
      },
    );

    // Issue #1099: dopo un rifiuto dell'AdE le operazioni successive devono
    // fermarsi a `fetchAdePrerequisites`, prima del login. Il DB è il punto
    // che sopravvive a un riavvio e che la pagina impostazioni già legge.
    describe("onLoginRejected", () => {
      async function rejectedParams() {
        const { toAdeSessionParams } = await import("./server-auth");
        const params = toAdeSessionParams("biz-789", {
          method: "fisconline",
          codiceFiscale: "RSSMRA80A01H501U",
          password: "secret-pw",
          pin: "12345678",
          credentialVersion: CREDENTIAL_VERSION,
          cedentePrestatore: CEDENTE,
        });
        if (params.method !== "fisconline")
          throw new Error("fisconline atteso");
        return params;
      }

      it("azzera verified_at e registra l'esito, senza toccare updated_at", async () => {
        mockExecute.mockResolvedValueOnce([{ id: "cred-1" }]);
        const params = await rejectedParams();

        await params.onLoginRejected("auth_error");

        expect(mockExecute).toHaveBeenCalledTimes(1);
        const sqlText = JSON.stringify(mockExecute.mock.calls[0]?.[0]);
        expect(sqlText).toContain("verified_at = NULL");
        expect(sqlText).toContain("last_verify_outcome");
        expect(sqlText).toContain("auth_error");
        expect(sqlText).toContain("biz-789");
        // Raw SQL: un builder Drizzle farebbe scattare $onUpdate su
        // updated_at, che la pagina impostazioni usa come versione delle
        // credenziali salvate.
        expect(sqlText).not.toMatch(/updated_at\s*=\s*now/);
      });

      it("non invalida credenziali risalvate o già fermate", async () => {
        mockExecute.mockResolvedValueOnce([]);
        const params = await rejectedParams();

        await params.onLoginRejected("password_expired");

        const sqlText = JSON.stringify(mockExecute.mock.calls[0]?.[0]);
        // Lock ottimistico sulla versione letta con le credenziali.
        expect(sqlText).toContain("date_trunc('milliseconds', updated_at)");
        expect(sqlText).toContain(CREDENTIAL_VERSION.toISOString());
        expect(sqlText).toContain("verified_at IS NOT NULL");
        expect(sqlText).toContain("login_method = 'fisconline'");
      });

      it("logga una volta sola, quando ferma davvero i login", async () => {
        mockExecute.mockResolvedValueOnce([{ id: "cred-1" }]);
        mockExecute.mockResolvedValueOnce([]);
        const params = await rejectedParams();

        await params.onLoginRejected("account_locked");
        await params.onLoginRejected("account_locked");

        const stops = mockLoggerWarn.mock.calls.filter(
          ([ctx]) =>
            (ctx as { event?: string }).event === "ade_auto_login_stopped",
        );
        expect(stops).toHaveLength(1);
        expect(stops[0]?.[0]).toMatchObject({
          businessId: "biz-789",
          outcome: "account_locked",
        });
      });

      it("un errore del DB non lancia: il rifiuto originale deve risalire", async () => {
        mockExecute.mockRejectedValueOnce(new Error("DB down"));
        const params = await rejectedParams();

        await expect(params.onLoginRejected("auth_error")).resolves.toBe(
          undefined,
        );
        expect(mockLoggerWarn).toHaveBeenCalledWith(
          expect.objectContaining({
            businessId: "biz-789",
            errorClass: "ade_credentials_rejected_write",
          }),
          expect.any(String),
        );
      });
    });
  });
});
