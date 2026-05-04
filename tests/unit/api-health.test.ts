// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockExecute = vi.fn();
vi.mock("@/db", () => ({
  getDb: () => ({ execute: mockExecute }),
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
    mockWarn.mockReset();
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

  it("returns 503 when the DB ping exceeds the timeout", async () => {
    // Resolve only after the 1.5s budget; the race should reject first.
    mockExecute.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 5000)),
    );
    const { GET } = await import("@/app/api/health/ready/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { checks: { db: string } };
    expect(body.checks.db).toBe("fail");
  }, 10_000);
});
