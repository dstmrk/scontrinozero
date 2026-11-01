/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  EMIT_RATE_LIMIT,
  checkEmitRateLimit,
  emitRateLimiter,
} from "./emit-rate-limit";

const BUSINESS = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("emit-rate-limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    emitRateLimiter.reset(`emit:${BUSINESS}`);
    emitRateLimiter.reset(`emit:${OTHER}`);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("espone le soglie concordate: 8 al minuto, 250 all'ora", () => {
    expect(EMIT_RATE_LIMIT).toEqual({ perMinute: 8, perHour: 250 });
  });

  it("ammette 8 emissioni nello stesso minuto e rifiuta la nona", () => {
    for (let i = 0; i < 8; i++) {
      expect(checkEmitRateLimit(BUSINESS).success).toBe(true);
    }
    expect(checkEmitRateLimit(BUSINESS).success).toBe(false);
  });

  it("dopo il minuto il picco si libera", () => {
    for (let i = 0; i < 9; i++) checkEmitRateLimit(BUSINESS);
    vi.advanceTimersByTime(60_000);

    expect(checkEmitRateLimit(BUSINESS).success).toBe(true);
  });

  it("rifiuta la 251ª emissione dell'ora anche a ritmo sotto il picco", () => {
    // 250 emissioni a 5 al minuto: 50 minuti, sempre sotto le 8/min
    for (let i = 0; i < 250; i++) {
      expect(checkEmitRateLimit(BUSINESS).success).toBe(true);
      if (i % 5 === 4) vi.advanceTimersByTime(60_000);
    }

    const blocked = checkEmitRateLimit(BUSINESS);
    expect(blocked.success).toBe(false);
  });

  it("conta per attività: un'altra attività ha il suo contatore", () => {
    for (let i = 0; i < 8; i++) checkEmitRateLimit(BUSINESS);

    expect(checkEmitRateLimit(BUSINESS).success).toBe(false);
    expect(checkEmitRateLimit(OTHER).success).toBe(true);
  });

  // Due copie del modulo (come i due layer di Turbopack: cassa e route API)
  // devono contare sullo stesso limiter, o il tetto raddoppia.
  it("due istanze del modulo condividono lo stesso contatore", async () => {
    vi.resetModules();
    const other = await import("./emit-rate-limit");

    expect(other.emitRateLimiter).toBe(emitRateLimiter);
    for (let i = 0; i < 8; i++) checkEmitRateLimit(BUSINESS);
    expect(other.checkEmitRateLimit(BUSINESS).success).toBe(false);
  });
});
