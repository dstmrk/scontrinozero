// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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
  // il throw, così un gate che dimenticasse il `return` verrebbe smascherato
  // dal render che prosegue.
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

import AdminLayout from "./layout";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminLayout — gate operatore", () => {
  it("rende il pannello per un'email in allowlist", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "u1",
      email: "marco@scontrinozero.it",
    });
    mockIsAdminEmail.mockReturnValue(true);

    render(await AdminLayout({ children: <p>contenuto</p> }));

    expect(screen.getByText("contenuto")).toBeInTheDocument();
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("risponde 404 (non 403) a un utente autenticato ma non operatore", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "u2",
      email: "cliente@example.com",
    });
    mockIsAdminEmail.mockReturnValue(false);

    await expect(AdminLayout({ children: <p>contenuto</p> })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    // 404 e non 403: un 403 confermerebbe a chiunque che /admin esiste.
    expect(mockNotFound).toHaveBeenCalled();
  });

  it("logga a warn il tentativo non autorizzato, senza aprire una issue Sentry", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "u2",
      email: "cliente@example.com",
    });
    mockIsAdminEmail.mockReturnValue(false);

    await expect(AdminLayout({ children: <p>contenuto</p> })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "admin_forbidden", userId: "u2" }),
      expect.any(String),
    );
  });

  it("non logga l'email del richiedente (denylist telemetria)", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "u2",
      email: "cliente@example.com",
    });
    mockIsAdminEmail.mockReturnValue(false);

    await expect(AdminLayout({ children: <p>contenuto</p> })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(JSON.stringify(mockLoggerWarn.mock.calls)).not.toContain(
      "cliente@example.com",
    );
  });

  it("manda al login chi non è autenticato", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new Error("Not authenticated"));

    await expect(AdminLayout({ children: <p>contenuto</p> })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mockRedirect).toHaveBeenCalledWith("/login");
    expect(mockIsAdminEmail).not.toHaveBeenCalled();
  });

  it("chiude il gate quando la sessione non porta un'email", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ id: "u3", email: undefined });
    mockIsAdminEmail.mockReturnValue(false);

    await expect(AdminLayout({ children: <p>contenuto</p> })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockIsAdminEmail).toHaveBeenCalledWith(undefined);
  });
});
