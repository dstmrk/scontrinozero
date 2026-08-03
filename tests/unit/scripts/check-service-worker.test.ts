import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkServiceWorker,
  MIN_SW_BYTES,
} from "../../../scripts/check-service-worker.mjs";

const { mockStat } = vi.hoisted(() => ({ mockStat: vi.fn() }));

vi.mock("fs/promises", () => ({
  default: { stat: mockStat },
  stat: mockStat,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkServiceWorker", () => {
  it("passes when the bundle exists and has a plausible size", async () => {
    mockStat.mockResolvedValue({ isFile: () => true, size: 64_000 });

    const result = await checkServiceWorker("/app/public/sw.js");

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when the bundle was never emitted", async () => {
    // È il caso reale di REVIEW #84: `@serwist/next` sotto Turbopack stampa un
    // warning e non emette nulla, lasciando il build verde.
    mockStat.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );

    const result = await checkServiceWorker("/app/public/sw.js");

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("/app/public/sw.js");
  });

  it("fails when the path exists but is not a file", async () => {
    mockStat.mockResolvedValue({ isFile: () => false, size: 4096 });

    const result = await checkServiceWorker("/app/public/sw.js");

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("non è un file");
  });

  it("fails on a truncated or stub bundle", async () => {
    mockStat.mockResolvedValue({ isFile: () => true, size: MIN_SW_BYTES - 1 });

    const result = await checkServiceWorker("/app/public/sw.js");

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain(String(MIN_SW_BYTES));
  });

  it("accepts a bundle exactly at the minimum size", async () => {
    mockStat.mockResolvedValue({ isFile: () => true, size: MIN_SW_BYTES });

    const result = await checkServiceWorker("/app/public/sw.js");

    expect(result.ok).toBe(true);
  });
});
