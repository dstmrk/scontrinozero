/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import pkg from "../../package.json";
import { APP_VERSION, getBuildLabel, getBuildSha } from "./version";

describe("APP_VERSION", () => {
  it("matches the version in package.json", () => {
    expect(APP_VERSION).toBe(pkg.version);
  });
});

describe("getBuildSha", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 'dev' when BUILD_SHA is not set", () => {
    vi.stubEnv("BUILD_SHA", "");
    expect(getBuildSha()).toBe("dev");
  });

  it("truncates a 40-char SHA to its first 7 characters", () => {
    vi.stubEnv("BUILD_SHA", "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678");
    expect(getBuildSha()).toBe("a1b2c3d");
  });
});

describe("getBuildLabel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the bare short SHA when not on the dev channel (prod)", () => {
    vi.stubEnv("BUILD_CHANNEL", "");
    vi.stubEnv("BUILD_SHA", "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678");
    expect(getBuildLabel()).toBe("a1b2c3d");
  });

  it("returns 'dev' when nothing is injected (local/self-host)", () => {
    vi.stubEnv("BUILD_CHANNEL", "");
    vi.stubEnv("BUILD_SHA", "");
    expect(getBuildLabel()).toBe("dev");
  });

  it("prefixes the short SHA with 'dev' on the dev channel", () => {
    vi.stubEnv("BUILD_CHANNEL", "dev");
    vi.stubEnv("BUILD_SHA", "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678");
    expect(getBuildLabel()).toBe("dev a1b2c3d");
  });

  it("returns plain 'dev' on the dev channel without a SHA", () => {
    vi.stubEnv("BUILD_CHANNEL", "dev");
    vi.stubEnv("BUILD_SHA", "");
    expect(getBuildLabel()).toBe("dev");
  });
});
