/**
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdeInteractiveSessionStore } from "./interactive-session-store";
import { AdeReauthRequiredError, AdeSessionExpiredError } from "./errors";
import type { AdeClient } from "./client";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/** Fake client: solo `logout` è esercitato dallo store. */
function fakeClient(): AdeClient {
  return {
    logout: vi.fn().mockResolvedValue(undefined),
  } as unknown as AdeClient;
}

describe("AdeInteractiveSessionStore", () => {
  let now: number;
  let store: AdeInteractiveSessionStore;

  beforeEach(() => {
    now = 1_000_000;
    store = new AdeInteractiveSessionStore({ now: () => now });
  });

  it("run without a stored session throws AdeReauthRequiredError", async () => {
    await expect(
      store.run("biz-1", "cie", async () => "x"),
    ).rejects.toBeInstanceOf(AdeReauthRequiredError);
  });

  it("set + run executes fn with the stored client", async () => {
    const client = fakeClient();
    store.set("biz-1", client);

    const result = await store.run("biz-1", "cie", async (c) => {
      expect(c).toBe(client);
      return "done";
    });

    expect(result).toBe("done");
    expect(store.has("biz-1")).toBe(true);
  });

  it("converts AdeSessionExpiredError (401) into AdeReauthRequiredError and evicts", async () => {
    const client = fakeClient();
    store.set("biz-1", client);

    await expect(
      store.run("biz-1", "cie", async () => {
        throw new AdeSessionExpiredError();
      }),
    ).rejects.toBeInstanceOf(AdeReauthRequiredError);

    // Sessione rimossa + logout best-effort.
    expect(store.has("biz-1")).toBe(false);
    expect(client.logout).toHaveBeenCalled();
  });

  it("propagates non-session errors unchanged (no eviction)", async () => {
    store.set("biz-1", fakeClient());

    await expect(
      store.run("biz-1", "cie", async () => {
        throw new Error("submit boom");
      }),
    ).rejects.toThrow("submit boom");

    // La sessione resta: non è un problema di autenticazione.
    expect(store.has("biz-1")).toBe(true);
  });

  it("expired TTL: has() is false and run() requires reauth", async () => {
    store = new AdeInteractiveSessionStore({ ttlMs: 1000, now: () => now });
    store.set("biz-1", fakeClient());
    expect(store.has("biz-1")).toBe(true);

    now += 1001;
    expect(store.has("biz-1")).toBe(false);
    await expect(
      store.run("biz-1", "cie", async () => "x"),
    ).rejects.toBeInstanceOf(AdeReauthRequiredError);
  });

  it("set replaces a previous session (logs out the old client)", () => {
    const oldClient = fakeClient();
    const newClient = fakeClient();
    store.set("biz-1", oldClient);
    store.set("biz-1", newClient);

    expect(oldClient.logout).toHaveBeenCalled();
    expect(store.size).toBe(1);
  });

  it("invalidate removes and logs out the session", async () => {
    const client = fakeClient();
    store.set("biz-1", client);

    await store.invalidate("biz-1");

    expect(store.has("biz-1")).toBe(false);
    expect(client.logout).toHaveBeenCalled();
  });

  it("serializes concurrent operations per business", async () => {
    store.set("biz-1", fakeClient());
    const order: string[] = [];

    const p1 = store.run("biz-1", "cie", async () => {
      order.push("start-1");
      await new Promise((r) => setTimeout(r, 10));
      order.push("end-1");
    });
    const p2 = store.run("biz-1", "cie", async () => {
      order.push("start-2");
    });

    await Promise.all([p1, p2]);
    expect(order).toEqual(["start-1", "end-1", "start-2"]);
  });
  it.each(["cie", "spid"] as const)(
    "senza sessione l'errore di rinnovo porta il metodo %s",
    async (method) => {
      await expect(
        store.run("biz-1", method, async () => "x"),
      ).rejects.toMatchObject({ method });
    },
  );

  it("su 401 l'errore di rinnovo porta il metodo della sessione adottata", async () => {
    store.set("biz-1", fakeClient());

    await expect(
      store.run("biz-1", "spid", async () => {
        throw new AdeSessionExpiredError();
      }),
    ).rejects.toMatchObject({ method: "spid" });
  });
});
