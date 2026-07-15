// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthenticatedError } from "@/lib/auth-errors";

// --- Hoisted mocks ---

// Override una-tantum di getAuthenticatedUser per simulare sessione assente.
// `@/lib/server-auth` è mockato con un factory che referenzia const non-hoisted,
// quindi NON si può importare staticamente qui (romperebbe l'hoisting di vi.mock):
// import dinamico dentro il test, quando i const sono già inizializzati.
async function rejectAuthOnce(): Promise<void> {
  const { getAuthenticatedUser } = await import("@/lib/server-auth");
  vi.mocked(getAuthenticatedUser).mockRejectedValueOnce(
    new UnauthenticatedError(),
  );
}

const {
  mockGetUser,
  mockSignInWithPassword,
  mockUpdateUser,
  mockSignOut,
  mockCheck,
  mockRevalidatePath,
  mockGetClientIp,
  mockHeaders,
  mockLoggerError,
  mockLoggerWarn,
  mockLoggerInfo,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockSignOut: vi.fn(),
  mockCheck: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockGetClientIp: vi.fn().mockReturnValue("1.2.3.4"),
  mockHeaders: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerInfo: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("next/headers", () => ({ headers: mockHeaders }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: mockGetUser,
      signInWithPassword: mockSignInWithPassword,
      updateUser: mockUpdateUser,
      signOut: mockSignOut,
    },
  }),
}));

vi.mock("@/lib/get-client-ip", () => ({ getClientIp: mockGetClientIp }));

const mockDbUpdate = vi.fn();
const mockDbUpdateSet = vi.fn().mockReturnValue({ where: vi.fn() });

// SELECT chain for the audit log diff in updateBusiness:
// `db.select({...}).from(...).where(...).limit(1)` → [{ preferredVatCode: null }]
const mockDbSelectLimit = vi
  .fn()
  .mockResolvedValue([{ preferredVatCode: null }]);
// SELECT chain now also supports .for("update") for the row lock used in
// updateBusiness's transaction (preparePreferredVatCodeUpdate).
const mockDbSelectFor = vi.fn().mockReturnValue({ limit: mockDbSelectLimit });
const mockDbSelectWhere = vi.fn().mockReturnValue({
  limit: mockDbSelectLimit,
  for: mockDbSelectFor,
});
const mockDbSelectFrom = vi.fn().mockReturnValue({ where: mockDbSelectWhere });
const mockDbSelect = vi.fn().mockReturnValue({ from: mockDbSelectFrom });

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    update: mockDbUpdate,
    select: mockDbSelect,
    // Transaction passthrough: invoke the callback with a tx object that
    // exposes the same chainable mocks as the outer db (updateBusiness
    // wraps its SELECT … FOR UPDATE + UPDATE in db.transaction).
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ update: mockDbUpdate, select: mockDbSelect }),
  }),
}));

vi.mock("@/db/schema", () => ({
  profiles: "profiles-table",
  businesses: "businesses-table",
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));

// checkBusinessOwnership mock: null = ownership confirmed
const mockCheckBusinessOwnership = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: vi.fn().mockImplementation(async () => {
    const result = await mockGetUser();
    if (!result?.data?.user) throw new Error("Not authenticated");
    return result.data.user;
  }),
  checkBusinessOwnership: mockCheckBusinessOwnership,
}));

vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockCheck };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
  },
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
const FAKE_HEADERS = {} as Parameters<typeof mockHeaders>[0];

// --- Tests ---

