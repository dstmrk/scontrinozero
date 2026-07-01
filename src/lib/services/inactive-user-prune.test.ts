// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PruneConfig } from "./inactive-user-prune-config";

const mockExecute = vi.fn();
const mockWhere = vi.fn().mockResolvedValue(undefined);
const mockSet = vi.fn((_values: { inactivityWarningSentAt: Date | null }) => ({
  where: mockWhere,
}));
const mockUpdate = vi.fn(() => ({ set: mockSet }));
vi.mock("@/db", () => ({
  getDb: () => ({ execute: mockExecute, update: mockUpdate }),
}));

const mockPurgeUserById = vi.fn();
vi.mock("@/lib/services/purge-user", () => ({
  purgeUserById: (id: string) => mockPurgeUserById(id),
}));

const mockSendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({ sendEmail: (o: unknown) => mockSendEmail(o) }));

vi.mock("@/lib/trusted-app-url", () => ({
  getTrustedAppUrl: () => "https://app.test",
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/emails/account-inactivity-warning", () => ({
  AccountInactivityWarningEmail: vi.fn(() => null),
}));
vi.mock("@/emails/account-inactivity-deletion", () => ({
  AccountInactivityDeletionEmail: vi.fn(() => null),
}));

const NOW = new Date("2026-07-01T00:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const CONFIG: PruneConfig = {
  enabled: true,
  deleteAfterDays: 365,
  warnBeforeDays: 30,
};

describe("isProtectedFromPrune", () => {
  it("protegge unlimited sempre", async () => {
    const { isProtectedFromPrune } = await import("./inactive-user-prune");
    expect(isProtectedFromPrune("unlimited", null, NOW.getTime())).toBe(true);
  });

  it("NON protegge il trial", async () => {
    const { isProtectedFromPrune } = await import("./inactive-user-prune");
    expect(isProtectedFromPrune("trial", null, NOW.getTime())).toBe(false);
  });

  it("protegge un piano a pagamento ancora attivo", async () => {
    const { isProtectedFromPrune } = await import("./inactive-user-prune");
    const future = new Date(NOW.getTime() + 30 * 86_400_000);
    expect(isProtectedFromPrune("pro", future, NOW.getTime())).toBe(true);
  });

  it("protegge un piano a pagamento con scadenza sconosciuta (null) — fail-safe", async () => {
    const { isProtectedFromPrune } = await import("./inactive-user-prune");
    expect(isProtectedFromPrune("pro", null, NOW.getTime())).toBe(true);
  });

  it("NON protegge un piano a pagamento scaduto oltre la grazia", async () => {
    const { isProtectedFromPrune } = await import("./inactive-user-prune");
    const longExpired = new Date(NOW.getTime() - 400 * 86_400_000);
    expect(isProtectedFromPrune("pro", longExpired, NOW.getTime())).toBe(false);
  });

  it("protegge un plan sconosciuto (drift schema)", async () => {
    const { isProtectedFromPrune } = await import("./inactive-user-prune");
    expect(isProtectedFromPrune("mystery", null, NOW.getTime())).toBe(true);
  });
});

