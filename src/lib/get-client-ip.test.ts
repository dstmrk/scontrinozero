// @vitest-environment node
import { afterEach, describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockLoggerWarn } = vi.hoisted(() => ({
  mockLoggerWarn: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: mockLoggerWarn },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { getClientIp } from "./get-client-ip";

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

    it("logga un warning in produzione quando CF-Connecting-IP è assente", () => {
      vi.stubEnv("NODE_ENV", "production");
      const headers = makeHeaders({ "x-forwarded-for": "attacker-ip" });
      getClientIp(headers);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining(
          "CF-Connecting-IP header missing in production",
        ),
      );
    });

    it("non logga warning in produzione quando CF-Connecting-IP è presente", () => {
      vi.stubEnv("NODE_ENV", "production");
      const headers = makeHeaders({ "cf-connecting-ip": "1.2.3.4" });
      getClientIp(headers);
      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });
  });
});
