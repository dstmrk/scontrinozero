// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockExecute = vi.fn();
const mockTransaction = vi.fn();
vi.mock("@/db", () => ({
  getDb: () => ({ execute: mockExecute, transaction: mockTransaction }),
}));

const mockWarn = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { warn: mockWarn },
}));

describe("/api/health (legacy alias)", () => {
  it("returns 200 with status ok without touching the DB", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; timestamp: string };
    expect(body.status).toBe("ok");
    expect(typeof body.timestamp).toBe("string");
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("/api/health/live", () => {
  it("returns 200 with status live", async () => {
    const { GET } = await import("@/app/api/health/live/route");
    const res = GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("live");
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("/api/health/ready", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockTransaction.mockReset();
    mockWarn.mockReset();
    // Default passthrough: run the transaction body against the mock execute.
    mockTransaction.mockImplementation(async (fn) =>
      fn({ execute: mockExecute }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 200 when the DB ping succeeds", async () => {
    mockExecute.mockResolvedValue([{ "?column?": 1 }]);
    const { GET } = await import("@/app/api/health/ready/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      checks: { db: string };
    };
    expect(body.status).toBe("ready");
    expect(body.checks.db).toBe("ok");
  });

  it("issues SET LOCAL statement_timeout before the SELECT (DB-side cancellation)", async () => {
    mockExecute.mockResolvedValue([{ "?column?": 1 }]);
    const { GET } = await import("@/app/api/health/ready/route");
    await GET();
    // First call inside the transaction must be the SET LOCAL — without it,
    // a slow DB would leave the SELECT running in the background after the
    // JS-side race rejects, accumulating connections.
    const firstCall = mockExecute.mock.calls[0]?.[0];
    const firstSql = JSON.stringify(firstCall);
    expect(firstSql).toContain("SET LOCAL statement_timeout");
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("returns 503 when the DB ping rejects", async () => {
    mockExecute.mockRejectedValue(new Error("boom"));
    const { GET } = await import("@/app/api/health/ready/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      status: string;
      checks: { db: string };
    };
    expect(body.status).toBe("not_ready");
    expect(body.checks.db).toBe("fail");
    expect(mockWarn).toHaveBeenCalled();
  });

  it("returns 503 when even the transaction itself hangs (JS-side safety net)", async () => {
    // Simulates a TCP-level stall: the transaction never resolves, so the
    // server-side statement_timeout cannot kick in. The JS race must still
    // reject and surface 503.
    mockTransaction.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 10_000)),
    );
    const { GET } = await import("@/app/api/health/ready/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { checks: { db: string } };
    expect(body.checks.db).toBe("fail");
  }, 10_000);
});
