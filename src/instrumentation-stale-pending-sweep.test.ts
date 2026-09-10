// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCountStalePendingDocuments, mockLoggerWarn, mockGetDb } =
  vi.hoisted(() => ({
    mockCountStalePendingDocuments: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockGetDb: vi.fn().mockReturnValue("db-handle"),
  }));

vi.mock("@/lib/services/ade-recovery", () => ({
  countStalePendingDocuments: mockCountStalePendingDocuments,
}));

vi.mock("@/db", () => ({ getDb: mockGetDb }));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: mockLoggerWarn },
}));

vi.mock("@sentry/nextjs", () => ({ captureRequestError: vi.fn() }));

describe("startStalePendingSweep()", () => {
  let capturedInterval: (() => Promise<void>) | undefined;
  let capturedInitial: (() => Promise<void>) | undefined;
  let mockIntervalUnref: ReturnType<typeof vi.fn>;
  let mockTimeoutUnref: ReturnType<typeof vi.fn>;
  let startStalePendingSweep: () => void;
  let STALE_PENDING_SWEEP_INTERVAL_MS: number;
  let STALE_PENDING_SWEEP_INITIAL_DELAY_MS: number;

  beforeEach(async () => {
    vi.resetModules();
    ({
      startStalePendingSweep,
      STALE_PENDING_SWEEP_INTERVAL_MS,
      STALE_PENDING_SWEEP_INITIAL_DELAY_MS,
    } = await import("./instrumentation"));

    mockIntervalUnref = vi.fn();
    vi.spyOn(global, "setInterval").mockImplementation((callback) => {
      capturedInterval = callback as () => Promise<void>;
      return { unref: mockIntervalUnref } as unknown as ReturnType<
        typeof setInterval
      >;
    });

    mockTimeoutUnref = vi.fn();
    vi.spyOn(global, "setTimeout").mockImplementation((callback) => {
      capturedInitial = callback as () => Promise<void>;
      return { unref: mockTimeoutUnref } as unknown as ReturnType<
        typeof setTimeout
      >;
    });

    mockCountStalePendingDocuments.mockResolvedValue({
      sale: 0,
      void: 0,
      oldestCreatedAt: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    capturedInterval = undefined;
    capturedInitial = undefined;
  });

  it("gira ogni sei ore", () => {
    startStalePendingSweep();

    expect(STALE_PENDING_SWEEP_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
    expect(global.setInterval).toHaveBeenCalledWith(
      expect.any(Function),
      STALE_PENDING_SWEEP_INTERVAL_MS,
    );
  });

  it("fa un giro iniziale ritardato, o un container che si riavvia spesso non conterebbe mai", () => {
    startStalePendingSweep();

    expect(STALE_PENDING_SWEEP_INITIAL_DELAY_MS).toBe(5 * 60 * 1000);
    expect(global.setTimeout).toHaveBeenCalledWith(
      expect.any(Function),
      STALE_PENDING_SWEEP_INITIAL_DELAY_MS,
    );
  });

  it("non trattiene il processo: entrambi i timer sono unref'd", () => {
    startStalePendingSweep();

    expect(mockIntervalUnref).toHaveBeenCalledTimes(1);
    expect(mockTimeoutUnref).toHaveBeenCalledTimes(1);
  });

  it("non impila timer su invocazioni multiple di register()", () => {
    startStalePendingSweep();
    startStalePendingSweep();

    expect(global.setInterval).toHaveBeenCalledTimes(1);
    expect(global.setTimeout).toHaveBeenCalledTimes(1);
  });

  it("tace quando non c'è niente in sospeso", async () => {
    startStalePendingSweep();

    await capturedInterval?.();

    // A regime non c'è niente e il giro è ogni sei ore: un log incondizionato
    // sarebbe rumore che nasconde quello vero.
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("logga conteggi e riga più vecchia quando ce n'è", async () => {
    mockCountStalePendingDocuments.mockResolvedValue({
      sale: 2,
      void: 1,
      oldestCreatedAt: new Date("2026-09-01T08:00:00.000Z"),
    });
    startStalePendingSweep();

    await capturedInterval?.();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      {
        errorClass: "stale_pending_documents",
        salePending: 2,
        voidPending: 1,
        oldestCreatedAt: "2026-09-01T08:00:00.000Z",
      },
      "Documenti PENDING oltre la soglia stale: esito AdE ignoto",
    );
  });

  it("logga anche senza la data della riga più vecchia", async () => {
    mockCountStalePendingDocuments.mockResolvedValue({
      sale: 1,
      void: 0,
      oldestCreatedAt: null,
    });
    startStalePendingSweep();

    await capturedInterval?.();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ oldestCreatedAt: null }),
      expect.any(String),
    );
  });

  it("il giro iniziale conta come quelli successivi", async () => {
    mockCountStalePendingDocuments.mockResolvedValue({
      sale: 1,
      void: 0,
      oldestCreatedAt: null,
    });
    startStalePendingSweep();

    await capturedInitial?.();

    expect(mockCountStalePendingDocuments).toHaveBeenCalledTimes(1);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
  });

  it("un errore del conteggio non propaga: degrada a warn", async () => {
    mockCountStalePendingDocuments.mockRejectedValue(new Error("DB giù"));
    startStalePendingSweep();

    await expect(capturedInterval?.()).resolves.toBeUndefined();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "Conteggio documenti in sospeso fallito",
    );
  });
});
