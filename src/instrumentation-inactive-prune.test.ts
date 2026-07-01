// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPruneInactiveUsers, mockLoggerWarn } = vi.hoisted(() => ({
  mockPruneInactiveUsers: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("@/lib/services/inactive-user-prune", () => ({
  pruneInactiveUsers: mockPruneInactiveUsers,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: mockLoggerWarn },
}));

vi.mock("@sentry/nextjs", () => ({ captureRequestError: vi.fn() }));

describe("startInactiveUserPruneSweep()", () => {
  let capturedCallback: (() => Promise<void>) | undefined;
  let mockUnref: ReturnType<typeof vi.fn>;
  let startInactiveUserPruneSweep: (intervalMs: number) => void;

  beforeEach(async () => {
    vi.resetModules();
    ({ startInactiveUserPruneSweep } = await import("./instrumentation"));

    mockUnref = vi.fn();
    const mockTimer = { unref: mockUnref } as unknown as ReturnType<
      typeof setInterval
    >;
    vi.spyOn(global, "setInterval").mockImplementation((callback) => {
      capturedCallback = callback as () => Promise<void>;
      return mockTimer;
    });

    mockPruneInactiveUsers.mockResolvedValue({
      warned: 0,
      deleted: 0,
      reset: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    capturedCallback = undefined;
  });

  it("chiama setInterval con l'intervallo passato", () => {
    startInactiveUserPruneSweep(3_600_000);
    expect(global.setInterval).toHaveBeenCalledWith(
      expect.any(Function),
      3_600_000,
    );
  });

  it("chiama .unref() per non bloccare lo shutdown", () => {
    startInactiveUserPruneSweep(1000);
    expect(mockUnref).toHaveBeenCalled();
  });

  it("non tocca il DB prima che scatti il timer", () => {
    startInactiveUserPruneSweep(1000);
    expect(mockPruneInactiveUsers).not.toHaveBeenCalled();
  });

  it("esegue pruneInactiveUsers quando il callback scatta", async () => {
    startInactiveUserPruneSweep(1000);
    await capturedCallback!();
    expect(mockPruneInactiveUsers).toHaveBeenCalledOnce();
  });

  it("logga warn senza lanciare se lo sweep fallisce", async () => {
    const error = new Error("sweep boom");
    mockPruneInactiveUsers.mockRejectedValue(error);
    startInactiveUserPruneSweep(1000);
    await capturedCallback!();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      { err: error },
      "Inactive user prune sweep fallito",
    );
  });

  it("due chiamate avviano un solo setInterval (idempotenza)", () => {
    startInactiveUserPruneSweep(1000);
    startInactiveUserPruneSweep(1000);
    expect(global.setInterval).toHaveBeenCalledOnce();
  });
});
