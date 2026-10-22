// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDeleteReturning = vi.fn();
// `.where()` deve servire due pattern: `.where().returning()` (profiles) e
// `await .where()` (subscriptions, senza returning). Un Promise con `.returning`
// attaccato soddisfa entrambi.
const mockDbDelete = vi.fn(() => ({
  where: () => {
    const chain = Promise.resolve(undefined) as Promise<unknown> & {
      returning: typeof mockDeleteReturning;
    };
    chain.returning = mockDeleteReturning;
    return chain;
  },
}));
// Revoca delle chiavi API (prima di ogni passo distruttivo): lookup del profilo
// (`select…from…where…limit`) e `update(apiKeys).set(...).where(...)`.
const mockSelectLimit = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();
const mockDbUpdate = vi.fn(() => ({
  set: (values: unknown) => {
    mockUpdateSet(values);
    return { where: mockUpdateWhere };
  },
}));
vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    delete: mockDbDelete,
    update: mockDbUpdate,
    select: () => ({
      from: () => ({ where: () => ({ limit: mockSelectLimit }) }),
    }),
  }),
}));

vi.mock("@/db/schema", () => ({
  profiles: { id: "id", authUserId: "auth_user_id" },
  subscriptions: { userId: "user_id" },
  apiKeys: { profileId: "profile_id", revokedAt: "revoked_at" },
  businesses: { id: "id", profileId: "profile_id" },
}));

// Le due cache in memoria delle sessioni AdE (Fisconline e CIE/SPID), chiavi
// per businessId. `purgeUserById` le svuota dopo aver tolto l'auth user.
const mockInvalidateCache = vi.fn();
const mockInvalidateStore = vi.fn();
vi.mock("@/lib/ade/session-cache", () => ({
  adeSessionCache: {
    invalidate: (...a: unknown[]) => mockInvalidateCache(...a),
  },
}));
vi.mock("@/lib/ade/interactive-session-store", () => ({
  adeInteractiveSessionStore: {
    invalidate: (...a: unknown[]) => mockInvalidateStore(...a),
  },
}));

