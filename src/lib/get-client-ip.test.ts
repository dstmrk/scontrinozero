// @vitest-environment node
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

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

import {
  getClientIp,
  hashIp,
  resetMissingCfIpThrottleForTests,
} from "./get-client-ip";

function makeHeaders(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("getClientIp", () => {
  beforeEach(() => {
    // Il throttle dell'allarme è stato al livello di modulo: senza reset i test
    // si influenzerebbero a vicenda in base all'ordine d'esecuzione.
    resetMissingCfIpThrottleForTests();
  });

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

    it("attribuisce l'allarme al mancato passaggio da Cloudflare, non a una sua misconfigurazione (SCONTRINOZERO-11)", () => {
      vi.stubEnv("NODE_ENV", "production");
      getClientIp(makeHeaders({}));
      const [, message] = mockLoggerError.mock.calls[0];
      // Il messaggio storico diceva "Cloudflare misconfiguration?" e mandava
      // a cercare il problema nel dashboard invece che nel bind della porta.
      expect(message).not.toMatch(/misconfiguration/i);
      expect(message).toMatch(/without passing through Cloudflare/i);
    });

    it("non logga error in produzione quando CF-Connecting-IP è presente", () => {
      vi.stubEnv("NODE_ENV", "production");
      const headers = makeHeaders({ "cf-connecting-ip": "1.2.3.4" });
      getClientIp(headers);
      expect(mockLoggerError).not.toHaveBeenCalled();
    });
  });

  describe("throttle dell'allarme misconfig (REVIEW #83)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("logga una sola volta su 100 richieste consecutive, restituendo sempre 'unknown'", () => {
      vi.stubEnv("NODE_ENV", "production");
      const headers = makeHeaders({ "x-forwarded-for": "attacker-ip" });

      const results = Array.from({ length: 100 }, () => getClientIp(headers));

      // Un solo evento Sentry, ma il fail-closed non cambia mai.
      expect(mockLoggerError).toHaveBeenCalledTimes(1);
      expect(results.every((ip) => ip === "unknown")).toBe(true);
    });

    it("torna a loggare dopo l'intervallo di throttle", () => {
      vi.useFakeTimers();
      vi.stubEnv("NODE_ENV", "production");
      const headers = makeHeaders({});

      getClientIp(headers);
      vi.advanceTimersByTime(5 * 60 * 1000 - 1);
      getClientIp(headers);
      expect(mockLoggerError).toHaveBeenCalledTimes(1);

      // Il confronto è >=: al compimento esatto dell'intervallo riparte.
      vi.advanceTimersByTime(1);
      expect(getClientIp(headers)).toBe("unknown");
      expect(mockLoggerError).toHaveBeenCalledTimes(2);
    });

    it("una richiesta con header valido non consuma né sposta la finestra di throttle", () => {
      vi.stubEnv("NODE_ENV", "production");

      // Nessun log finora: il primo miss deve comunque allarmare subito.
      expect(getClientIp(makeHeaders({ "cf-connecting-ip": "1.2.3.4" }))).toBe(
        "1.2.3.4",
      );
      getClientIp(makeHeaders({}));

      expect(mockLoggerError).toHaveBeenCalledTimes(1);
    });

    it("fuori produzione non logga mai e non arma il throttle", () => {
      // Dev/test: nessun allarme. Se il throttle venisse armato qui, il primo
      // miss reale in produzione resterebbe silenzioso per 5 minuti.
      getClientIp(makeHeaders({}));
      expect(mockLoggerError).not.toHaveBeenCalled();

      vi.stubEnv("NODE_ENV", "production");
      getClientIp(makeHeaders({}));
      expect(mockLoggerError).toHaveBeenCalledTimes(1);
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
