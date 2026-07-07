// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDeleteReturning = vi.fn();
vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: mockDeleteReturning,
      }),
    }),
  }),
}));

vi.mock("@/db/schema", () => ({
  profiles: { authUserId: "auth_user_id" },
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
