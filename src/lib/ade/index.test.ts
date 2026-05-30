// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { getAdeMode, createAdeClient } from "./index";
import { MockAdeClient } from "./mock-client";
import { RealAdeClient } from "./real-client";

describe("getAdeMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns "real" when ADE_MODE=real (production)', () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADE_MODE", "real");
    expect(getAdeMode()).toBe("real");
  });

  it('returns "mock" when ADE_MODE=mock (production sandbox)', () => {
    // Sandbox runs a production build with ADE_MODE=mock — must NOT throw.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADE_MODE", "mock");
    expect(getAdeMode()).toBe("mock");
  });

  it("throws in production when ADE_MODE is absent (fail-closed)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADE_MODE", "");
    expect(() => getAdeMode()).toThrow(/ADE_MODE non valido o assente/);
  });

  it("throws in production when ADE_MODE has an unrecognized value", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADE_MODE", "REAL"); // wrong case → not recognized
    expect(() => getAdeMode()).toThrow(/ADE_MODE non valido o assente/);
  });

  it('falls back to "mock" in test env when ADE_MODE is absent', () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ADE_MODE", "");
    expect(getAdeMode()).toBe("mock");
  });

  it('falls back to "mock" in development when ADE_MODE has a garbage value', () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ADE_MODE", "nonsense");
    expect(getAdeMode()).toBe("mock");
  });

  it('honours an explicit "real" even outside production', () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ADE_MODE", "real");
    expect(getAdeMode()).toBe("real");
  });
});

describe("createAdeClient", () => {
  it("returns a MockAdeClient for mode=mock", () => {
    expect(createAdeClient("mock")).toBeInstanceOf(MockAdeClient);
  });

  it("returns a RealAdeClient for mode=real", () => {
    expect(createAdeClient("real")).toBeInstanceOf(RealAdeClient);
  });
});
