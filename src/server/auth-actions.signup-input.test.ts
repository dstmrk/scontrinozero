// @vitest-environment node
// signUp: normalizzazione dell'email e attribuzione signup_source da ?ref=.
// Il resto di signUp sta in auth-actions.test.ts.
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
  // verifyCaptcha validates the `action` field on the siteverify response.
  // signUp passes expectedAction="signup" — echo it back.
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, hostname, action: "signup" }),
  });
  process.env.NEXT_PUBLIC_APP_HOSTNAME = hostname;
  process.env.TURNSTILE_SECRET_KEY = "secret-key";
}

function setupDbNoExistingEmail() {
  mockGetDb.mockReturnValue({
    select: mockSelectProfiles,
    insert: mockInsertProfiles,
    // insertProfileOrRollback ora avvolge profilo + redemption in una
    // transazione: il tx espone lo stesso mock insert così la catena
    // values().returning() resta invariata.
    transaction: async (cb: (tx: unknown) => unknown) =>
      cb({ insert: mockInsertProfiles }),
  });
  mockSelectProfiles.mockReturnValue({ from: mockSelectFrom });
  mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
  mockSelectLimit.mockResolvedValue([]); // no existing profile

  mockInsertProfiles.mockReturnValue({ values: mockInsertValues });
  mockInsertValues.mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: "profile-id" }]),
  });
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
});

describe("signUp — signup_source attribution from ?ref=", () => {
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

  it("persists allowlisted ref as signupSource on profile insert", async () => {
    setupCaptchaOk();
    setupDbNoExistingEmail();

    const { signUp } = await import("@/server/auth-actions");
    const fd = makeFormData();
    fd.set("ref", "reddit");
    await expect(signUp(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ signupSource: "reddit" }),
    );
  });

  it("normalises mixed-case ref to lowercase", async () => {
    setupCaptchaOk();
    setupDbNoExistingEmail();

    const { signUp } = await import("@/server/auth-actions");
    const fd = makeFormData();
    fd.set("ref", "LinkedIn");
    await expect(signUp(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ signupSource: "linkedin" }),
    );
  });

  it("silently drops ref outside the allowlist", async () => {
    setupCaptchaOk();
    setupDbNoExistingEmail();

    const { signUp } = await import("@/server/auth-actions");
    const fd = makeFormData();
    fd.set("ref", "hacker");
    await expect(signUp(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ signupSource: null }),
    );
  });

  it("silently drops malicious ref containing non-allowed characters", async () => {
    setupCaptchaOk();
    setupDbNoExistingEmail();

    const { signUp } = await import("@/server/auth-actions");
    const fd = makeFormData();
    fd.set("ref", "reddit;DROP TABLE profiles");
    await expect(signUp(fd)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ signupSource: null }),
    );
  });

  it("persists null signupSource when ref is absent (backwards compat)", async () => {
    setupCaptchaOk();
    setupDbNoExistingEmail();

    const { signUp } = await import("@/server/auth-actions");
    await expect(signUp(makeFormData())).rejects.toThrow("NEXT_REDIRECT");

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ signupSource: null }),
    );
  });
});