const mockAdminDeleteUser = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn().mockReturnValue({
    auth: { admin: { deleteUser: mockAdminDeleteUser } },
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const USER_ID = "user-123";

describe("purgeUserById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminDeleteUser.mockResolvedValue({ error: null });
    mockDeleteReturning.mockResolvedValue([{ id: "profile-1" }]);
    mockSelectLimit.mockResolvedValue([{ id: "profile-1" }]);
    mockUpdateWhere.mockResolvedValue(undefined);
    mockInvalidateCache.mockResolvedValue(undefined);
    mockInvalidateStore.mockResolvedValue(undefined);
  });

  describe("sessioni AdE in memoria", () => {
    // Le due cache tengono la sessione loggata di un business (10 minuti la
    // Fisconline, 6 ore la CIE/SPID). Nessun lettore le raggiunge una volta
    // cancellate le credenziali, ma restano in memoria e sul portale fino al
    // TTL: alla cancellazione si chiudono, con il logout.
    const BIZ_ID = "biz-9";

    function arrangeProfileAndBusiness() {
      mockSelectLimit
        .mockReset()
        .mockResolvedValueOnce([{ id: "profile-1" }]) // profilo
        .mockResolvedValueOnce([{ id: BIZ_ID }]); // business del profilo
    }

    it("svuota entrambe le cache del business dopo aver rimosso l'auth user", async () => {
      arrangeProfileAndBusiness();
      const order: string[] = [];
      mockAdminDeleteUser.mockImplementation(async () => {
        order.push("auth");
        return { error: null };
      });
      mockInvalidateCache.mockImplementation(async () => {
        order.push("cache");
      });
      mockInvalidateStore.mockImplementation(async () => {
        order.push("store");
      });
      mockDeleteReturning.mockImplementation(async () => {
        order.push("profilo");
        return [{ id: "profile-1" }];
      });

      const { purgeUserById } = await import("./purge-user");
      await purgeUserById(USER_ID);

      expect(mockInvalidateCache).toHaveBeenCalledWith(BIZ_ID);
      expect(mockInvalidateStore).toHaveBeenCalledWith(BIZ_ID);
      expect(order).toEqual(["auth", "cache", "store", "profilo"]);
    });

    it("l'id del business si legge PRIMA della cascata che lo cancella", async () => {
      arrangeProfileAndBusiness();
      const order: string[] = [];
      mockSelectLimit.mockReset();
      mockSelectLimit.mockImplementation(async () => {
        order.push("lettura");
        return [{ id: "x" }];
      });
      mockDeleteReturning.mockImplementation(async () => {
        order.push("profilo");
        return [{ id: "profile-1" }];
      });

      const { purgeUserById } = await import("./purge-user");
      await purgeUserById(USER_ID);

      expect(order.indexOf("lettura")).toBeLessThan(order.indexOf("profilo"));
    });

    it("le svuota anche se la delete del profilo fallisce dopo quella dell'auth user", async () => {
      arrangeProfileAndBusiness();
      mockDeleteReturning.mockRejectedValue(new Error("db down"));

      const { purgeUserById } = await import("./purge-user");
      const result = await purgeUserById(USER_ID);

      expect(result).toEqual({ authDeleted: true, profileDeleted: false });
      expect(mockInvalidateCache).toHaveBeenCalledWith(BIZ_ID);
      expect(mockInvalidateStore).toHaveBeenCalledWith(BIZ_ID);
    });

    it("se l'auth delete fallisce non tocca le cache: nulla è stato cancellato", async () => {
      vi.useFakeTimers();
      arrangeProfileAndBusiness();
      mockAdminDeleteUser.mockResolvedValue({ error: new Error("auth down") });

      const { purgeUserById } = await import("./purge-user");
      const pending = purgeUserById(USER_ID);
      await vi.runAllTimersAsync();
      const result = await pending;
      vi.useRealTimers();

      expect(result.authDeleted).toBe(false);
      expect(mockInvalidateCache).not.toHaveBeenCalled();
      expect(mockInvalidateStore).not.toHaveBeenCalled();
    });

    it("un utente senza business non invalida nulla", async () => {
      mockSelectLimit
        .mockReset()
        .mockResolvedValueOnce([{ id: "profile-1" }])
        .mockResolvedValueOnce([]);

      const { purgeUserById } = await import("./purge-user");
      const result = await purgeUserById(USER_ID);

      expect(result.authDeleted).toBe(true);
      expect(mockInvalidateCache).not.toHaveBeenCalled();
      expect(mockInvalidateStore).not.toHaveBeenCalled();
    });

    it("un'invalidazione che lancia non ferma la cancellazione (best-effort)", async () => {
      arrangeProfileAndBusiness();
      mockInvalidateCache.mockRejectedValue(new Error("logout giù"));

      const { purgeUserById } = await import("./purge-user");
      const result = await purgeUserById(USER_ID);

      expect(result).toEqual({ authDeleted: true, profileDeleted: true });
      const { logger } = await import("@/lib/logger");
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID }),
        expect.stringContaining("sessioni AdE"),
      );
    });
  });

  describe("revoca delle chiavi API", () => {
    // Se la delete del profilo fallisce DOPO quella dell'auth user, le chiavi
    // di un piano a pagamento o developer restano valide fino al retry dello
    // sweep: l'autenticazione API legge solo `api_keys` + `profiles`, non
    // `auth.users`. Revocarle per prime chiude la finestra.
    it("revoca le chiavi PRIMA di cancellare l'auth user e il profilo", async () => {
      const order: string[] = [];
      mockUpdateWhere.mockImplementation(async () => {
        order.push("revoca");
      });
      mockAdminDeleteUser.mockImplementation(async () => {
        order.push("auth");
        return { error: null };
      });
      mockDeleteReturning.mockImplementation(async () => {
        order.push("profilo");
        return [{ id: "profile-1" }];
      });

      const { purgeUserById } = await import("./purge-user");
      const result = await purgeUserById(USER_ID);

      expect(order).toEqual(["revoca", "auth", "profilo"]);
      expect(mockUpdateSet).toHaveBeenCalledWith({
        revokedAt: expect.any(Date),
      });
      expect(result).toEqual({ authDeleted: true, profileDeleted: true });
    });

    it("se la revoca fallisce non cancella nulla: auth user e profilo restano, ritentabile", async () => {
      mockUpdateWhere.mockRejectedValue(new Error("db down"));

      const { purgeUserById } = await import("./purge-user");
      const result = await purgeUserById(USER_ID);

      expect(result).toEqual({ authDeleted: false, profileDeleted: false });
      expect(mockAdminDeleteUser).not.toHaveBeenCalled();
      expect(mockDbDelete).not.toHaveBeenCalled();
      const { logger } = await import("@/lib/logger");
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, critical: true }),
        expect.stringContaining("revoca delle chiavi API"),
      );
    });

    it("profilo già assente (retry di un purge parziale): niente revoca e procede", async () => {
      mockSelectLimit.mockResolvedValue([]);

      const { purgeUserById } = await import("./purge-user");
      const result = await purgeUserById(USER_ID);

      expect(mockDbUpdate).not.toHaveBeenCalled();
      expect(mockAdminDeleteUser).toHaveBeenCalledWith(USER_ID);
      expect(result.authDeleted).toBe(true);
    });
  });

  it("cancella auth PRIMA del profilo e ritorna authDeleted+profileDeleted", async () => {
    const order: string[] = [];
    mockAdminDeleteUser.mockImplementation(async () => {
      order.push("auth");
      return { error: null };
    });
    mockDeleteReturning.mockImplementation(async () => {
      order.push("profile");
      return [{ id: "profile-1" }];
    });

    const { purgeUserById } = await import("./purge-user");
    const result = await purgeUserById(USER_ID);

    expect(mockAdminDeleteUser).toHaveBeenCalledWith(USER_ID);
    expect(order).toEqual(["auth", "profile"]);
    expect(result).toEqual({ authDeleted: true, profileDeleted: true });
  });

  it("cancella anche la riga subscriptions insieme al profilo (no righe orfane, PR #731)", async () => {
    const { purgeUserById } = await import("./purge-user");
    const { profiles, subscriptions } = await import("@/db/schema");

    await purgeUserById(USER_ID);

    // Entrambe le tabelle vengono targhettate dalla DELETE: la subscription non
    // ha FK/cascata, quindi senza questa delete resterebbe orfana.
    expect(mockDbDelete).toHaveBeenCalledWith(subscriptions);
    expect(mockDbDelete).toHaveBeenCalledWith(profiles);
  });

  it("ritenta la delete auth fino a 3 volte poi si arrende (profilo intatto)", async () => {
    vi.useFakeTimers();
    mockAdminDeleteUser.mockResolvedValue({ error: { message: "boom" } });

    const { purgeUserById } = await import("./purge-user");
    const promise = purgeUserById(USER_ID);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mockAdminDeleteUser).toHaveBeenCalledTimes(3);
    expect(mockDeleteReturning).not.toHaveBeenCalled();
    expect(result).toEqual({ authDeleted: false, profileDeleted: false });
    vi.useRealTimers();
  });

  it("smette di ritentare appena la delete auth riesce", async () => {
    vi.useFakeTimers();
    mockAdminDeleteUser
      .mockResolvedValueOnce({ error: { message: "transient" } })
      .mockResolvedValueOnce({ error: null });

    const { purgeUserById } = await import("./purge-user");
    const promise = purgeUserById(USER_ID);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mockAdminDeleteUser).toHaveBeenCalledTimes(2);
    expect(result.authDeleted).toBe(true);
    vi.useRealTimers();
  });

  it.each([
    { name: "status 404", error: { message: "User not found", status: 404 } },
    {
      name: "code user_not_found",
      error: { message: "User not found", code: "user_not_found" },
    },
  ])(
    "tratta 'user not found' ($name) come successo idempotente: nessun retry, profilo cancellato",
    async ({ error }) => {
      // Profilo orfano (auth user già cancellato in un run precedente in cui
      // la delete di profiles era fallita): senza il ramo idempotente, lo
      // sweep GDPR ritenterebbe per sempre — 3 retry falliti al giorno,
      // logger.error critical in Sentry e dati personali MAI cancellati.
      mockAdminDeleteUser.mockResolvedValue({ error });

      const { purgeUserById } = await import("./purge-user");
      const { logger } = await import("@/lib/logger");
      const result = await purgeUserById(USER_ID);

      expect(mockAdminDeleteUser).toHaveBeenCalledTimes(1);
      expect(mockDeleteReturning).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ authDeleted: true, profileDeleted: true });
      // Condizione attesa (regola 20): warn, non error → niente Sentry issue.
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID }),
        expect.any(String),
      );
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it("ritorna profileDeleted:false e logga se il profilo non esiste", async () => {
    mockDeleteReturning.mockResolvedValue([]);

    const { purgeUserById } = await import("./purge-user");
    const { logger } = await import("@/lib/logger");
    const result = await purgeUserById(USER_ID);

    expect(result).toEqual({ authDeleted: true, profileDeleted: false });
    expect(logger.error).toHaveBeenCalledWith(
      { userId: USER_ID },
      expect.stringContaining("profile not found"),
    );
  });

  it("logga error critico se la delete profilo lancia dopo la delete auth", async () => {
    mockDeleteReturning.mockRejectedValue(new Error("DB lost"));

    const { purgeUserById } = await import("./purge-user");
    const { logger } = await import("@/lib/logger");
    const result = await purgeUserById(USER_ID);

    expect(result).toEqual({ authDeleted: true, profileDeleted: false });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ critical: true, userId: USER_ID }),
      expect.stringContaining("manual cleanup"),
    );
  });
});
