/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "./rate-limit";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    limiter?.destroy();
    vi.useRealTimers();
  });

  it("allows requests up to maxRequests", () => {
    limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000 });

    const r1 = limiter.check("key");
    const r2 = limiter.check("key");
    const r3 = limiter.check("key");

    expect(r1.success).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r2.success).toBe(true);
    expect(r2.remaining).toBe(1);
    expect(r3.success).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("blocks requests exceeding maxRequests", () => {
    limiter = new RateLimiter({ maxRequests: 2, windowMs: 60_000 });

    limiter.check("key");
    limiter.check("key");
    const r3 = limiter.check("key");

    expect(r3.success).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("tracks keys independently", () => {
    limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000 });

    const rA = limiter.check("a");
    const rB = limiter.check("b");
    const rA2 = limiter.check("a");

    expect(rA.success).toBe(true);
    expect(rB.success).toBe(true);
    expect(rA2.success).toBe(false);
  });

  it("resets counter after window expires", () => {
    limiter = new RateLimiter({ maxRequests: 1, windowMs: 1_000 });

    const r1 = limiter.check("key");
    expect(r1.success).toBe(true);

    const r2 = limiter.check("key");
    expect(r2.success).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(1_001);

    const r3 = limiter.check("key");
    expect(r3.success).toBe(true);
  });

  it("returns correct resetAt timestamp", () => {
    const now = Date.now();
    limiter = new RateLimiter({ maxRequests: 5, windowMs: 30_000 });

    const result = limiter.check("key");
    expect(result.resetAt).toBe(now + 30_000);
  });

  it("reset() clears the state for a key", () => {
    limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000 });

    limiter.check("key");
    const blocked = limiter.check("key");
    expect(blocked.success).toBe(false);

    limiter.reset("key");

    const afterReset = limiter.check("key");
    expect(afterReset.success).toBe(true);
  });

  it("periodic cleanup removes expired entries", () => {
    limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 100,
      cleanupIntervalMs: 200,
    });

    limiter.check("key1");
    expect(limiter.size).toBe(1);

    // Window expires
    vi.advanceTimersByTime(101);
    // Cleanup runs
    vi.advanceTimersByTime(200);

    expect(limiter.size).toBe(0);
  });

  it("enforces maxKeys cap with FIFO eviction", () => {
    limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxKeys: 3,
    });

    limiter.check("a");
    limiter.check("b");
    limiter.check("c");
    expect(limiter.size).toBe(3);

    limiter.check("d");
    expect(limiter.size).toBe(3);

    const aFresh = limiter.check("a");
    expect(aFresh.success).toBe(true);
    expect(aFresh.remaining).toBe(4);
  });

  it("does not double-count when re-checking an existing key under the cap", () => {
    limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxKeys: 2,
    });

    limiter.check("a");
    limiter.check("b");
    limiter.check("a");
    expect(limiter.size).toBe(2);
  });
});

describe("RATE_LIMIT_WINDOWS", () => {
  it("expone le finestre canoniche", () => {
    expect(RATE_LIMIT_WINDOWS.AUTH_15_MIN).toBe(15 * 60 * 1000);
    expect(RATE_LIMIT_WINDOWS.HOURLY).toBe(60 * 60 * 1000);
  });
});
