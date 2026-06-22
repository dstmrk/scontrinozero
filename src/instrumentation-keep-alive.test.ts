// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KEEP_ALIVE_INTERVAL_MS } from "./instrumentation";

const { mockCreateAdminSupabaseClient, mockLoggerInfo, mockLoggerWarn } =
  vi.hoisted(() => ({
    mockCreateAdminSupabaseClient: vi.fn(),
    mockLoggerInfo: vi.fn(),
    mockLoggerWarn: vi.fn(),
  }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: mockCreateAdminSupabaseClient,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: mockLoggerInfo, warn: mockLoggerWarn },
}));

vi.mock("@sentry/nextjs", () => ({
  captureRequestError: vi.fn(),
}));

describe("KEEP_ALIVE_INTERVAL_MS", () => {
  it("vale esattamente 5 giorni in millisecondi", () => {
    expect(KEEP_ALIVE_INTERVAL_MS).toBe(5 * 24 * 60 * 60 * 1000);
  });
});

describe("startSupabaseKeepAlive()", () => {
  let capturedCallback: (() => Promise<void>) | undefined;
  let mockUnref: ReturnType<typeof vi.fn>;
  let mockLimit: ReturnType<typeof vi.fn>;
  let mockSelect: ReturnType<typeof vi.fn>;
  let mockFrom: ReturnType<typeof vi.fn>;
  let startSupabaseKeepAlive: () => void;

  beforeEach(async () => {
    // Reset dello stato module-level (guardia di idempotenza) tra i test:
    // senza questo, dal secondo test in poi la guardia farebbe early-return.
    vi.resetModules();
    ({ startSupabaseKeepAlive } = await import("./instrumentation"));

    mockUnref = vi.fn();
    const mockTimer = { unref: mockUnref } as unknown as ReturnType<
      typeof setInterval
    >;
    vi.spyOn(global, "setInterval").mockImplementation((callback) => {
      capturedCallback = callback as () => Promise<void>;
      return mockTimer;
    });

    mockLimit = vi.fn().mockResolvedValue({ data: [], error: null });
    mockSelect = vi.fn(() => ({ limit: mockLimit }));
    mockFrom = vi.fn(() => ({ select: mockSelect }));
    mockCreateAdminSupabaseClient.mockReturnValue({ from: mockFrom });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    capturedCallback = undefined;
  });

  it("chiama setInterval con l'intervallo corretto (5 giorni)", () => {
    startSupabaseKeepAlive();
    expect(global.setInterval).toHaveBeenCalledWith(
      expect.any(Function),
      KEEP_ALIVE_INTERVAL_MS,
    );
  });

  it("chiama .unref() sull'interval per non bloccare lo shutdown", () => {
    startSupabaseKeepAlive();
    expect(mockUnref).toHaveBeenCalled();
  });

  it("non chiama il DB prima che scatti il timer", () => {
    startSupabaseKeepAlive();
    expect(mockCreateAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("chiama profiles.select(id).limit(1) quando il callback scatta", async () => {
    startSupabaseKeepAlive();
    await capturedCallback!();

    expect(mockCreateAdminSupabaseClient).toHaveBeenCalledOnce();
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockSelect).toHaveBeenCalledWith("id");
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  it("logga info dopo una query riuscita", async () => {
    startSupabaseKeepAlive();
    await capturedCallback!();

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "Supabase keep-alive ping eseguito",
    );
  });

  it("logga warn senza lanciare eccezioni in caso di errore del client", async () => {
    const error = new Error("DB unavailable");
    mockCreateAdminSupabaseClient.mockImplementation(() => {
      throw error;
    });
    startSupabaseKeepAlive();
    await capturedCallback!();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      { err: error },
      "Supabase keep-alive ping fallito",
    );
    expect(mockLoggerInfo).not.toHaveBeenCalled();
  });

  it("il callback può essere eseguito più volte (timer periodico)", async () => {
    startSupabaseKeepAlive();
    await capturedCallback!();
    await capturedCallback!();

    expect(mockCreateAdminSupabaseClient).toHaveBeenCalledTimes(2);
  });

  it("due chiamate consecutive avviano un solo setInterval (idempotenza)", () => {
    startSupabaseKeepAlive();
    startSupabaseKeepAlive();

    expect(global.setInterval).toHaveBeenCalledOnce();
  });
});
