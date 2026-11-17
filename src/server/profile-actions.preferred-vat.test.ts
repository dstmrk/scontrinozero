// @vitest-environment node
// updateBusiness: aliquota IVA preferita (validazione, audit log, lock di riga)
// e rate limit prima dell'ownership. Il resto di profile-actions, con i mock
// di profile-actions.test.ts, sta lì.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const {
  mockGetAuthenticatedUser,
  mockCheckBusinessMembership,
  mockNextHeaders,
  mockGetClientIp,
  mockCheck,
  mockCreateServerSupabaseClient,
  mockIsStrongPassword,
  mockIsValidItalianZipCode,
  mockGetDb,
  mockSelect,
  mockSelectFrom,
  mockSelectWhere,
  mockSelectFor,
  mockSelectLimit,
  mockUpdate,
  mockUpdateSet,
  mockUpdateWhere,
  mockTransaction,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockCheckBusinessMembership: vi
    .fn()
    .mockResolvedValue({ memberId: "member-owner", role: "owner" }),
  mockNextHeaders: vi.fn(),
  mockGetClientIp: vi.fn(),
  mockCheck: vi.fn(),
  mockCreateServerSupabaseClient: vi.fn(),
  mockIsStrongPassword: vi.fn(),
  mockIsValidItalianZipCode: vi.fn(),
  mockGetDb: vi.fn(),
  mockSelect: vi.fn(),
  mockSelectFrom: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockSelectFor: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
  checkBusinessMembership: mockCheckBusinessMembership,
}));

vi.mock("next/headers", () => ({
  headers: mockNextHeaders,
}));

vi.mock("@/lib/get-client-ip", () => ({
  getClientIp: mockGetClientIp,
}));

// RateLimiter is a class — must use function keyword (not arrow) per CLAUDE.md
vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockCheck };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}));

vi.mock("@/lib/validation", () => ({
  isStrongPassword: mockIsStrongPassword,
  isValidItalianZipCode: mockIsValidItalianZipCode,
  ITALIAN_ZIP_MESSAGE: "CAP non valido (5 cifre numeriche).",
  BUSINESS_PROFILE_LIMITS: {
    firstName: 80,
    lastName: 80,
    businessName: 120,
    address: 150,
    streetNumber: 20,
    city: 80,
  },
  // Riproduce il contratto reale (trim + maiuscolo, null se vuota): la
  // provincia finisce nel payload dell'UPDATE asserito da questi test.
  normalizeProvince: vi.fn((raw: string | null) => {
    const normalized = raw?.trim().toUpperCase() ?? "";
    return normalized === "" ? null : normalized;
  }),
  validateBusinessOptionalFields: vi.fn().mockReturnValue(null),
}));

vi.mock("@/types/cassa", () => {
  const codes = new Set([
    "4",
    "5",
    "10",
    "22",
    "N1",
    "N2",
    "N3",
    "N4",
    "N5",
    "N6",
  ]);
  return {
    VAT_CODES: ["4", "5", "10", "22", "N1", "N2", "N3", "N4", "N5", "N6"],
    isInvalidPreferredVatCode: (code: string | null) =>
      code !== null && !codes.has(code),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: mockGetDb,
}));

