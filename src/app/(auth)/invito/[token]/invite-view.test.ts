// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindInviteByToken } = vi.hoisted(() => ({
  mockFindInviteByToken: vi.fn(),
}));

vi.mock("@/lib/collaborator-invites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/collaborator-invites")>()),
  findInviteByToken: mockFindInviteByToken,
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { readInviteView } from "./invite-view";

const TOKEN = "a".repeat(43);
const INVITE = {
  id: "inv-1",
  businessId: "11111111-1111-4111-8111-111111111111",
  email: "anna@example.com",
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  businessName: "Bar Centrale",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindInviteByToken.mockResolvedValue(INVITE);
});

describe("readInviteView", () => {
  it("valido: restituisce l'invito trovato col token", async () => {
    await expect(readInviteView(TOKEN)).resolves.toEqual({
      kind: "valid",
      invite: INVITE,
    });
    expect(mockFindInviteByToken).toHaveBeenCalledWith(TOKEN);
  });

  it("un token malformato non arriva al DB", async () => {
    await expect(readInviteView("corto")).resolves.toEqual({
      kind: "missing",
    });
    expect(mockFindInviteByToken).not.toHaveBeenCalled();
  });

  it("inesistente: revocato, sostituito o già usato", async () => {
    mockFindInviteByToken.mockResolvedValue(null);

    await expect(readInviteView(TOKEN)).resolves.toEqual({ kind: "missing" });
  });

  it("scaduto: porta il nome dell'attività", async () => {
    mockFindInviteByToken.mockResolvedValue({
      ...INVITE,
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    await expect(readInviteView(TOKEN)).resolves.toEqual({
      kind: "expired",
      businessName: "Bar Centrale",
    });
  });

  it("errore di lettura: degrada invece di lanciare", async () => {
    mockFindInviteByToken.mockRejectedValue(new Error("DB down"));

    await expect(readInviteView(TOKEN)).resolves.toEqual({ kind: "error" });
  });
});
