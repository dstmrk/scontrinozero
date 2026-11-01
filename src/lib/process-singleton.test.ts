/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { processSingleton } from "./process-singleton";

const KEY = "test.processSingleton";

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[
    Symbol.for(`scontrinozero.${KEY}`)
  ];
});

describe("processSingleton", () => {
  it("costruisce l'istanza alla prima richiesta", () => {
    const factory = vi.fn(() => ({ n: 1 }));

    const value = processSingleton(KEY, factory);

    expect(value).toEqual({ n: 1 });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("alle richieste successive restituisce la stessa istanza senza ricostruirla", () => {
    const factory = vi.fn(() => ({ n: 1 }));

    const a = processSingleton(KEY, factory);
    const b = processSingleton(KEY, factory);

    expect(b).toBe(a);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("chiavi diverse danno istanze diverse", () => {
    const a = processSingleton(KEY, () => ({}));
    const b = processSingleton(`${KEY}.other`, () => ({}));

    expect(b).not.toBe(a);
    delete (globalThis as Record<symbol, unknown>)[
      Symbol.for(`scontrinozero.${KEY}.other`)
    ];
  });

  // Il caso per cui esiste: due copie dello stesso modulo (i layer di
  // Turbopack per server action e route handler) devono vedere un'istanza.
  it("due copie del modulo condividono l'istanza", async () => {
    const first = processSingleton(KEY, () => ({}));
    vi.resetModules();
    const copy = await import("./process-singleton");

    expect(copy.processSingleton(KEY, () => ({}))).toBe(first);
  });
});
