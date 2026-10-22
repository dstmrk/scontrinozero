// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetAuthenticatedUser,
  mockIsAdminEmail,
  mockNotFound,
  mockRedirect,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockIsAdminEmail: vi.fn(),
  // `notFound()` e `redirect()` di Next funzionano LANCIANDO: i mock replicano
  // il throw, così un gate che dimenticasse il `return` verrebbe smascherato.
  mockNotFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  mockRedirect: vi.fn((..._args: unknown[]) => {
    throw new Error("NEXT_REDIRECT");
  }),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => mockNotFound(),
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: (...args: unknown[]) =>
    mockGetAuthenticatedUser(...args),
}));

vi.mock("@/lib/admin-gate", () => ({
  isAdminEmail: (...args: unknown[]) => mockIsAdminEmail(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: mockLoggerWarn, error: vi.fn(), info: vi.fn() },
}));

import {
  AdminAccessError,
  requireAdmin,
  requireAdminOrNotFound,
} from "./admin-guard";

const ADMIN = { id: "u-admin", email: "marco@scontrinozero.it" };
const MERCHANT = { id: "u-merchant", email: "cliente@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAdmin", () => {
  it("restituisce l'utente quando l'email è in allowlist", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(ADMIN);
    mockIsAdminEmail.mockReturnValue(true);

    await expect(requireAdmin()).resolves.toBe(ADMIN);
    expect(mockIsAdminEmail).toHaveBeenCalledWith(ADMIN.email);
  });

  it("senza sessione lancia AdminAccessError('unauthenticated')", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new Error("Not authenticated"));

    await expect(requireAdmin()).rejects.toMatchObject({
      name: "AdminAccessError",
      reason: "unauthenticated",
    });
    expect(mockIsAdminEmail).not.toHaveBeenCalled();
  });

  it("con email fuori allowlist lancia AdminAccessError('forbidden') e logga warn con il solo user id", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(MERCHANT);
    mockIsAdminEmail.mockReturnValue(false);

    await expect(requireAdmin()).rejects.toMatchObject({
      reason: "forbidden",
    });
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    const [fields] = mockLoggerWarn.mock.calls[0];
    // Regola 20: warn, non error. Denylist telemetria: mai l'email.
    expect(fields).toEqual({
      errorClass: "admin_forbidden",
      userId: MERCHANT.id,
    });
    expect(JSON.stringify(fields)).not.toContain(MERCHANT.email);
  });

  it("l'errore è un'istanza di AdminAccessError", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(MERCHANT);
    mockIsAdminEmail.mockReturnValue(false);

    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminAccessError);
  });
});

describe("requireAdminOrNotFound", () => {
  it("restituisce l'utente per un admin", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(ADMIN);
    mockIsAdminEmail.mockReturnValue(true);

    await expect(requireAdminOrNotFound()).resolves.toBe(ADMIN);
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("senza sessione rimanda al login", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new Error("Not authenticated"));

    await expect(requireAdminOrNotFound()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("fuori allowlist risponde 404, non 403", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(MERCHANT);
    mockIsAdminEmail.mockReturnValue(false);

    await expect(requireAdminOrNotFound()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it("non maschera un errore inatteso come 404", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(ADMIN);
    mockIsAdminEmail.mockImplementation(() => {
      throw new TypeError("boom");
    });

    await expect(requireAdminOrNotFound()).rejects.toThrow("boom");
    expect(mockNotFound).not.toHaveBeenCalled();
  });
});
