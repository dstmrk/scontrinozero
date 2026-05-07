// @vitest-environment node
import { afterEach, describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockLoggerWarn, mockLoggerError } = vi.hoisted(() => ({
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: mockLoggerWarn, error: mockLoggerError },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { getClientIp, hashIp } from "./get-client-ip";

function makeHeaders(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("getClientIp", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe("CF-Connecting-IP (trusted, produzione Cloudflare)", () => {
    it("ritorna CF-Connecting-IP con priorità massima quando presente", () => {
      const headers = makeHeaders({
        "cf-connecting-ip": "1.2.3.4",
        "x-forwarded-for": "5.6.7.8",
        "x-real-ip": "9.10.11.12",
      });
      expect(getClientIp(headers)).toBe("1.2.3.4");
    });

    it("ignora X-Forwarded-For quando CF-Connecting-IP è presente (anti-spoof)", () => {
      const headers = makeHeaders({
        "cf-connecting-ip": "1.2.3.4",
        "x-forwarded-for": "evil-spoofed-ip",
      });
      expect(getClientIp(headers)).toBe("1.2.3.4");
    });
  });

  describe("X-Forwarded-For (fallback, solo dev/test senza Cloudflare)", () => {
    it("ritorna il primo IP da X-Forwarded-For se CF-Connecting-IP è assente", () => {
      const headers = makeHeaders({
        "x-forwarded-for": "5.6.7.8, 192.168.1.1",
      });
      expect(getClientIp(headers)).toBe("5.6.7.8");
    });

    it("gestisce X-Forwarded-For con un solo IP (senza virgola)", () => {
      const headers = makeHeaders({ "x-forwarded-for": "5.6.7.8" });
      expect(getClientIp(headers)).toBe("5.6.7.8");
    });

    it("rimuove gli spazi dall'IP in X-Forwarded-For", () => {
      const headers = makeHeaders({
        "x-forwarded-for": "  5.6.7.8  , 1.2.3.4",
      });
      expect(getClientIp(headers)).toBe("5.6.7.8");
    });
  });

  describe("X-Real-IP (ignorato — non standard)", () => {
    it("ritorna 'unknown' se solo X-Real-IP è presente (header non trusted)", () => {
      const headers = makeHeaders({ "x-real-ip": "9.10.11.12" });
      expect(getClientIp(headers)).toBe("unknown");
    });
  });

  describe("fallback", () => {
    it("ritorna 'unknown' se nessun header IP è presente", () => {
      const headers = makeHeaders({});
      expect(getClientIp(headers)).toBe("unknown");
    });
  });

  describe("produzione: XFF ignorato se CF-Connecting-IP assente (anti-spoof)", () => {
    it("ritorna 'unknown' in produzione se CF-Connecting-IP è assente (non cade su XFF)", () => {
      vi.stubEnv("NODE_ENV", "production");
      const headers = makeHeaders({ "x-forwarded-for": "attacker-ip" });
      expect(getClientIp(headers)).toBe("unknown");
    });

    it("ritorna CF-Connecting-IP in produzione quando presente", () => {
      vi.stubEnv("NODE_ENV", "production");
      const headers = makeHeaders({
        "cf-connecting-ip": "1.2.3.4",
        "x-forwarded-for": "attacker-ip",
      });
      expect(getClientIp(headers)).toBe("1.2.3.4");
    });

    it("emette logger.error con critical:true in produzione quando CF-Connecting-IP è assente", () => {
      vi.stubEnv("NODE_ENV", "production");
      const headers = makeHeaders({ "x-forwarded-for": "attacker-ip" });
      getClientIp(headers);
      // pino logMethod hook inoltra a Sentry solo level >= 50 (error).
      // Il warning storico non triggerava Sentry.
      expect(mockLoggerError).toHaveBeenCalledWith(
        { critical: true },
        expect.stringContaining(
          "CF-Connecting-IP header missing in production",
        ),
      );
      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });

    it("non logga error in produzione quando CF-Connecting-IP è presente", () => {
      vi.stubEnv("NODE_ENV", "production");
      const headers = makeHeaders({ "cf-connecting-ip": "1.2.3.4" });
      getClientIp(headers);
      expect(mockLoggerError).not.toHaveBeenCalled();
    });
  });
});

describe("hashIp", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 'unknown' for empty or 'unknown' input", () => {
    expect(hashIp("")).toBe("unknown");
    expect(hashIp("unknown")).toBe("unknown");
  });

  it("returns a stable 12-char tag for the same IP", () => {
    const a = hashIp("1.2.3.4");
    const b = hashIp("1.2.3.4");
    expect(a).toBe(b);
    expect(a).toHaveLength(12);
  });

  it("produces different tags for different IPs", () => {
    expect(hashIp("1.2.3.4")).not.toBe(hashIp("5.6.7.8"));
  });

  it("does not include the raw IP in the tag", () => {
    const tag = hashIp("203.0.113.42");
    expect(tag).not.toContain("203");
    expect(tag).not.toContain("113");
    expect(tag).toMatch(/^[0-9a-f]{12}$/);
  });

  it("changes the hash when LOG_HASH_SALT changes (rainbow-table resistance)", () => {
    vi.stubEnv("LOG_HASH_SALT", "salt-a");
    const withA = hashIp("1.2.3.4");
    vi.stubEnv("LOG_HASH_SALT", "salt-b");
    const withB = hashIp("1.2.3.4");
    expect(withA).not.toBe(withB);
  });
});