describe("profile-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } });
    mockCheck.mockReturnValue({ success: true });
    mockHeaders.mockResolvedValue(FAKE_HEADERS);
    mockDbUpdate.mockReturnValue({ set: mockDbUpdateSet });
    mockCheckBusinessOwnership.mockResolvedValue(null);
  });

  // ---------------------------------------------------------------------------
  // updateProfile
  // ---------------------------------------------------------------------------

  describe("updateProfile", () => {
    const VALID = { firstName: "Mario", lastName: "Rossi" };

    it("returns empty object on success", async () => {
      const { updateProfile } = await import("./profile-actions");
      const result = await updateProfile(formData(VALID));
      expect(result).toEqual({});
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/settings");
    });

    it("returns error for missing firstName", async () => {
      const { updateProfile } = await import("./profile-actions");
      const result = await updateProfile(formData({ ...VALID, firstName: "" }));
      expect(result.error).toMatch(/nome/i);
    });

    it("returns error for missing lastName", async () => {
      const { updateProfile } = await import("./profile-actions");
      const result = await updateProfile(formData({ ...VALID, lastName: "" }));
      expect(result.error).toMatch(/cognome/i);
    });

    it("returns error when firstName exceeds 80 chars", async () => {
      const { updateProfile } = await import("./profile-actions");
      const result = await updateProfile(
        formData({ ...VALID, firstName: "A".repeat(81) }),
      );
      expect(result.error).toMatch(/80/);
    });

    it("returns error when lastName exceeds 80 chars", async () => {
      const { updateProfile } = await import("./profile-actions");
      const result = await updateProfile(
        formData({ ...VALID, lastName: "A".repeat(81) }),
      );
      expect(result.error).toMatch(/80/);
    });

    it("returns rate limit error when limiter rejects", async () => {
      mockCheck.mockReturnValue({ success: false });
      const { updateProfile } = await import("./profile-actions");
      const result = await updateProfile(formData(VALID));
      expect(result.error).toMatch(/troppi/i);
    });

    it("degrada a 'Non autenticato.' quando la sessione è scaduta (no throw)", async () => {
      await rejectAuthOnce();
      const { updateProfile } = await import("./profile-actions");
      const result = await updateProfile(formData(VALID));
      expect(result.error).toBe("Non autenticato.");
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // updateBusiness
  // ---------------------------------------------------------------------------

  describe("updateBusiness", () => {
    const VALID = {
      businessId: "11111111-1111-4111-8111-111111111111",
      address: "Via Roma 1",
      zipCode: "00100",
    };

    it("returns empty object on success", async () => {
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(formData(VALID));
      expect(result).toEqual({});
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/settings");
    });

    it("returns error for missing businessId", async () => {
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(
        formData({ ...VALID, businessId: "" }),
      );
      expect(result.error).toMatch(/business id/i);
    });

    it("guard UUID (regola 9): businessId malformato → { error } senza ownership check", async () => {
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(
        formData({ ...VALID, businessId: "abc" }),
      );

      expect(result.error).toBe("Identificativo non valido.");
      expect(mockCheckBusinessOwnership).not.toHaveBeenCalled();
    });

    it("returns error for missing address", async () => {
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(formData({ ...VALID, address: "" }));
      expect(result.error).toMatch(/indirizzo/i);
    });

    it("returns error for invalid zipCode (non-5-digit)", async () => {
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(
        formData({ ...VALID, zipCode: "123" }),
      );
      expect(result.error).toMatch(/CAP/i);
    });

    it("returns error for non-numeric zipCode", async () => {
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(
        formData({ ...VALID, zipCode: "AB123" }),
      );
      expect(result.error).toMatch(/CAP/i);
    });

    it("returns error when businessName exceeds 120 chars", async () => {
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(
        formData({ ...VALID, businessName: "A".repeat(121) }),
      );
      expect(result.error).toMatch(/120/);
    });

    it("returns error when province exceeds 3 chars", async () => {
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(
        formData({ ...VALID, province: "XXXX" }),
      );
      expect(result.error).toMatch(/provincia/i);
    });

    it("returns ownership error when checkBusinessOwnership fails", async () => {
      mockCheckBusinessOwnership.mockResolvedValue({
        error: "Business non trovato o non autorizzato.",
      });
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(formData(VALID));
      expect(result.error).toMatch(/non autorizzato/i);
    });

    it("returns rate limit error when limiter rejects", async () => {
      mockCheck.mockReturnValue({ success: false });
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(formData(VALID));
      expect(result.error).toMatch(/troppi/i);
    });

    it("degrada a 'Non autenticato.' quando la sessione è scaduta (no throw)", async () => {
      await rejectAuthOnce();
      const { updateBusiness } = await import("./profile-actions");
      const result = await updateBusiness(formData(VALID));
      expect(result.error).toBe("Non autenticato.");
      expect(mockCheckBusinessOwnership).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // changePassword
  // ---------------------------------------------------------------------------

  describe("changePassword", () => {
    const VALID = {
      currentPassword: "OldPass1!",
      newPassword: "NewPass1!",
      confirmPassword: "NewPass1!",
    };

    beforeEach(() => {
      mockSignInWithPassword.mockResolvedValue({ error: null });
      mockUpdateUser.mockResolvedValue({ error: null });
      mockSignOut.mockResolvedValue({ error: null });
    });

    it("returns empty object on success", async () => {
      const { changePassword } = await import("./profile-actions");
      const result = await changePassword(formData(VALID));
      expect(result).toEqual({});
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: FAKE_USER.email,
        password: VALID.currentPassword,
      });
      expect(mockUpdateUser).toHaveBeenCalledWith({
        password: VALID.newPassword,
      });
    });

    it("sequenza obbligata: signInWithPassword → updateUser → signOut(others)", async () => {
      // Safety net contro un refactor che invertisse l'ordine — il cookie
      // della sessione viene ruotato da signInWithPassword, e signOut
      // (others) deve essere SEMPRE l'ultimo step per non revocare il
      // refresh token appena emesso. Vedi commento "Invariante 1" in
      // profile-actions.ts.
      const { changePassword } = await import("./profile-actions");
      await changePassword(formData(VALID));

      const signInOrder = mockSignInWithPassword.mock.invocationCallOrder[0];
      const updateOrder = mockUpdateUser.mock.invocationCallOrder[0];
      const signOutOrder = mockSignOut.mock.invocationCallOrder[0];

      expect(signInOrder).toBeLessThan(updateOrder);
      expect(updateOrder).toBeLessThan(signOutOrder);
    });

    it("signOut viene chiamato con scope: 'others' esplicito (non global, non omesso)", async () => {
      // Invariante 2: scope:"others" preserva la sessione corrente E
      // revoca le altre. `global` killerebbe anche la corrente, undefined
      // lascerebbe la sessione pre-cambio attiva su altri device.
      const { changePassword } = await import("./profile-actions");
      await changePassword(formData(VALID));
      expect(mockSignOut).toHaveBeenCalledWith({ scope: "others" });
      // Specificità: nessuna chiamata senza opzioni o con scope diverso.
      const calls = mockSignOut.mock.calls;
      for (const args of calls) {
        expect(args[0]).toEqual({ scope: "others" });
      }
    });

    it("revoca le altre sessioni dopo updateUser riuscito", async () => {
      const { changePassword } = await import("./profile-actions");
      await changePassword(formData(VALID));
      expect(mockSignOut).toHaveBeenCalledWith({ scope: "others" });
    });

    it("signOut others è fire-and-forget — non blocca il successo se fallisce", async () => {
      vi.useFakeTimers();
      // Tutte e 3 le retry falliscono: nessun errore propagato all'utente.
      mockSignOut.mockResolvedValue({ error: { message: "transient" } });
      const { changePassword } = await import("./profile-actions");
      const promise = changePassword(formData(VALID));
      await vi.runAllTimersAsync();
      const result = await promise;
      // Il password change è già committato lato Supabase: non vogliamo
      // mostrare un errore all'utente se solo il revoke fallisce.
      expect(result).toEqual({});
      expect(mockSignOut).toHaveBeenCalledWith({ scope: "others" });
      vi.useRealTimers();
    });

    it("ritenta signOut others 3 volte con backoff su errore transient", async () => {
      vi.useFakeTimers();
      mockSignOut
        .mockResolvedValueOnce({ error: { message: "transient 1" } })
        .mockResolvedValueOnce({ error: { message: "transient 2" } })
        .mockResolvedValueOnce({ error: null });
      const { changePassword } = await import("./profile-actions");
      const promise = changePassword(formData(VALID));
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result).toEqual({});
      expect(mockSignOut).toHaveBeenCalledTimes(3);
      // Successo al 3° tentativo → nessun log critical.
      expect(mockLoggerError).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("logga critical:true dopo 3 retry esauriti su signOut others", async () => {
      vi.useFakeTimers();
      mockSignOut.mockResolvedValue({ error: { message: "persistent" } });
      const { changePassword } = await import("./profile-actions");
      const promise = changePassword(formData(VALID));
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result).toEqual({});
      expect(mockSignOut).toHaveBeenCalledTimes(3);
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.objectContaining({ critical: true, userId: FAKE_USER.id }),
        expect.stringContaining("revoke other sessions"),
      );
      vi.useRealTimers();
    });

    it("returns error for missing currentPassword", async () => {
      const { changePassword } = await import("./profile-actions");
      const result = await changePassword(
        formData({ ...VALID, currentPassword: "" }),
      );
      expect(result.error).toMatch(/password attuale/i);
    });

    it("returns error for weak new password (no uppercase)", async () => {
      const { changePassword } = await import("./profile-actions");
      const result = await changePassword(
        formData({
          ...VALID,
          newPassword: "weakpass1!",
          confirmPassword: "weakpass1!",
        }),
      );
      expect(result.error).toMatch(/sicura/i);
    });

    it("returns error when confirmPassword does not match", async () => {
      const { changePassword } = await import("./profile-actions");
      const result = await changePassword(
        formData({ ...VALID, confirmPassword: "Different1!" }),
      );
      expect(result.error).toMatch(/coincidono/i);
    });

    it("returns error when current password is wrong", async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: { message: "Invalid login credentials" },
      });
      const { changePassword } = await import("./profile-actions");
      const result = await changePassword(formData(VALID));
      expect(result.error).toMatch(/password attuale non corretta/i);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("returns error when updateUser fails", async () => {
      mockUpdateUser.mockResolvedValue({
        error: { message: "update failed" },
      });
      const { changePassword } = await import("./profile-actions");
      const result = await changePassword(formData(VALID));
      expect(result.error).toMatch(/aggiornamento/i);
    });

    it("returns rate limit error when limiter rejects", async () => {
      mockCheck.mockReturnValue({ success: false });
      const { changePassword } = await import("./profile-actions");
      const result = await changePassword(formData(VALID));
      expect(result.error).toMatch(/troppi/i);
    });

    it("degrada a 'Non autenticato.' quando la sessione è scaduta (no throw)", async () => {
      await rejectAuthOnce();
      const { changePassword } = await import("./profile-actions");
      const result = await changePassword(formData(VALID));
      expect(result.error).toBe("Non autenticato.");
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // completePasswordReset
  // ---------------------------------------------------------------------------

  describe("completePasswordReset", () => {
    const VALID = {
      newPassword: "NewPass1!",
      confirmPassword: "NewPass1!",
    };

    beforeEach(() => {
      mockUpdateUser.mockResolvedValue({ error: null });
      mockSignOut.mockResolvedValue({ error: null });
    });

    it("returns empty object on success and updates the password", async () => {
      const { completePasswordReset } = await import("./profile-actions");
      const result = await completePasswordReset(formData(VALID));
      expect(result).toEqual({});
      expect(mockUpdateUser).toHaveBeenCalledWith({
        password: VALID.newPassword,
      });
    });

    it("does NOT call signInWithPassword (recovery session authorises the change)", async () => {
      // È la differenza chiave con changePassword: chi fa il reset non
      // conosce la vecchia password, quindi nessuna re-autenticazione.
      const { completePasswordReset } = await import("./profile-actions");
      await completePasswordReset(formData(VALID));
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });

    it("revokes other sessions with scope 'others' after updateUser", async () => {
      const { completePasswordReset } = await import("./profile-actions");
      await completePasswordReset(formData(VALID));

      const updateOrder = mockUpdateUser.mock.invocationCallOrder[0];
      const signOutOrder = mockSignOut.mock.invocationCallOrder[0];
      expect(updateOrder).toBeLessThan(signOutOrder);
      expect(mockSignOut).toHaveBeenCalledWith({ scope: "others" });
    });

    it("returns UNAUTHORIZED (no throw) when there is no recovery session", async () => {
      // Link scaduto/già usato o accesso diretto alla pagina: degradare con
      // messaggio, non far scattare l'error boundary (CLAUDE.md regola 19).
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { completePasswordReset } = await import("./profile-actions");
      const result = await completePasswordReset(formData(VALID));
      expect(result.error).toMatch(/non autorizzato/i);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("returns error for a weak new password (no uppercase)", async () => {
      const { completePasswordReset } = await import("./profile-actions");
      const result = await completePasswordReset(
        formData({ newPassword: "weakpass1!", confirmPassword: "weakpass1!" }),
      );
      expect(result.error).toMatch(/sicura/i);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("returns error when confirmPassword does not match", async () => {
      const { completePasswordReset } = await import("./profile-actions");
      const result = await completePasswordReset(
        formData({ ...VALID, confirmPassword: "Different1!" }),
      );
      expect(result.error).toMatch(/coincidono/i);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("returns rate limit error when limiter rejects", async () => {
      mockCheck.mockReturnValue({ success: false });
      const { completePasswordReset } = await import("./profile-actions");
      const result = await completePasswordReset(formData(VALID));
      expect(result.error).toMatch(/troppi/i);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("returns error when updateUser fails", async () => {
      mockUpdateUser.mockResolvedValue({ error: { message: "update failed" } });
      const { completePasswordReset } = await import("./profile-actions");
      const result = await completePasswordReset(formData(VALID));
      expect(result.error).toMatch(/aggiornamento/i);
    });

    it("signOut others is fire-and-forget — success even if revoke fails", async () => {
      vi.useFakeTimers();
      mockSignOut.mockResolvedValue({ error: { message: "transient" } });
      const { completePasswordReset } = await import("./profile-actions");
      const promise = completePasswordReset(formData(VALID));
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result).toEqual({});
      vi.useRealTimers();
    });
  });
});
