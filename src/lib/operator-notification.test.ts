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
