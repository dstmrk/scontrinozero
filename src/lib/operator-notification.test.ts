// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({
  sendEmail: mockSendEmail,
}));

const mockLimit = vi.fn();
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({ select: mockSelect }),
}));

vi.mock("@/db/schema", () => ({
  profiles: {
    authUserId: "auth-user-id-col",
    firstName: "first-name-col",
    lastName: "last-name-col",
    email: "email-col",
  },
}));

vi.mock("@/emails/operator-signup-notification", () => ({
  OperatorSignupNotificationEmail: vi.fn().mockReturnValue(null),
}));

vi.mock("@/emails/operator-subscription-notification", () => ({
  OperatorSubscriptionNotificationEmail: vi.fn().mockReturnValue(null),
}));

const mockLoggerWarn = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { warn: mockLoggerWarn },
}));

describe("notifyOperatorOfNewSignup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockReset();
    delete process.env.NEW_SIGNUP_NOTIFICATION_EMAIL;
  });

  it("does nothing when NEW_SIGNUP_NOTIFICATION_EMAIL is not set", async () => {
    const { notifyOperatorOfNewSignup } =
      await import("./operator-notification");
    await notifyOperatorOfNewSignup("user-123");

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends an email with name, surname and email when env is set", async () => {
    process.env.NEW_SIGNUP_NOTIFICATION_EMAIL = "marco@scontrinozero.it";
    mockLimit.mockResolvedValueOnce([
      {
        firstName: "Mario",
        lastName: "Rossi",
        email: "mario@example.it",
      },
    ]);

    const { notifyOperatorOfNewSignup } =
      await import("./operator-notification");
    await notifyOperatorOfNewSignup("user-123");

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "marco@scontrinozero.it",
        subject: expect.stringContaining("Nuovo onboarding"),
      }),
    );
  });

  it("does not send when the profile is not found", async () => {
    process.env.NEW_SIGNUP_NOTIFICATION_EMAIL = "marco@scontrinozero.it";
    mockLimit.mockResolvedValueOnce([]);

    const { notifyOperatorOfNewSignup } =
      await import("./operator-notification");
    await notifyOperatorOfNewSignup("user-123");

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("propagates sendEmail errors so the caller can log them", async () => {
    process.env.NEW_SIGNUP_NOTIFICATION_EMAIL = "marco@scontrinozero.it";
    mockLimit.mockResolvedValueOnce([
      { firstName: "Mario", lastName: "Rossi", email: "mario@example.it" },
    ]);
    mockSendEmail.mockRejectedValueOnce(new Error("Resend boom"));

    const { notifyOperatorOfNewSignup } =
      await import("./operator-notification");

    await expect(notifyOperatorOfNewSignup("user-123")).rejects.toThrow(
      "Resend boom",
    );
  });

  it("tolerates null firstName/lastName from the DB", async () => {
    process.env.NEW_SIGNUP_NOTIFICATION_EMAIL = "marco@scontrinozero.it";
    mockLimit.mockResolvedValueOnce([
      { firstName: null, lastName: null, email: "mario@example.it" },
    ]);

    const { notifyOperatorOfNewSignup } =
      await import("./operator-notification");
    await notifyOperatorOfNewSignup("user-123");

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("notifyOperatorOfSubscriptionEvent", () => {
  const profileRow = {
    firstName: "Mario",
    lastName: "Rossi",
    email: "mario@example.it",
  };
  const started = {
    kind: "started",
    to: { plan: "pro", interval: "year" },
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockReset();
    mockSendEmail.mockResolvedValue(undefined);
    delete process.env.NEW_SIGNUP_NOTIFICATION_EMAIL;
    process.env.NEW_SIGNUP_NOTIFICATION_EMAIL = "marco@scontrinozero.it";
  });

  async function run(
    change: Parameters<
      typeof import("./operator-notification").notifyOperatorOfSubscriptionEvent
    >[1] = started,
    endsAt?: Date,
  ) {
    const { notifyOperatorOfSubscriptionEvent } =
      await import("./operator-notification");
    await notifyOperatorOfSubscriptionEvent("user-123", change, endsAt);
  }

  it("does nothing when the env var is not set", async () => {
    delete process.env.NEW_SIGNUP_NOTIFICATION_EMAIL;
    await run();
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends a mail with event and plan in the subject", async () => {
    mockLimit.mockResolvedValueOnce([profileRow]);
    await run();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "marco@scontrinozero.it",
        subject: "ScontrinoZero — Nuovo abbonamento: Pro annuale",
      }),
    );
  });

  it.each([
    [
      { kind: "changed", from: null, to: { plan: "pro", interval: "month" } },
      "Cambio piano: Pro mensile",
    ],
    [
      { kind: "cancel_scheduled", to: { plan: "starter", interval: "month" } },
      "Disdetta programmata: Starter mensile",
    ],
    [
      { kind: "ended", to: { plan: "starter", interval: "year" } },
      "Abbonamento terminato: Starter annuale",
    ],
  ] as const)("subject for %o", async (change, expected) => {
    mockLimit.mockResolvedValueOnce([profileRow]);
    await run(change, new Date("2026-07-07T10:00:00Z"));
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining(expected),
      }),
    );
  });

  it("does not send when the profile is not found", async () => {
    mockLimit.mockResolvedValueOnce([]);
    await run();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("never throws when sendEmail rejects: logs a warn and resolves", async () => {
    mockLimit.mockResolvedValueOnce([profileRow]);
    mockSendEmail.mockRejectedValueOnce(new Error("Resend boom"));
    await expect(run()).resolves.toBeUndefined();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "started" }),
      expect.stringContaining("Operator subscription notification failed"),
    );
  });

  it("never throws when the profile lookup fails", async () => {
    mockLimit.mockRejectedValueOnce(new Error("db down"));
    await expect(run()).resolves.toBeUndefined();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
  });

  it("tolerates null firstName/lastName from the DB", async () => {
    mockLimit.mockResolvedValueOnce([
      { firstName: null, lastName: null, email: "mario@example.it" },
    ]);
    await run();
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});
