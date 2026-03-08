import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockResendSend = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockResendSend } };
  }),
}));

// Must import after vi.mock
const { sendEmail } = await import("./email");

const fakeReact = { type: "div", props: {} } as unknown as Parameters<
  typeof sendEmail
>[0]["react"];

describe("sendEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FROM_EMAIL = "Test <test@mail.example.com>";
  });

  afterEach(() => {
    delete process.env.FROM_EMAIL;
  });

  it("calls resend.emails.send with correct parameters", async () => {
    mockResendSend.mockResolvedValue({ data: { id: "abc" }, error: null });

    await sendEmail({
      to: "user@example.com",
      subject: "Test Subject",
      react: fakeReact,
    });

    expect(mockResendSend).toHaveBeenCalledWith({
      from: "Test <test@mail.example.com>",
      to: "user@example.com",
      subject: "Test Subject",
      react: fakeReact,
    });
  });

  it("uses FROM_EMAIL env var when defined", async () => {
    mockResendSend.mockResolvedValue({ data: { id: "abc" }, error: null });
    process.env.FROM_EMAIL = "Custom <custom@example.com>";

    await sendEmail({ to: "a@b.com", subject: "s", react: fakeReact });

    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Custom <custom@example.com>" }),
    );
  });

  it("throws when FROM_EMAIL is not set", async () => {
    delete process.env.FROM_EMAIL;

    await expect(
      sendEmail({ to: "a@b.com", subject: "s", react: fakeReact }),
    ).rejects.toThrow("FROM_EMAIL environment variable is required");
  });

  it("does not throw when send succeeds", async () => {
    mockResendSend.mockResolvedValue({ data: { id: "ok" }, error: null });

    await expect(
      sendEmail({ to: "a@b.com", subject: "s", react: fakeReact }),
    ).resolves.toBeUndefined();
  });

  it("throws when resend returns an error", async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: { message: "domain not verified", name: "validation_error" },
    });

    await expect(
      sendEmail({ to: "a@b.com", subject: "s", react: fakeReact }),
    ).rejects.toThrow("domain not verified");
  });

  it("throws when resend.emails.send rejects", async () => {
    mockResendSend.mockRejectedValue(new Error("network error"));

    await expect(
      sendEmail({ to: "a@b.com", subject: "s", react: fakeReact }),
    ).rejects.toThrow("network error");
  });
});
