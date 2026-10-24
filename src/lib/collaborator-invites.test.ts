// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock("@/db", () => ({ getDb: () => ({ select: mockSelect }) }));

import {
  countTeamSeats,
  emailHasAccount,
  findInviteByToken,
  generateInviteToken,
  hasCollaboratorsOrOpenInvites,
  hashInviteToken,
  inviteAcceptUrl,
  isInviteTokenShape,
  listTeam,
  ownerInviteBlocker,
} from "./collaborator-invites";

/**
 * Catena `select().from().[innerJoin()].where()` chiusa da `limit()` o da
 * `orderBy()`, che risolvono `rows`.
 */
function selectReturning(rows: unknown[]) {
  const chain = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

const BIZ = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("token dell'invito", () => {
  it("genera un token di 43 caratteri base64url e ne salva solo l'hash", () => {
    const { token, tokenHash } = generateInviteToken();

    expect(isInviteTokenShape(token)).toBe(true);
    expect(tokenHash).toBe(hashInviteToken(token));
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
  });

  it("due token non coincidono", () => {
    expect(generateInviteToken().token).not.toBe(generateInviteToken().token);
  });

  it.each([
    ["vuoto", ""],
    ["troppo corto", "a".repeat(42)],
    ["troppo lungo", "a".repeat(44)],
    ["con caratteri fuori alfabeto", `${"a".repeat(42)}=`],
    ["non stringa", 42],
  ])("rifiuta un token %s", (_label, value) => {
    expect(isInviteTokenShape(value)).toBe(false);
  });
});

describe("inviteAcceptUrl", () => {
  it("punta alla pagina d'invito sul dominio dell'app", () => {
    vi.stubEnv("APP_HOSTNAME", "app-dev.scontrinozero.it");

    expect(inviteAcceptUrl("tok")).toBe(
      "https://app-dev.scontrinozero.it/invito/tok",
    );
  });
});

describe("findInviteByToken", () => {
  it("cerca per hash e restituisce l'invito col nome dell'attività", async () => {
    const invite = {
      id: "inv-1",
      businessId: BIZ,
      email: "anna@example.com",
      expiresAt: new Date("2026-10-31T10:00:00Z"),
      businessName: "Bar Centrale",
    };
    const chain = selectReturning([invite]);
    mockSelect.mockReturnValue(chain);

    await expect(findInviteByToken("tok")).resolves.toEqual(invite);
    expect(chain.innerJoin).toHaveBeenCalledTimes(1);
  });

  it("null se nessun invito ha quell'hash", async () => {
    mockSelect.mockReturnValue(selectReturning([]));

    await expect(findInviteByToken("tok")).resolves.toBeNull();
  });
});

describe("hasCollaboratorsOrOpenInvites", () => {
  it("false senza collaboratori né inviti validi", async () => {
    mockSelect.mockReturnValue(selectReturning([]));

    await expect(hasCollaboratorsOrOpenInvites(BIZ)).resolves.toBe(false);
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it("true con un collaboratore", async () => {
    mockSelect
      .mockReturnValueOnce(selectReturning([{ id: "m-1" }]))
      .mockReturnValueOnce(selectReturning([]));

    await expect(hasCollaboratorsOrOpenInvites(BIZ)).resolves.toBe(true);
  });

  it("true con un invito non ancora scaduto", async () => {
    mockSelect
      .mockReturnValueOnce(selectReturning([]))
      .mockReturnValueOnce(selectReturning([{ id: "inv-1" }]));

    await expect(hasCollaboratorsOrOpenInvites(BIZ)).resolves.toBe(true);
  });
});

describe("countTeamSeats", () => {
  it("conta collaboratori e inviti validi, escluso quello per l'email data", async () => {
    const members = selectReturning([]);
    members.where = vi.fn().mockResolvedValue([{ value: 1 }]);
    const invites = selectReturning([]);
    invites.where = vi.fn().mockResolvedValue([{ value: 2 }]);
    mockSelect.mockReturnValueOnce(members).mockReturnValueOnce(invites);

    await expect(countTeamSeats(BIZ, "anna@example.com")).resolves.toEqual({
      members: 1,
      openInvites: 2,
    });
  });
});

describe("emailHasAccount", () => {
  it("false se l'email non è né di un titolare né di un collaboratore", async () => {
    mockSelect.mockReturnValue(selectReturning([]));

    await expect(emailHasAccount("anna@example.com")).resolves.toBe(false);
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it("true se è l'email di un titolare", async () => {
    mockSelect
      .mockReturnValueOnce(selectReturning([{ id: "p-1" }]))
      .mockReturnValueOnce(selectReturning([]));

    await expect(emailHasAccount("anna@example.com")).resolves.toBe(true);
  });

  it("true se è l'email di un collaboratore con un account", async () => {
    mockSelect
      .mockReturnValueOnce(selectReturning([]))
      .mockReturnValueOnce(selectReturning([{ id: "m-1" }]));

    await expect(emailHasAccount("anna@example.com")).resolves.toBe(true);
  });
});

describe("listTeam", () => {
  it("restituisce collaboratori e inviti dell'attività, segnando gli scaduti", async () => {
    const members = [{ id: "m-1", name: "Anna", email: "anna@example.com" }];
    const valid = {
      id: "inv-1",
      email: "luca@example.com",
      expiresAt: new Date(Date.now() + 60 * 1000),
    };
    const expired = {
      id: "inv-2",
      email: "sara@example.com",
      expiresAt: new Date(Date.now() - 60 * 1000),
    };
    mockSelect
      .mockReturnValueOnce(selectReturning(members))
      .mockReturnValueOnce(selectReturning([valid, expired]));

    await expect(listTeam(BIZ)).resolves.toEqual({
      members,
      invites: [
        { ...valid, expired: false },
        { ...expired, expired: true },
      ],
    });
  });
});

describe("ownerInviteBlocker", () => {
  const TEAM = {
    plan: "team",
    trialStartedAt: null,
    planExpiresAt: null,
  } as const;
  const READY = {
    collaboratorTermsVersion: "v01",
    loginMethod: "fisconline",
    verifiedAt: new Date("2026-10-01T10:00:00Z"),
  };

  it("null quando il titolare può invitare", () => {
    expect(ownerInviteBlocker(TEAM, READY)).toBeNull();
  });

  it("un passo alla volta: piano, poi Fisconline, poi condizioni", () => {
    const nothing = {
      collaboratorTermsVersion: null,
      loginMethod: "cie",
      verifiedAt: null,
    };
    const pro = { ...TEAM, plan: "pro" } as const;

    expect(ownerInviteBlocker(pro, nothing)?.step).toBe("plan");
    expect(ownerInviteBlocker(TEAM, nothing)?.step).toBe("fisconline");
    expect(
      ownerInviteBlocker(TEAM, { ...READY, collaboratorTermsVersion: null })
        ?.step,
    ).toBe("terms");
  });

  it("Fisconline salvate ma non verificate non bastano", () => {
    expect(ownerInviteBlocker(TEAM, { ...READY, verifiedAt: null })?.step).toBe(
      "fisconline",
    );
  });

  it("una versione vecchia delle condizioni va riaccettata", () => {
    expect(
      ownerInviteBlocker(TEAM, { ...READY, collaboratorTermsVersion: "v00" })
        ?.step,
    ).toBe("terms");
  });
});
