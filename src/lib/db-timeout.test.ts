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