describe("pruneInactiveUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPurgeUserById.mockResolvedValue({
      authDeleted: true,
      profileDeleted: true,
    });
    mockSendEmail.mockResolvedValue(undefined);
    mockWhere.mockResolvedValue(undefined);
  });

  it("preavvisa, cancella e resetta secondo lo stato di ogni utente", async () => {
    mockExecute.mockResolvedValue([
      // WARN: inattivo oltre 335gg, mai preavvisato, trial
      {
        auth_user_id: "w1",
        email: "w@t.it",
        first_name: "Wanda",
        plan: "trial",
        plan_expires_at: null,
        inactivity_warning_sent_at: null,
        last_activity_at: daysAgo(340),
      },
      // DELETE: inattivo >365gg, preavvisato 31gg fa, trial
      {
        auth_user_id: "d1",
        email: "d@t.it",
        first_name: null,
        plan: "trial",
        plan_expires_at: null,
        inactivity_warning_sent_at: daysAgo(31),
        last_activity_at: daysAgo(400),
      },
      // RESET: tornato attivo (10gg fa) pur essendo stato preavvisato
      {
        auth_user_id: "r1",
        email: "r@t.it",
        first_name: "Rino",
        plan: "trial",
        plan_expires_at: null,
        inactivity_warning_sent_at: daysAgo(40),
        last_activity_at: daysAgo(10),
      },
      // PROTECTED: abbonato pro attivo, nessuna azione
      {
        auth_user_id: "p1",
        email: "p@t.it",
        first_name: "Pia",
        plan: "pro",
        plan_expires_at: new Date(NOW.getTime() + 30 * 86_400_000),
        inactivity_warning_sent_at: null,
        last_activity_at: daysAgo(400),
      },
      // WAITING: inattivo >365gg ma preavvisato solo 10gg fa (grazia non scaduta)
      {
        auth_user_id: "g1",
        email: "g@t.it",
        first_name: "Gino",
        plan: "trial",
        plan_expires_at: null,
        inactivity_warning_sent_at: daysAgo(10),
        last_activity_at: daysAgo(400),
      },
      // RESET-PROTECTED: preavvisato ma ora unlimited → azzera
      {
        auth_user_id: "rp1",
        email: "rp@t.it",
        first_name: "Ada",
        plan: "unlimited",
        plan_expires_at: null,
        inactivity_warning_sent_at: daysAgo(40),
        last_activity_at: daysAgo(400),
      },
    ]);

    const { pruneInactiveUsers } = await import("./inactive-user-prune");
    const result = await pruneInactiveUsers(NOW, CONFIG);

    expect(result).toEqual({ warned: 1, deleted: 1, reset: 2 });

    // Solo d1 viene cancellato
    expect(mockPurgeUserById).toHaveBeenCalledTimes(1);
    expect(mockPurgeUserById).toHaveBeenCalledWith("d1");

    // Due email: preavviso a w1, conferma cancellazione a d1
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "w@t.it",
        subject: expect.stringContaining("sta per essere eliminato"),
      }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "d@t.it",
        subject: "Il tuo account ScontrinoZero è stato eliminato",
      }),
    );

    // Tre update: w1 (set now), r1 (null), rp1 (null) — non g1/p1
    const setValues = mockSet.mock.calls.map(
      (c) => c[0].inactivityWarningSentAt,
    );
    expect(setValues).toHaveLength(3);
    expect(setValues.filter((v) => v === null)).toHaveLength(2);
    expect(setValues.filter((v) => v instanceof Date)).toHaveLength(1);
  });

  it("degrada a zero senza lanciare se la query candidati fallisce", async () => {
    mockExecute.mockRejectedValue(new Error("DB down"));

    const { pruneInactiveUsers } = await import("./inactive-user-prune");
    const result = await pruneInactiveUsers(NOW, CONFIG);

    expect(result).toEqual({ warned: 0, deleted: 0, reset: 0 });
    expect(mockPurgeUserById).not.toHaveBeenCalled();
  });

  it("un fallimento su un utente non aborta il batch", async () => {
    mockExecute.mockResolvedValue([
      {
        auth_user_id: "w1",
        email: "w@t.it",
        first_name: "Wanda",
        plan: "trial",
        plan_expires_at: null,
        inactivity_warning_sent_at: null,
        last_activity_at: daysAgo(340),
      },
      {
        auth_user_id: "w2",
        email: "w2@t.it",
        first_name: "Bea",
        plan: "trial",
        plan_expires_at: null,
        inactivity_warning_sent_at: null,
        last_activity_at: daysAgo(341),
      },
    ]);
    // Il primo invio email lancia, il secondo va a buon fine
    mockSendEmail
      .mockRejectedValueOnce(new Error("Resend down"))
      .mockResolvedValueOnce(undefined);

    const { pruneInactiveUsers } = await import("./inactive-user-prune");
    const result = await pruneInactiveUsers(NOW, CONFIG);

    // w1 fallisce (non conteggiato), w2 preavvisato
    expect(result.warned).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it("non cancella se purgeUserById riporta authDeleted false", async () => {
    mockPurgeUserById.mockResolvedValue({
      authDeleted: false,
      profileDeleted: false,
    });
    mockExecute.mockResolvedValue([
      {
        auth_user_id: "d1",
        email: "d@t.it",
        first_name: null,
        plan: "trial",
        plan_expires_at: null,
        inactivity_warning_sent_at: daysAgo(31),
        last_activity_at: daysAgo(400),
      },
    ]);

    const { pruneInactiveUsers } = await import("./inactive-user-prune");
    const result = await pruneInactiveUsers(NOW, CONFIG);

    expect(result.deleted).toBe(0);
    // Nessuna email di conferma se la cancellazione auth non è avvenuta
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
