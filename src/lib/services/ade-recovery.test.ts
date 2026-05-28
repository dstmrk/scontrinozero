// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getStalePendingThresholdMs } from "./ade-recovery";

describe("getStalePendingThresholdMs", () => {
  beforeEach(() => {
    delete process.env.STALE_PENDING_THRESHOLD_MINUTES;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 30 minutes (1_800_000 ms) when the env var is unset", () => {
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });

  it("honours a positive override in minutes", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "60");
    expect(getStalePendingThresholdMs()).toBe(60 * 60 * 1000);
  });

  it("honours a fractional minute override", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "0.5");
    expect(getStalePendingThresholdMs()).toBe(0.5 * 60 * 1000);
  });

  it("falls back to default on zero (avoids immediate recovery)", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "0");
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });

  it("falls back to default on negative values", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "-5");
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });

  it("falls back to default on non-numeric strings", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "abc");
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });

  it("falls back to default on NaN string", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "NaN");
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });

  it("falls back to default when the env var is an empty string", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "");
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });
});
