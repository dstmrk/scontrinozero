// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const { mockSelect, mockSendEmail, mockLoggerWarn } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockSendEmail: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("@/db", () => ({ getDb: () => ({ select: mockSelect }) }));
vi.mock("@/lib/email", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: mockLoggerWarn, error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/trusted-app-url", () => ({
  getTrustedAppUrl: () => "https://app.test",
}));

import { notifyOwnerOfAdeRejection } from "./ade-rejection-notice";

const BIZ = "11111111-1111-4111-8111-111111111111";
const VERSION = new Date("2026-10-28T09:15:00.123Z");
const dialect = new PgDialect();

type Builder = {
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

function builder(rows: unknown[]): Builder {
  const b = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  b.from.mockReturnValue(b);
  b.innerJoin.mockReturnValue(b);
  b.where.mockReturnValue(b);
  return b;
}

/** Prima query: il titolare; seconda: un collaboratore con l'accesso. */
function givenDb(
  owner: { email: string | null; businessName: string | null } | null,
  hasCollaborator: boolean,
) {
  const ownerQuery = builder(owner ? [owner] : []);
  const collaboratorQuery = builder(hasCollaborator ? [{ id: "m-1" }] : []);
  mockSelect
    .mockReturnValueOnce(ownerQuery)
    .mockReturnValueOnce(collaboratorQuery);
  return { ownerQuery, collaboratorQuery };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmail.mockResolvedValue(undefined);
});

describe("notifyOwnerOfAdeRejection", () => {
  it("con collaboratori scrive al titolare, una volta per versione delle credenziali", async () => {
    givenDb(
      { email: "titolare@example.com", businessName: "Bar Centrale" },
      true,
    );

    await notifyOwnerOfAdeRejection({
      businessId: BIZ,
      outcome: "password_expired",
      credentialVersion: VERSION,
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const sent = mockSendEmail.mock.calls[0]?.[0];
    expect(sent).toMatchObject({
      to: "titolare@example.com",
      subject: "La password Fisconline di Bar Centrale è scaduta",
      idempotencyKey: `ade-credentials-rejected/${BIZ}/${VERSION.toISOString()}`,
    });
    expect(sent.react.props).toEqual({
      businessName: "Bar Centrale",
      outcome: "password_expired",
      settingsUrl: "https://app.test/dashboard/settings",
    });
  });

  it("conta solo i collaboratori che hanno ancora un accesso", async () => {
    const { collaboratorQuery } = givenDb(
      { email: "titolare@example.com", businessName: null },
      true,
    );

    await notifyOwnerOfAdeRejection({
      businessId: BIZ,
      outcome: "auth_error",
      credentialVersion: VERSION,
    });

    const condition = dialect.sqlToQuery(
      collaboratorQuery.where.mock.calls[0]?.[0] as SQL,
    );
    expect(condition.sql).toMatch(/"role" = \$\d/);
    expect(condition.sql).toMatch(/"auth_user_id" is not null/);
    expect(condition.params).toEqual(
      expect.arrayContaining([BIZ, "collaborator"]),
    );
  });

  it("senza collaboratori non scrive: il titolare vede già l'errore alla cassa", async () => {
    givenDb({ email: "titolare@example.com", businessName: "Bar" }, false);

    await notifyOwnerOfAdeRejection({
      businessId: BIZ,
      outcome: "account_locked",
      credentialVersion: VERSION,
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it.each([
    ["senza titolare", null],
    ["senza email del titolare", { email: null, businessName: "Bar" }],
  ])("%s non scrive", async (_label, owner) => {
    givenDb(owner, true);

    await notifyOwnerOfAdeRejection({
      businessId: BIZ,
      outcome: "auth_error",
      credentialVersion: VERSION,
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("un invio fallito non lancia: il rifiuto dell'AdE resta la notizia", async () => {
    givenDb({ email: "titolare@example.com", businessName: "Bar" }, true);
    mockSendEmail.mockRejectedValue(new Error("Resend down"));

    await expect(
      notifyOwnerOfAdeRejection({
        businessId: BIZ,
        outcome: "password_expired",
        credentialVersion: VERSION,
      }),
    ).resolves.toBeUndefined();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BIZ, outcome: "password_expired" }),
      expect.any(String),
    );
  });

  it("una lettura fallita non lancia", async () => {
    mockSelect.mockImplementation(() => {
      throw new Error("DB down");
    });

    await expect(
      notifyOwnerOfAdeRejection({
        businessId: BIZ,
        outcome: "auth_error",
        credentialVersion: VERSION,
      }),
    ).resolves.toBeUndefined();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
