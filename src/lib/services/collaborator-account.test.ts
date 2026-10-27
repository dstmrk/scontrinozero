// @vitest-environment node
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSelect,
  mockUpdate,
  mockDeleteAuthUser,
  mockSendEmail,
  mockLoggerError,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockDeleteAuthUser: vi.fn(),
  mockSendEmail: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => ({ select: mockSelect, update: mockUpdate }),
}));
vi.mock("./auth-user-delete", () => ({ deleteAuthUser: mockDeleteAuthUser }));
vi.mock("@/lib/email", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/logger", () => ({
  logger: { error: mockLoggerError, warn: mockLoggerWarn, info: vi.fn() },
}));

import {
  findCollaboratorAccount,
  listCollaboratorAccounts,
  notifyCollaboratorAccessEnded,
  removeCollaboratorAccount,
  type CollaboratorAccount,
} from "./collaborator-account";

const BIZ = "11111111-1111-4111-8111-111111111111";
const ACCOUNT: CollaboratorAccount = {
  memberId: "member-1",
  authUserId: "collab-auth",
  email: "anna@example.com",
  businessId: BIZ,
  businessName: "Bar Centrale",
};

function selectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn((_condition: SQL) => chain),
    limit: vi.fn().mockResolvedValue(rows),
    then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
  };
  return chain;
}

let updateSet: ReturnType<typeof vi.fn>;
let updateWhere: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockDeleteAuthUser.mockResolvedValue(true);
  mockSendEmail.mockResolvedValue(undefined);
  updateWhere = vi.fn().mockResolvedValue(undefined);
  updateSet = vi.fn(() => ({ where: updateWhere }));
  mockUpdate.mockReturnValue({ set: updateSet });
});

describe("findCollaboratorAccount", () => {
  it("cerca il collaboratore con un account per auth user", async () => {
    const chain = selectChain([ACCOUNT]);
    mockSelect.mockReturnValue(chain);

    await expect(
      findCollaboratorAccount({ authUserId: "collab-auth" }),
    ).resolves.toEqual(ACCOUNT);
    const { sql, params } = new PgDialect().sqlToQuery(
      chain.where.mock.calls[0][0],
    );
    expect(params).toContain("collab-auth");
    expect(params).toContain("collaborator");
    expect(sql).toContain('"auth_user_id" is not null');
  });

  it("o per membro e attività, così un titolare non tocca membri altrui", async () => {
    const chain = selectChain([ACCOUNT]);
    mockSelect.mockReturnValue(chain);

    await findCollaboratorAccount({ memberId: "member-1", businessId: BIZ });

    const { params } = new PgDialect().sqlToQuery(chain.where.mock.calls[0][0]);
    expect(params).toEqual(expect.arrayContaining(["member-1", BIZ]));
  });

  it("null se non c'è", async () => {
    mockSelect.mockReturnValue(selectChain([]));

    await expect(
      findCollaboratorAccount({ authUserId: "nessuno" }),
    ).resolves.toBeNull();
  });
});

describe("listCollaboratorAccounts", () => {
  it("restituisce i collaboratori con un account dell'attività", async () => {
    mockSelect.mockReturnValue(selectChain([ACCOUNT]));

    await expect(listCollaboratorAccounts(BIZ)).resolves.toEqual([ACCOUNT]);
  });
});

describe("removeCollaboratorAccount", () => {
  it("cancella l'account auth, poi stacca la riga tenendo il nome", async () => {
    const order: string[] = [];
    mockDeleteAuthUser.mockImplementation(async () => {
      order.push("auth");
      return true;
    });
    updateWhere.mockImplementation(async () => {
      order.push("member");
    });

    await expect(removeCollaboratorAccount(ACCOUNT)).resolves.toBe(true);

    expect(mockDeleteAuthUser).toHaveBeenCalledWith("collab-auth");
    expect(order).toEqual(["auth", "member"]);
    expect(updateSet).toHaveBeenCalledWith({
      authUserId: null,
      email: null,
      lastSeenAt: null,
    });
  });

  it("se l'account auth non si cancella, la riga resta com'è", async () => {
    mockDeleteAuthUser.mockResolvedValue(false);

    await expect(removeCollaboratorAccount(ACCOUNT)).resolves.toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // L'account non esiste più, quindi l'accesso è chiuso: la riga sporca si
  // ripulisce rimuovendo di nuovo, perché l'auth user assente conta come
  // cancellato.
  it("se la riga non si aggiorna, l'accesso è chiuso comunque: true con un error critico", async () => {
    updateWhere.mockRejectedValue(new Error("DB down"));

    await expect(removeCollaboratorAccount(ACCOUNT)).resolves.toBe(true);
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ critical: true, memberId: "member-1" }),
      expect.any(String),
    );
  });
});

describe("notifyCollaboratorAccessEnded", () => {
  it("manda l'email col motivo all'indirizzo del collaboratore", async () => {
    notifyCollaboratorAccessEnded(ACCOUNT, "removed");
    await Promise.resolve();

    const email = mockSendEmail.mock.calls[0][0];
    expect(email.to).toBe("anna@example.com");
    expect(email.subject).toBe("Il tuo accesso a Bar Centrale è stato rimosso");
    expect(email.react.props).toEqual({
      businessName: "Bar Centrale",
      reason: "removed",
    });
  });

  it("senza email non manda nulla", () => {
    notifyCollaboratorAccessEnded({ ...ACCOUNT, email: null }, "left");

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("un invio fallito resta un warn", async () => {
    mockSendEmail.mockRejectedValue(new Error("Resend down"));

    notifyCollaboratorAccessEnded(ACCOUNT, "left");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockLoggerWarn).toHaveBeenCalled();
  });
});
