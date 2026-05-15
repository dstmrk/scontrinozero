import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockTransaction, mockTxExecute } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockTxExecute: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({ transaction: mockTransaction }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction.mockImplementation(async (fn) =>
    fn({ execute: mockTxExecute }),
  );
  mockTxExecute.mockResolvedValue(undefined);
});

describe("withStatementTimeout", () => {
  it("avvolge la callback in db.transaction()", async () => {
    const { withStatementTimeout } = await import("./db-timeout");
    await withStatementTimeout(5000, async () => "ok");
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it("imposta SET LOCAL statement_timeout come primo statement", async () => {
    const { withStatementTimeout } = await import("./db-timeout");
    await withStatementTimeout(5000, async () => "ok");
    // Il primo execute della transazione è il SET LOCAL.
    expect(mockTxExecute).toHaveBeenCalledTimes(1);
    const firstCall = mockTxExecute.mock.calls[0][0];
    // Il SQL fragment di Drizzle ha una proprietà `queryChunks` interna; il
    // toString o i chunks contengono il timeout numerico.
    const stringified = JSON.stringify(firstCall);
    expect(stringified).toContain("5000");
    expect(stringified.toLowerCase()).toContain("statement_timeout");
  });

  it("propaga il valore di ritorno della callback", async () => {
    const { withStatementTimeout } = await import("./db-timeout");
    const result = await withStatementTimeout(3000, async () => ({ ok: true }));
    expect(result).toEqual({ ok: true });
  });

  it("passa la tx alla callback", async () => {
    const { withStatementTimeout } = await import("./db-timeout");
    let received: unknown = null;
    await withStatementTimeout(3000, async (tx) => {
      received = tx;
      return null;
    });
    expect(received).toBeDefined();
    expect(received).toHaveProperty("execute");
  });

  it("rifiuta timeout non positivi (guard contro misconfig)", async () => {
    const { withStatementTimeout } = await import("./db-timeout");
    await expect(withStatementTimeout(0, async () => null)).rejects.toThrow(
      /positive/i,
    );
    await expect(withStatementTimeout(-1, async () => null)).rejects.toThrow(
      /positive/i,
    );
  });

  it("rifiuta timeout non interi (statement_timeout vuole un intero)", async () => {
    const { withStatementTimeout } = await import("./db-timeout");
    await expect(withStatementTimeout(1.5, async () => null)).rejects.toThrow(
      /integer/i,
    );
  });

  it("propaga errori della callback", async () => {
    const { withStatementTimeout } = await import("./db-timeout");
    mockTransaction.mockImplementation(async (fn) =>
      fn({ execute: mockTxExecute }),
    );
    await expect(
      withStatementTimeout(1000, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("propaga errori statement_timeout (Postgres code 57014)", async () => {
    const { withStatementTimeout } = await import("./db-timeout");
    const pgErr = Object.assign(
      new Error("canceling statement due to statement timeout"),
      {
        code: "57014",
      },
    );
    mockTransaction.mockImplementation(async () => {
      throw pgErr;
    });
    await expect(
      withStatementTimeout(1000, async () => "never"),
    ).rejects.toMatchObject({ code: "57014" });
  });
});

describe("retryOnStatementTimeout (B20)", () => {
  it("ritorna immediatamente il valore se la fn ha successo al primo tentativo", async () => {
    vi.useFakeTimers();
    const { retryOnStatementTimeout } = await import("./db-timeout");
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await retryOnStatementTimeout("test", fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("rilancia immediatamente errori non-timeout (no retry)", async () => {
    vi.useFakeTimers();
    const { retryOnStatementTimeout } = await import("./db-timeout");
    const nonTimeoutErr = new Error("connection lost");
    const fn = vi.fn().mockRejectedValue(nonTimeoutErr);
    await expect(retryOnStatementTimeout("test", fn)).rejects.toThrow(
      "connection lost",
    );
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("ritenta su 57014 e ritorna il valore al recupero", async () => {
    vi.useFakeTimers();
    const { retryOnStatementTimeout } = await import("./db-timeout");
    const timeoutErr = Object.assign(new Error("timeout"), { code: "57014" });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(timeoutErr)
      .mockResolvedValue("recovered");
    const promise = retryOnStatementTimeout("test", fn);
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("backoff progressivo 200 → 500 → 1000 ms, 4 tentativi totali, poi rilancia ultimo errore", async () => {
    vi.useFakeTimers();
    const { retryOnStatementTimeout } = await import("./db-timeout");
    const timeoutErr = Object.assign(new Error("timeout"), { code: "57014" });
    const fn = vi.fn().mockRejectedValue(timeoutErr);
    const promise = retryOnStatementTimeout("test", fn);
    // Necessario per evitare unhandled rejection durante l'esecuzione
    promise.catch(() => {});
    // Avanza per tutti i backoff: 200 + 500 + 1000 = 1700ms
    await vi.advanceTimersByTimeAsync(1700);
    await expect(promise).rejects.toMatchObject({ code: "57014" });
    // 1 tentativo iniziale + 3 retry = 4
    expect(fn).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });
});
