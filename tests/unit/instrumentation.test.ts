// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb, mockDelete, mockWhere, mockReturning, mockLoggerWarn } =
  vi.hoisted(() => ({
    mockGetDb: vi.fn(),
    mockDelete: vi.fn(),
    mockWhere: vi.fn(),
    mockReturning: vi.fn(),
    mockLoggerWarn: vi.fn(),
  }));

vi.mock("@/db", () => ({
  getDb: mockGetDb,
}));

vi.mock("@/db/schema", () => ({
  stripeWebhookEvents: {
    eventId: "event_id",
    completedAt: "completed_at",
    processedAt: "processed_at",
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: mockLoggerWarn,
    error: vi.fn(),
  },
}));

// setInterval is captured directly (instead of advancing fake timers) so the
// async callback's chain of dynamic imports resolves deterministically —
// fake timers' microtask flushing isn't reliable across real dynamic
// `import()` module resolution.
function captureIntervalCallback(): () => Promise<void> | void {
  let captured: (() => Promise<void> | void) | undefined;
  vi.spyOn(global, "setInterval").mockImplementation(((
    fn: () => Promise<void> | void,
  ) => {
    captured = fn;
    return { unref: vi.fn() } as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval);
  return () => {
    if (!captured) throw new Error("setInterval was never called");
    return captured();
  };
}

describe("startStripeWebhookClaimSweep", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockGetDb.mockReturnValue({ delete: mockDelete });
    mockDelete.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes stuck claims (completed_at NULL, processed_at past threshold) and logs warn", async () => {
    mockReturning.mockResolvedValue([
      { eventId: "evt_stuck_1" },
      { eventId: "evt_stuck_2" },
    ]);
    const runTick = captureIntervalCallback();

    const { startStripeWebhookClaimSweep } = await import("@/instrumentation");
    startStripeWebhookClaimSweep();
    await runTick();

    expect(mockDelete).toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      { eventIds: ["evt_stuck_1", "evt_stuck_2"] },
      "Stripe webhook claim sbloccato da sweep automatico",
    );
  });

  it("does not log when no stuck claims are found", async () => {
    mockReturning.mockResolvedValue([]);
    const runTick = captureIntervalCallback();

    const { startStripeWebhookClaimSweep } = await import("@/instrumentation");
    startStripeWebhookClaimSweep();
    await runTick();

    expect(mockDelete).toHaveBeenCalled();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("logs a warning (without crashing) when the sweep query throws", async () => {
    mockWhere.mockImplementation(() => {
      throw new Error("DB down");
    });
    const runTick = captureIntervalCallback();

    const { startStripeWebhookClaimSweep } = await import("@/instrumentation");
    startStripeWebhookClaimSweep();
    await runTick();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "Stripe webhook claim sweep fallito",
    );
  });

  it("is idempotent: calling it twice only starts a single interval", async () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");

    const { startStripeWebhookClaimSweep } = await import("@/instrumentation");
    startStripeWebhookClaimSweep();
    startStripeWebhookClaimSweep();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });
});
