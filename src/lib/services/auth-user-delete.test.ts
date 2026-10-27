// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockAdminDeleteUser, mockWarn, mockError } = vi.hoisted(() => ({
  mockAdminDeleteUser: vi.fn(),
  mockWarn: vi.fn(),
  mockError: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    auth: { admin: { deleteUser: mockAdminDeleteUser } },
  }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: mockWarn, error: mockError, info: vi.fn() },
}));

import { deleteAuthUser } from "./auth-user-delete";

const USER_ID = "user-123";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

async function run(): Promise<boolean> {
  const promise = deleteAuthUser(USER_ID);
  await vi.runAllTimersAsync();
  return promise;
}

describe("deleteAuthUser", () => {
  it("true al primo tentativo riuscito", async () => {
    mockAdminDeleteUser.mockResolvedValue({ error: null });

    await expect(run()).resolves.toBe(true);
    expect(mockAdminDeleteUser).toHaveBeenCalledWith(USER_ID);
    expect(mockAdminDeleteUser).toHaveBeenCalledTimes(1);
  });

  it("ritenta fino a 3 volte, poi false con un error critico", async () => {
    mockAdminDeleteUser.mockResolvedValue({ error: { message: "boom" } });

    await expect(run()).resolves.toBe(false);
    expect(mockAdminDeleteUser).toHaveBeenCalledTimes(3);
    expect(mockError).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, critical: true }),
      expect.any(String),
    );
  });

  it("smette di ritentare appena riesce", async () => {
    mockAdminDeleteUser
      .mockResolvedValueOnce({ error: { message: "transient" } })
      .mockResolvedValueOnce({ error: null });

    await expect(run()).resolves.toBe(true);
    expect(mockAdminDeleteUser).toHaveBeenCalledTimes(2);
  });

  it.each([
    { name: "status 404", error: { status: 404 } },
    { name: "code user_not_found", error: { code: "user_not_found" } },
  ])(
    "un utente già assente ($name) è un successo, con un warn",
    async ({ error }) => {
      mockAdminDeleteUser.mockResolvedValue({ error });

      await expect(run()).resolves.toBe(true);
      expect(mockAdminDeleteUser).toHaveBeenCalledTimes(1);
      expect(mockWarn).toHaveBeenCalled();
      expect(mockError).not.toHaveBeenCalled();
    },
  );
});
