// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAdmin,
  mockGetAdminUserKpis,
  mockGetAdminDocumentKpis,
  mockGetAdminTopMerchants,
  mockGetAdminPaidUsers,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetAdminUserKpis: vi.fn(),
  mockGetAdminDocumentKpis: vi.fn(),
  mockGetAdminTopMerchants: vi.fn(),
  mockGetAdminPaidUsers: vi.fn(),
}));

vi.mock("./admin-guard", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("./admin-metrics", () => ({
  getAdminUserKpis: (...args: unknown[]) => mockGetAdminUserKpis(...args),
  getAdminDocumentKpis: (...args: unknown[]) =>
    mockGetAdminDocumentKpis(...args),
}));

vi.mock("./admin-directory", () => ({
  getAdminTopMerchants: (...args: unknown[]) =>
    mockGetAdminTopMerchants(...args),
  getAdminPaidUsers: (...args: unknown[]) => mockGetAdminPaidUsers(...args),
}));

import {
  loadAdminDocumentKpis,
  loadAdminPaidUsers,
  loadAdminTopMerchants,
  loadAdminUserKpis,
} from "./admin-actions";

const READS = [
  mockGetAdminUserKpis,
  mockGetAdminDocumentKpis,
  mockGetAdminTopMerchants,
  mockGetAdminPaidUsers,
];

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ id: "u-admin" });
  for (const read of READS) read.mockResolvedValue({ ok: true });
});

const RANGED = [
  ["nuovi utenti", loadAdminUserKpis, mockGetAdminUserKpis],
  ["scontrini e incasso", loadAdminDocumentKpis, mockGetAdminDocumentKpis],
  ["classifiche esercenti", loadAdminTopMerchants, mockGetAdminTopMerchants],
] as const;

describe("azioni su richiesta con periodo", () => {
  it.each(RANGED)(
    "%s: passa alla lettura il periodo validato e ne restituisce il risultato",
    async (_, action, read) => {
      const result = await action("30d");

      expect(read).toHaveBeenCalledWith("30d");
      expect(result).toEqual({ ok: true });
    },
  );

  it.each(RANGED)(
    "%s: rifiuta un periodo fuori allowlist senza leggere nulla",
    async (_, action, read) => {
      for (const raw of ["'; DROP TABLE profiles;--", "", 30, null, {}]) {
        expect(await action(raw)).toEqual({ error: "Periodo non valido." });
      }
      expect(read).not.toHaveBeenCalled();
    },
  );

  it.each(RANGED)(
    "%s: un non-admin riceve un errore e non arriva alla lettura",
    async (_, action, read) => {
      mockRequireAdmin.mockRejectedValue(new Error("forbidden"));

      expect(await action("7d")).toEqual({
        error: "Accesso non consentito.",
      });
      expect(read).not.toHaveBeenCalled();
    },
  );
});

describe("loadAdminPaidUsers", () => {
  it("restituisce la lettura degli utenti paganti", async () => {
    expect(await loadAdminPaidUsers()).toEqual({ ok: true });
    expect(mockGetAdminPaidUsers).toHaveBeenCalledWith();
  });

  it("un non-admin riceve un errore e non arriva alla lettura", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("unauthenticated"));

    expect(await loadAdminPaidUsers()).toEqual({
      error: "Accesso non consentito.",
    });
    expect(mockGetAdminPaidUsers).not.toHaveBeenCalled();
  });
});

describe("gate prima del periodo", () => {
  it("verifica l'admin anche quando il periodo è invalido", async () => {
    // Un non-admin non deve poter distinguere un periodo valido da uno
    // invalido: la prima risposta che riceve è sempre il rifiuto.
    mockRequireAdmin.mockRejectedValue(new Error("forbidden"));

    expect(await loadAdminUserKpis("boh")).toEqual({
      error: "Accesso non consentito.",
    });
  });
});
