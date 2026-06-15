// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AdeSessionCache, type CachedAdeClient } from "./session-cache";
import type { AdeSession } from "./client";
import type { FisconlineCredentials } from "./types";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const CREDENTIALS: FisconlineCredentials = {
  codiceFiscale: "RSSMRA80A01H501U",
  password: "secret",
  pin: "1234567890",
};
const SESSION: AdeSession = {
  pAuth: "p",
  partitaIva: "01234567890",
  createdAt: 0,
};

/**
 * Fake CachedAdeClient: implementa l'intera interfaccia AdeClient con stub, ma
 * traccia login/logout/setCredentials/clearCredentials per le asserzioni.
 */
function makeFakeClient(): CachedAdeClient {
  return {
    login: vi.fn().mockResolvedValue(SESSION),
    loginSpid: vi.fn().mockResolvedValue(SESSION),
    submitSale: vi.fn(),
    submitVoid: vi.fn(),
    getFiscalData: vi.fn(),
    getProducts: vi.fn(),
    getDocument: vi.fn(),
    searchDocuments: vi.fn(),
    changePasswordFisconline: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    setCredentials: vi.fn(),
    clearCredentials: vi.fn(),
  };
}

describe("AdeSessionCache", () => {
  let now: number;
  let clients: CachedAdeClient[];
  let createClient: () => CachedAdeClient;

  beforeEach(() => {
    now = 1_000_000;
    clients = [];
    createClient = vi.fn(() => {
      const client = makeFakeClient();
      clients.push(client);
      return client;
    });
  });

  // Flush the microtask queue (login() resolves over several microtask hops).
  const flush = () => new Promise((r) => setTimeout(r, 0));

  function makeCache(opts: { ttlMs?: number; maxEntries?: number } = {}) {
    return new AdeSessionCache({
      createClient,
      now: () => now,
      ttlMs: opts.ttlMs ?? 10_000,
      maxEntries: opts.maxEntries ?? 100,
    });
  }

  it("logs in once and reuses the session for two sequential operations", async () => {
    const cache = makeCache();

    await cache.run("biz", CREDENTIALS, () => Promise.resolve("a"));
    await cache.run("biz", CREDENTIALS, () => Promise.resolve("b"));

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(clients[0].login).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(1);
  });

  it("re-injects credentials on a cache hit (for 401 re-auth)", async () => {
    const cache = makeCache();

    await cache.run("biz", CREDENTIALS, () => Promise.resolve(null));
    await cache.run("biz", CREDENTIALS, () => Promise.resolve(null));

    // login already sets credentials on first op; reuse re-injects via setCredentials.
    expect(clients[0].setCredentials).toHaveBeenCalledWith(CREDENTIALS);
  });

  it("clears credentials from the cached client after each operation", async () => {
    const cache = makeCache();

    await cache.run("biz", CREDENTIALS, () => Promise.resolve(null));

    expect(clients[0].clearCredentials).toHaveBeenCalledTimes(1);
    // The session stays cached, but credentials must not be retained.
    expect(cache.size).toBe(1);
  });

  it("returns the value produced by fn", async () => {
    const cache = makeCache();
    const result = await cache.run("biz", CREDENTIALS, () =>
      Promise.resolve({ ok: true }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("re-logs in after TTL expiry and logs out the stale client", async () => {
    const cache = makeCache({ ttlMs: 10_000 });

    await cache.run("biz", CREDENTIALS, () => Promise.resolve(null));
    now += 10_001; // past TTL
    await cache.run("biz", CREDENTIALS, () => Promise.resolve(null));

    expect(createClient).toHaveBeenCalledTimes(2);
    expect(clients[0].logout).toHaveBeenCalledTimes(1); // stale one cleaned up
    expect(clients[1].login).toHaveBeenCalledTimes(1);
  });

  it("invalidates the session on error and logs out, re-logging in next time", async () => {
    const cache = makeCache();

    await expect(
      cache.run("biz", CREDENTIALS, () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");

    expect(clients[0].logout).toHaveBeenCalledTimes(1);
    expect(clients[0].clearCredentials).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(0);

    // Next operation must perform a fresh login.
    await cache.run("biz", CREDENTIALS, () => Promise.resolve(null));
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("evicts the least-recently-used session past the cap and logs it out", async () => {
    const cache = makeCache({ maxEntries: 1 });

    await cache.run("biz-A", CREDENTIALS, () => Promise.resolve(null));
    await cache.run("biz-B", CREDENTIALS, () => Promise.resolve(null));

    expect(cache.size).toBe(1);
    expect(clients[0].logout).toHaveBeenCalledTimes(1); // A evicted
  });

  it("invalidate() logs out and removes the cached session", async () => {
    const cache = makeCache();
    await cache.run("biz", CREDENTIALS, () => Promise.resolve(null));
    expect(cache.size).toBe(1);

    await cache.invalidate("biz");

    expect(clients[0].logout).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(0);

    // Subsequent operation re-logs in.
    await cache.run("biz", CREDENTIALS, () => Promise.resolve(null));
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("invalidate() still removes the entry when logout rejects", async () => {
    const cache = makeCache();
    await cache.run("biz", CREDENTIALS, () => Promise.resolve(null));
    (clients[0].logout as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("logout boom"),
    );

    await expect(cache.invalidate("biz")).resolves.toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("invalidate() on an unknown business is a no-op", async () => {
    const cache = makeCache();
    await expect(cache.invalidate("nope")).resolves.toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("serializes concurrent operations on the same business (single login)", async () => {
    const cache = makeCache();
    const order: string[] = [];

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((r) => {
      releaseFirst = r;
    });

    const p1 = cache.run("biz", CREDENTIALS, async () => {
      order.push("start-1");
      await firstGate;
      order.push("end-1");
    });
    const p2 = cache.run("biz", CREDENTIALS, async () => {
      order.push("start-2");
      order.push("end-2");
    });

    // Let microtasks settle: op2 must NOT start while op1 holds the lock.
    await flush();
    expect(order).toEqual(["start-1"]);

    releaseFirst();
    await Promise.all([p1, p2]);

    expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"]);
    // Second op reused the session opened by the first.
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("runs operations for different businesses in parallel", async () => {
    const cache = makeCache();
    const order: string[] = [];

    let releaseA!: () => void;
    const gateA = new Promise<void>((r) => {
      releaseA = r;
    });

    const pA = cache.run("biz-A", CREDENTIALS, async () => {
      order.push("start-A");
      await gateA;
      order.push("end-A");
    });
    const pB = cache.run("biz-B", CREDENTIALS, async () => {
      order.push("start-B");
    });

    await flush();
    // B is not blocked by A's in-flight operation.
    expect(order).toContain("start-B");

    releaseA();
    await Promise.all([pA, pB]);
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("keeps the lock chain working after an operation throws", async () => {
    const cache = makeCache();

    const failing = cache
      .run("biz", CREDENTIALS, () => Promise.reject(new Error("first fails")))
      .catch(() => "caught");
    const following = cache.run("biz", CREDENTIALS, () =>
      Promise.resolve("second ok"),
    );

    await expect(failing).resolves.toBe("caught");
    await expect(following).resolves.toBe("second ok");
  });
});