vi.mock("@/db/schema", () => ({
  profiles: "profiles-table",
  businesses: "businesses-table",
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { updateBusiness } from "@/server/profile-actions";
import { logger } from "@/lib/logger";

// --- Helpers ---

const USER_ID = "user-abc";
const USER_EMAIL = "test@example.com";

// --- Tests ---

const BIZ_ID = "11111111-1111-4111-8111-111111111111";

function makeBusinessFormData(
  overrides: Record<string, string> = {},
): FormData {
  const fd = new FormData();
  fd.append("businessId", overrides.businessId ?? BIZ_ID);
  fd.append("businessName", overrides.businessName ?? "Acme srl");
  fd.append("address", overrides.address ?? "Via Roma");
  fd.append("streetNumber", overrides.streetNumber ?? "1");
  fd.append("city", overrides.city ?? "Roma");
  fd.append("province", overrides.province ?? "RM");
  fd.append("zipCode", overrides.zipCode ?? "00100");
  if (overrides.preferredVatCode !== undefined) {
    fd.append("preferredVatCode", overrides.preferredVatCode);
  }
  return fd;
}

describe("updateBusiness server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetAuthenticatedUser.mockResolvedValue({
      id: USER_ID,
      email: USER_EMAIL,
    });
    mockCheckBusinessMembership.mockResolvedValue({
      memberId: "member-owner",
      role: "owner",
    });
    mockIsValidItalianZipCode.mockReturnValue(true);
    mockCheck.mockReturnValue({ success: true });

    // SELECT chain: returns the current preferredVatCode for the audit diff.
    // .for("update") returns a chainable that has .limit().
    mockSelectLimit.mockResolvedValue([{ preferredVatCode: null }]);
    mockSelectFor.mockReturnValue({ limit: mockSelectLimit });
    mockSelectWhere.mockReturnValue({
      for: mockSelectFor,
      limit: mockSelectLimit,
    });
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    // UPDATE chain: terminal `.where()` is awaited
    mockUpdateWhere.mockResolvedValue(undefined);
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });

    // Transaction passthrough: invoke the callback with a tx object that
    // exposes the same chainable mocks as the outer db.
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select: mockSelect, update: mockUpdate }),
    );

    mockGetDb.mockReturnValue({
      select: mockSelect,
      update: mockUpdate,
      transaction: mockTransaction,
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("persists preferredVatCode when valid", async () => {
    const result = await updateBusiness(
      makeBusinessFormData({ preferredVatCode: "22" }),
    );

    expect(result.error).toBeUndefined();
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ preferredVatCode: "22" }),
    );
  });

  it("rejects a preferredVatCode that is not in VAT_CODES", async () => {
    const result = await updateBusiness(
      makeBusinessFormData({ preferredVatCode: "99" }),
    );

    expect(result.error).toBe("Aliquota IVA non valida.");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("treats empty preferredVatCode as null (clears the preference)", async () => {
    mockSelectLimit.mockResolvedValue([{ preferredVatCode: "22" }]);

    const result = await updateBusiness(
      makeBusinessFormData({ preferredVatCode: "" }),
    );

    expect(result.error).toBeUndefined();
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ preferredVatCode: null }),
    );
  });

  it("logs an audit event when preferredVatCode changes", async () => {
    mockSelectLimit.mockResolvedValue([{ preferredVatCode: "N2" }]);

    await updateBusiness(makeBusinessFormData({ preferredVatCode: "22" }));

    expect(logger.info as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        businessId: BIZ_ID,
        oldVatCode: "N2",
        newVatCode: "22",
      }),
      "Business preferred VAT code changed",
    );
  });

  it("does NOT log an audit event when preferredVatCode is unchanged", async () => {
    mockSelectLimit.mockResolvedValue([{ preferredVatCode: "22" }]);

    await updateBusiness(makeBusinessFormData({ preferredVatCode: "22" }));

    expect(logger.info as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("rate-limit blocca PRIMA della ownership query (CLAUDE.md regola 29)", async () => {
    // Un attaccante autenticato che martella con businessId arbitrari NON
    // deve raggiungere checkBusinessMembership: il rate-limit deve scattare
    // prima, evitando di esporre query DB a brute-force.
    mockCheck.mockReturnValue({ success: false });

    await updateBusiness(makeBusinessFormData({ preferredVatCode: "22" }));

    expect(mockCheckBusinessMembership).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("locks the row (SELECT … FOR UPDATE) inside a transaction before the audit diff", async () => {
    mockSelectLimit.mockResolvedValue([{ preferredVatCode: "N2" }]);

    await updateBusiness(makeBusinessFormData({ preferredVatCode: "22" }));

    // The whole flow must run inside a transaction.
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // The pessimistic lock on the businesses row must be requested before
    // the UPDATE: without it, two concurrent updates would race on the
    // audit log "oldVatCode" diff.
    expect(mockSelectFor).toHaveBeenCalledWith("update");
  });

  it("does NOT touch preferredVatCode when the field is absent from FormData", async () => {
    // Stale client omits the field — must preserve the existing value AND
    // skip the audit log (no deliberate change to track).
    mockSelectLimit.mockResolvedValue([{ preferredVatCode: "22" }]);

    const result = await updateBusiness(makeBusinessFormData());

    expect(result.error).toBeUndefined();
    // Update payload must not contain preferredVatCode at all
    const updatePayload = mockUpdateSet.mock.calls[0]?.[0];
    expect(updatePayload).not.toHaveProperty("preferredVatCode");
    // No SELECT for audit diff when the field is absent
    expect(mockSelect).not.toHaveBeenCalled();
    // No audit log
    expect(logger.info as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});
