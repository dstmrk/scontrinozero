// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const mockExecute = vi.fn();
vi.mock("@/db", () => ({
  getDb: () => ({ execute: mockExecute }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn() },
}));

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
