// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSelect,
  mockGetPlanSafe,
  mockListCollaboratorAccounts,
  mockSendEmail,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockGetPlanSafe: vi.fn(),
  mockListCollaboratorAccounts: vi.fn(),
  mockSendEmail: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("@/db", () => ({ getDb: () => ({ select: mockSelect }) }));
vi.mock("@/lib/plans", () => ({ getPlanSafe: mockGetPlanSafe }));
vi.mock("./collaborator-account", () => ({
  listCollaboratorAccounts: mockListCollaboratorAccounts,
}));
vi.mock("@/lib/email", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: mockLoggerWarn, error: vi.fn(), info: vi.fn() },
}));

import { notifyCollaboratorsOfSuspension } from "./collaborator-suspension-notice";

const OWNER = "owner-auth";
const BIZ = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-28T13:40:00Z");

function planIs(plan: string, trialStartedAt: Date | null = null) {
  mockGetPlanSafe.mockResolvedValue({
    ok: true,
    info: { plan, trialStartedAt, planExpiresAt: null },
  });
}

function businessIs(rows: { id: string }[]) {
  const b = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  b.from.mockReturnValue(b);
  b.innerJoin.mockReturnValue(b);
  b.where.mockReturnValue(b);
  mockSelect.mockReturnValue(b);
}

function account(memberId: string, email: string | null) {
  return {
    memberId,
    authUserId: `auth-${memberId}`,
    email,
    businessId: BIZ,
    businessName: "Bar Centrale",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  mockSendEmail.mockResolvedValue(undefined);
  businessIs([{ id: BIZ }]);
  mockListCollaboratorAccounts.mockResolvedValue([
    account("m-1", "anna@example.com"),
    account("m-2", "luca@example.com"),
  ]);
});

describe("notifyCollaboratorsOfSuspension", () => {
  it("con un piano senza collaboratori scrive a ciascuno, una volta al giorno", async () => {
    planIs("pro");

    await notifyCollaboratorsOfSuspension(OWNER);

    expect(mockListCollaboratorAccounts).toHaveBeenCalledWith(BIZ);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "anna@example.com",
        subject: "Il piano di Bar Centrale non include più i collaboratori",
        idempotencyKey: "collaborator-suspended/m-1/2026-10-28",
      }),
    );
    expect(mockSendEmail.mock.calls[1]?.[0].to).toBe("luca@example.com");
  });

  it("con la prova ancora in corso non scrive: i collaboratori emettono", async () => {
    // Team annullato durante la prova: il webhook rimette `trial`, e una
    // prova di ieri ammette ancora i collaboratori.
    planIs("trial", new Date("2026-10-27T10:00:00Z"));

    await notifyCollaboratorsOfSuspension(OWNER);

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockListCollaboratorAccounts).not.toHaveBeenCalled();
  });

  it.each(["team", "unlimited"])("col piano %s non scrive", async (plan) => {
    planIs(plan);

    await notifyCollaboratorsOfSuspension(OWNER);

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("scrive una email alla volta: Resend accetta 10 richieste al secondo", async () => {
    planIs("pro");
    let releaseFirst: () => void = () => {};
    mockSendEmail.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );

    const done = notifyCollaboratorsOfSuspension(OWNER);
    await vi.waitFor(() => expect(mockSendEmail).toHaveBeenCalledTimes(1));
    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    releaseFirst();
    await done;
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it("un collaboratore senza email si salta, gli altri ricevono", async () => {
    planIs("starter");
    mockListCollaboratorAccounts.mockResolvedValue([
      account("m-1", null),
      account("m-2", "luca@example.com"),
    ]);

    await notifyCollaboratorsOfSuspension(OWNER);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0]?.[0].to).toBe("luca@example.com");
  });

  it("un invio fallito non ferma gli altri e non lancia", async () => {
    planIs("pro");
    mockSendEmail
      .mockRejectedValueOnce(new Error("Resend down"))
      .mockResolvedValueOnce(undefined);

    await expect(notifyCollaboratorsOfSuspension(OWNER)).resolves.toBe(
      undefined,
    );
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: "m-1" }),
      expect.any(String),
    );
  });

  it("senza attività non scrive", async () => {
    planIs("pro");
    businessIs([]);

    await notifyCollaboratorsOfSuspension(OWNER);

    expect(mockListCollaboratorAccounts).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("un piano illeggibile non scrive e non lancia", async () => {
    mockGetPlanSafe.mockResolvedValue({ ok: false, error: "boom" });

    await notifyCollaboratorsOfSuspension(OWNER);

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("un errore imprevisto non lancia", async () => {
    mockGetPlanSafe.mockRejectedValue(new Error("DB down"));

    await expect(notifyCollaboratorsOfSuspension(OWNER)).resolves.toBe(
      undefined,
    );
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ ownerAuthUserId: OWNER }),
      expect.any(String),
    );
  });
});
