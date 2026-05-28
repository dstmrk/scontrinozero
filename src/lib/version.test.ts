/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import pkg from "../../package.json";
import { APP_VERSION, getBuildSha } from "./version";

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
