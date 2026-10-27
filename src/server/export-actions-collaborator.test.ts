// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Export GDPR del collaboratore (issue #1099): i suoi dati personali, non i
 * documenti dell'attività. Suite separata da `export-actions.test.ts`, che
 * mocka lo schema del solo titolare.
 */

const { mockGetAuthenticatedUser, mockLimit, mockLoggerError } = vi.hoisted(
  () => ({
    mockGetAuthenticatedUser: vi.fn(),
    mockLimit: vi.fn(),
    mockLoggerError: vi.fn(),
  }),
);

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
}));
vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => {
      const chain = {
        from: () => chain,
        innerJoin: () => chain,
        where: () => chain,
        limit: mockLimit,
      };
      return chain;
    },
  }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: mockLoggerError },
}));

import { UnauthenticatedError } from "@/lib/auth-errors";
import { exportCollaboratorData } from "./export-actions";

const ROW = {
  name: "Anna Bianchi",
  email: "anna@example.com",
  joinedAt: new Date("2026-10-20T08:00:00Z"),
  termsAcceptedAt: new Date("2026-10-20T08:00:00Z"),
  termsVersion: "v01",
  collaboratorTermsVersion: "v01",
  lastSeenAt: new Date("2026-10-26T08:00:00Z"),
  businessName: "Bar Centrale",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthenticatedUser.mockResolvedValue({ id: "collab-auth" });
  mockLimit.mockResolvedValue([ROW]);
});

describe("exportCollaboratorData", () => {
  it("esporta i dati personali del collaboratore e il nome dell'attività", async () => {
    const result = await exportCollaboratorData();

    expect(result.error).toBeUndefined();
    expect(result.data?.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.data?.collaborator).toEqual({
      name: "Anna Bianchi",
      email: "anna@example.com",
      joinedAt: ROW.joinedAt,
      termsAcceptedAt: ROW.termsAcceptedAt,
      termsVersion: "v01",
      collaboratorTermsVersion: "v01",
      lastSeenAt: ROW.lastSeenAt,
    });
    expect(result.data?.business).toEqual({ businessName: "Bar Centrale" });
  });

  // I documenti sono dell'attività: li esporta il titolare (decisione sulla
  // issue, "Export GDPR art. 20").
  it("non porta documenti né catalogo dell'attività", async () => {
    const result = await exportCollaboratorData();

    expect(result.data).not.toHaveProperty("receipts");
    expect(result.data).not.toHaveProperty("catalogItems");
  });

  it("senza sessione risponde Non autenticato", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new UnauthenticatedError());

    await expect(exportCollaboratorData()).resolves.toEqual({
      error: "Non autenticato.",
    });
  });

  it("chi non è collaboratore non riceve nulla", async () => {
    mockLimit.mockResolvedValue([]);

    await expect(exportCollaboratorData()).resolves.toEqual({
      error: "Nessun dato da collaboratore per questo account.",
    });
  });

  it("degrada se la lettura fallisce", async () => {
    mockLimit.mockRejectedValue(new Error("DB down"));

    const result = await exportCollaboratorData();

    expect(result.error).toBe(
      "Servizio temporaneamente non disponibile. Riprova.",
    );
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
