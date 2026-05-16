// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockError, mockWarn } = vi.hoisted(() => ({
  mockError: vi.fn(),
  mockWarn: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mockError,
    warn: mockWarn,
  },
}));

import { parseTrustedHostnameEnv } from "./hostname-env";

const ENV_NAME = "TEST_HOSTNAME_ENV_VAR";

describe("parseTrustedHostnameEnv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env[ENV_NAME];
  });

  afterEach(() => {
    delete process.env[ENV_NAME];
    vi.unstubAllEnvs();
  });

  describe("valid input", () => {
    it("returns the env value when valid", () => {
      process.env[ENV_NAME] = "app.scontrinozero.it";
      expect(parseTrustedHostnameEnv(ENV_NAME, "fallback.it")).toBe(
        "app.scontrinozero.it",
      );
      expect(mockError).not.toHaveBeenCalled();
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it("returns the fallback when env var is unset", () => {
      delete process.env[ENV_NAME];
      expect(parseTrustedHostnameEnv(ENV_NAME, "fallback.it")).toBe(
        "fallback.it",
      );
      expect(mockError).not.toHaveBeenCalled();
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it("trims whitespace", () => {
      process.env[ENV_NAME] = "   app.example.com   ";
      expect(parseTrustedHostnameEnv(ENV_NAME, "fallback.it")).toBe(
        "app.example.com",
      );
    });

    it("lowercases the value", () => {
      process.env[ENV_NAME] = "App.ScontrinoZero.IT";
      expect(parseTrustedHostnameEnv(ENV_NAME, "fallback.it")).toBe(
        "app.scontrinozero.it",
      );
    });

    it("strips a trailing dot (FQDN form)", () => {
      process.env[ENV_NAME] = "app.example.com.";
      expect(parseTrustedHostnameEnv(ENV_NAME, "fallback.it")).toBe(
        "app.example.com",
      );
    });

    it("accepts hostnames with hyphens", () => {
      process.env[ENV_NAME] = "my-app-staging.example.com";
      expect(parseTrustedHostnameEnv(ENV_NAME, "fallback.it")).toBe(
        "my-app-staging.example.com",
      );
    });

    it("accepts single-label hostnames (e.g. localhost)", () => {
      process.env[ENV_NAME] = "localhost";
      expect(parseTrustedHostnameEnv(ENV_NAME, "fallback.it")).toBe(
        "localhost",
      );
    });
  });

  describe("invalid input → fallback", () => {
    afterEach(() => vi.unstubAllEnvs());

    it.each([
      ["empty string", ""],
      ["whitespace only", "   "],
      ["scheme http://", "http://app.example.com"],
      ["scheme https://", "https://app.example.com"],
      ["path", "app.example.com/path"],
      ["query", "app.example.com?x=1"],
      ["fragment", "app.example.com#frag"],
      ["port", "app.example.com:443"],
      ["space inside", "app .example.com"],
      ["leading dot", ".app.example.com"],
      ["leading hyphen", "-app.example.com"],
      ["trailing hyphen on label", "app-.example.com"],
      ["double dot (empty label)", "app..example.com"],
      ["invalid char (underscore)", "my_app.example.com"],
      ["invalid char (asterisk)", "*.example.com"],
    ])("rejects %s and returns fallback", (_label, value) => {
      process.env[ENV_NAME] = value;
      expect(parseTrustedHostnameEnv(ENV_NAME, "fallback.it")).toBe(
        "fallback.it",
      );
    });

    it("logs critical:true in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      process.env[ENV_NAME] = "https://evil.com";
      parseTrustedHostnameEnv(ENV_NAME, "fallback.it");
      expect(mockError).toHaveBeenCalledTimes(1);
      const [meta] = mockError.mock.calls[0];
      expect(meta).toMatchObject({
        critical: true,
        envVar: ENV_NAME,
        fallbackHost: "fallback.it",
      });
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it("logs warn (not error) in test/dev", () => {
      vi.stubEnv("NODE_ENV", "test");
      process.env[ENV_NAME] = "https://evil.com";
      parseTrustedHostnameEnv(ENV_NAME, "fallback.it");
      expect(mockWarn).toHaveBeenCalledTimes(1);
      expect(mockError).not.toHaveBeenCalled();
    });

    it("rejects very long hostnames (>253 chars)", () => {
      const longLabel = "a".repeat(60);
      const tooLong = `${longLabel}.${longLabel}.${longLabel}.${longLabel}.${longLabel}.example.com`;
      process.env[ENV_NAME] = tooLong;
      expect(parseTrustedHostnameEnv(ENV_NAME, "fallback.it")).toBe(
        "fallback.it",
      );
    });

    it("rejects labels >63 chars", () => {
      const label = "a".repeat(64);
      process.env[ENV_NAME] = `${label}.example.com`;
      expect(parseTrustedHostnameEnv(ENV_NAME, "fallback.it")).toBe(
        "fallback.it",
      );
    });
  });

  describe("fallback validation", () => {
    it("throws when fallback itself is invalid (dev error)", () => {
      expect(() =>
        parseTrustedHostnameEnv(ENV_NAME, "https://broken-fallback.com"),
      ).toThrow(/fallback.*not a valid hostname/);
    });

    it("throws when fallback is empty", () => {
      expect(() => parseTrustedHostnameEnv(ENV_NAME, "")).toThrow(
        /fallback.*not a valid hostname/,
      );
    });
  });
});
