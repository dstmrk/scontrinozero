import { describe, it, expect, afterEach, vi } from "vitest";
import { readHashId, readServerHashId, subscribeToHash } from "./hash-target";

function setHash(hash: string): void {
  globalThis.location.hash = hash;
}

afterEach(() => {
  globalThis.location.hash = "";
});

describe("readHashId", () => {
  it("ritorna null quando non c'è hash", () => {
    expect(readHashId()).toBeNull();
  });

  it("ritorna null su hash vuoto (solo '#')", () => {
    setHash("#");

    expect(readHashId()).toBeNull();
  });

  it("estrae l'id togliendo il '#'", () => {
    setHash("#api-keys");

    expect(readHashId()).toBe("api-keys");
  });

  it("decodifica un fragment percent-encoded", () => {
    setHash("#sezione%20uno");

    expect(readHashId()).toBe("sezione uno");
  });

  it("degrada al raw su fragment malformato invece di lanciare", () => {
    setHash("#%E0%A4%A");

    expect(readHashId()).toBe("%E0%A4%A");
  });
});

describe("readServerHashId", () => {
  it("ignora l'hash: il browser non lo manda mai al server", () => {
    setHash("#api-keys");

    expect(readServerHashId()).toBeNull();
  });
});

describe("subscribeToHash", () => {
  it("notifica al cambio di hash", () => {
    const onStoreChange = vi.fn();
    const unsubscribe = subscribeToHash(onStoreChange);

    globalThis.dispatchEvent(new Event("hashchange"));

    expect(onStoreChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("smette di notificare dopo l'unsubscribe", () => {
    const onStoreChange = vi.fn();
    subscribeToHash(onStoreChange)();

    globalThis.dispatchEvent(new Event("hashchange"));

    expect(onStoreChange).not.toHaveBeenCalled();
  });
});
