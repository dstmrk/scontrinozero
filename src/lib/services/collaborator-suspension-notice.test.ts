// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSelect,
  mockGetPlanSafe,
  mockListCollaboratorAccounts,
  mockSendEmailsInSequence,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockGetPlanSafe: vi.fn(),
  mockListCollaboratorAccounts: vi.fn(),
  mockSendEmailsInSequence: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("@/db", () => ({ getDb: () => ({ select: mockSelect }) }));
vi.mock("@/lib/plans", () => ({ getPlanSafe: mockGetPlanSafe }));
vi.mock("./collaborator-account", () => ({
  listCollaboratorAccounts: mockListCollaboratorAccounts,
}));
vi.mock("@/lib/email", () => ({
  sendEmailsInSequence: mockSendEmailsInSequence,
}));
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

function sentMessages(): { to: string; idempotencyKey?: string }[] {
  return mockSendEmailsInSequence.mock.calls[0]?.[0] ?? [];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  mockSendEmailsInSequence.mockResolvedValue(undefined);
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
    // In sequenza, con `sendEmailsInSequence`: il suo test fissa l'attesa.
    expect(mockSendEmailsInSequence).toHaveBeenCalledTimes(1);
    expect(sentMessages()).toEqual([
      expect.objectContaining({
        to: "anna@example.com",
        subject: "Il piano di Bar Centrale non include più i collaboratori",
        idempotencyKey: "collaborator-suspended/m-1/2026-10-28",
      }),
      expect.objectContaining({
        to: "luca@example.com",
        idempotencyKey: "collaborator-suspended/m-2/2026-10-28",
      }),
    ]);
  });

  it("con la prova ancora in corso non scrive: i collaboratori emettono", async () => {
    // Team annullato durante la prova: il webhook rimette `trial`, e una
    // prova di ieri ammette ancora i collaboratori.
    planIs("trial", new Date("2026-10-27T10:00:00Z"));

    await notifyCollaboratorsOfSuspension(OWNER);

    expect(mockSendEmailsInSequence).not.toHaveBeenCalled();
    expect(mockListCollaboratorAccounts).not.toHaveBeenCalled();
  });

  it.each(["team", "unlimited"])("col piano %s non scrive", async (plan) => {
    planIs(plan);

    await notifyCollaboratorsOfSuspension(OWNER);

    expect(mockSendEmailsInSequence).not.toHaveBeenCalled();
  });

  it("un collaboratore senza email si salta, gli altri ricevono", async () => {
    planIs("starter");
    mockListCollaboratorAccounts.mockResolvedValue([
      account("m-1", null),
      account("m-2", "luca@example.com"),
    ]);

    await notifyCollaboratorsOfSuspension(OWNER);

    expect(sentMessages().map((m) => m.to)).toEqual(["luca@example.com"]);
  });

  it("un invio fallito resta un warn con il membro, e non lancia", async () => {
    planIs("pro");
    mockSendEmailsInSequence.mockImplementation(
      async (_messages: unknown, onError: (err: unknown, i: number) => void) =>
        onError(new Error("Resend down"), 1),
    );

    await expect(notifyCollaboratorsOfSuspension(OWNER)).resolves.toBe(
      undefined,
    );
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: "m-2" }),
      expect.any(String),
    );
  });

  it("senza attività non scrive", async () => {
    planIs("pro");
    businessIs([]);

    await notifyCollaboratorsOfSuspension(OWNER);

    expect(mockListCollaboratorAccounts).not.toHaveBeenCalled();
    expect(mockSendEmailsInSequence).not.toHaveBeenCalled();
  });

  it("un piano illeggibile non scrive e non lancia", async () => {
    mockGetPlanSafe.mockResolvedValue({ ok: false, error: "boom" });

    await notifyCollaboratorsOfSuspension(OWNER);

    expect(mockSendEmailsInSequence).not.toHaveBeenCalled();
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
