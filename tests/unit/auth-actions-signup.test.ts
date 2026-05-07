// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks ---

const {
  mockSupabaseSignUp,
  mockInsertProfiles,
  mockInsertValues,
  mockSelectProfiles,
  mockSelectFrom,
  mockSelectWhere,
  mockSelectLimit,
  mockGetDb,
  mockRateLimiterCheck,
  mockRedirect,
  mockDeleteUser,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockSupabaseSignUp: vi.fn(),
  mockInsertProfiles: vi.fn(),
  mockInsertValues: vi.fn(),
  mockSelectProfiles: vi.fn(),
  mockSelectFrom: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockGetDb: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
  mockRedirect: vi.fn(),
  mockDeleteUser: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

vi.mock("next/headers", () => ({
  headers: vi
    .fn()
    .mockResolvedValue(new Headers({ "cf-connecting-ip": "1.2.3.4" })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: { signUp: mockSupabaseSignUp },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    auth: { admin: { deleteUser: mockDeleteUser, generateLink: vi.fn() } },
  })),
}));

vi.mock("@/db", () => ({ getDb: mockGetDb }));
vi.mock("@/db/schema", () => ({ profiles: "profiles-table" }));

vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() },
}));

// Patch fetch for Turnstile verification
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// --- Helpers ---

function makeFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("email", overrides.email ?? "user@example.com");
  fd.set("password", overrides.password ?? "Secure!Pass1");
  fd.set("confirmPassword", overrides.confirmPassword ?? "Secure!Pass1");
  fd.set("termsAccepted", overrides.termsAccepted ?? "true");
  fd.set(
    "specificClausesAccepted",
    overrides.specificClausesAccepted ?? "true",
  );
  fd.set("captchaToken", overrides.captchaToken ?? "valid-token");
  return fd;
}

function setupCaptchaOk(hostname = "app.scontrinozero.it") {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, hostname }),
  });
  process.env.NEXT_PUBLIC_APP_HOSTNAME = hostname;
  process.env.TURNSTILE_SECRET_KEY = "secret-key";
}

function setupDbNoExistingEmail() {
  mockGetDb.mockReturnValue({
    select: mockSelectProfiles,
    insert: mockInsertProfiles,
  });
  mockSelectProfiles.mockReturnValue({ from: mockSelectFrom });
  mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
  mockSelectLimit.mockResolvedValue([]); // no existing profile

  mockInsertProfiles.mockReturnValue({ values: mockInsertValues });
  mockInsertValues.mockResolvedValue(undefined);
}

// --- Tests ---

describe("signUp — email normalisation and uniqueness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimiterCheck.mockReturnValue({ success: true });
    mockRedirect.mockImplementation((url: string) => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { url });
    });
    mockSupabaseSignUp.mockResolvedValue({
      data: { user: { id: "user-uuid-1" } },
      error: null,
    });
    mockDeleteUser.mockResolvedValue({ error: null });
  });

  it("normalises mixed-case email to lowercase before pre-check and insert", async () => {
    setupCaptchaOk();
    setupDbNoExistingEmail();

    const { signUp } = await import("@/server/auth-actions");
    const fd = makeFormData({ email: "User@EXAMPLE.COM" });
    await expect(signUp(fd)).rejects.toThrow("NEXT_REDIRECT");

    // The value passed to insert().values() should contain the normalised email
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@example.com" }),
    );

    // Supabase signUp should also receive the normalised email
    expect(mockSupabaseSignUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@example.com" }),
    );
  });

  it("trims whitespace from email before processing", async () => {
    setupCaptchaOk();
    setupDbNoExistingEmail();

    const { signUp } = await import("@/server/auth-actions");
    const fd = makeFormData({ email: "  user@example.com  " });
    await expect(signUp(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@example.com" }),
    );
  });

  it("returns user-friendly message when pre-check finds existing email", async () => {
    setupCaptchaOk();
    setupDbNoExistingEmail();
    // Override: existing profile found
    mockSelectLimit.mockResolvedValue([{ id: "existing-uuid" }]);

    const { signUp } = await import("@/server/auth-actions");
    const result = await signUp(makeFormData());

    expect(result).toEqual({
      error:
        "Un account con questa email esiste già. Accedi oppure reimposta la password.",
    });
    expect(mockSupabaseSignUp).not.toHaveBeenCalled();
  });

  it("returns user-friendly message when profile insert violates unique email constraint (race condition)", async () => {
    setupCaptchaOk();
    setupDbNoExistingEmail();
    // Simulate unique constraint violation (23505) on insert
    mockInsertValues.mockRejectedValue(
      Object.assign(new Error("duplicate key value"), { code: "23505" }),
    );

    const { signUp } = await import("@/server/auth-actions");
    const result = await signUp(makeFormData());

    expect(result).toEqual({
      error:
        "Un account con questa email esiste già. Accedi oppure reimposta la password.",
    });
    // Should NOT call deleteUser for uniqueness violations (no Supabase user was created yet
    // at the profile insert stage, but deleteUser is called in the catch for other errors)
  });

  it("performs compensating delete and returns generic error for non-unique DB failures", async () => {
    setupCaptchaOk();
    setupDbNoExistingEmail();
    // Simulate a generic DB error (not unique violation)
    mockInsertValues.mockRejectedValue(new Error("DB connection lost"));

    const { signUp } = await import("@/server/auth-actions");
    const result = await signUp(makeFormData());

    expect(result).toEqual({ error: "Registrazione fallita. Riprova." });
    expect(mockDeleteUser).toHaveBeenCalled();
  });
});
