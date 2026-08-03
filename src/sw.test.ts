import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RouteMatchCallbackOptions, RuntimeCaching } from "serwist";

// Le classi mockate vivono in `vi.hoisted` (non nel factory) perché il factory
// viene ri-valutato a ogni istanziazione del modulo: una classe definita lì
// dentro avrebbe identità diversa da quella vista dal test e ogni `instanceof`
// fallirebbe. Mai arrow function per un mock di classe (skill
// `testing-patterns`): `new X()` su una arrow lancia "is not a constructor".
const {
  MockNetworkOnly,
  mockDefaultCacheEntry,
  mockSerwistOptions,
  mockAddEventListeners,
} = vi.hoisted(() => {
  class MockNetworkOnly {}
  return {
    MockNetworkOnly,
    // Sentinella: serve a distinguere "defaultCache spreddato dopo l'override"
    // da "defaultCache sostituito dall'override".
    mockDefaultCacheEntry: {
      matcher: () => true,
      handler: "default-cache-sentinel",
    },
    mockSerwistOptions: vi.fn(),
    mockAddEventListeners: vi.fn(),
  };
});

vi.mock("@serwist/next/worker", () => ({
  defaultCache: [mockDefaultCacheEntry],
}));

vi.mock("serwist", () => {
  class MockSerwist {
    readonly addEventListeners = mockAddEventListeners;

    constructor(options: unknown) {
      mockSerwistOptions(options);
    }
  }
  return { Serwist: MockSerwist, NetworkOnly: MockNetworkOnly };
});

type SerwistOptions = {
  precacheEntries: unknown;
  skipWaiting: boolean;
  clientsClaim: boolean;
  navigationPreload: boolean;
  runtimeCaching: RuntimeCaching[];
  fallbacks: {
    entries: {
      url: string;
      matcher: (options: { request: Request }) => boolean;
    }[];
  };
};

const matches = (rule: RuntimeCaching, url: string, sameOrigin: boolean) => {
  const { matcher } = rule;
  // `RuntimeCaching["matcher"]` ammette anche string/RegExp: l'override deve
  // essere una callback, altrimenti non potrebbe leggere `sameOrigin`.
  if (typeof matcher !== "function") {
    throw new TypeError("il matcher dell'override deve essere una callback");
  }
  return matcher({
    url: new URL(url),
    sameOrigin,
  } as RouteMatchCallbackOptions);
};

describe("service worker (src/sw.ts)", () => {
  let options: SerwistOptions;

  // Cerca la regola per handler, non per indice: così i test sul matcher non
  // possono passare per caso pescando una entry di `defaultCache`.
  const networkOnlyRule = () => {
    const rule = options.runtimeCaching.find(
      (entry) => entry.handler instanceof MockNetworkOnly,
    );
    if (!rule) throw new Error("nessuna regola NetworkOnly registrata");
    return rule;
  };

  beforeAll(async () => {
    // `self` non esiste nell'environment node: senza stub l'import di sw.ts
    // esplode su `self.__SW_MANIFEST`.
    vi.stubGlobal("self", { __SW_MANIFEST: ["/offline"] });
    await import("./sw");
    options = mockSerwistOptions.mock.calls[0][0] as SerwistOptions;
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("registers the service worker event listeners", () => {
    expect(mockAddEventListeners).toHaveBeenCalledTimes(1);
  });

  it("passes the injected precache manifest and lifecycle flags", () => {
    expect(options.precacheEntries).toEqual(["/offline"]);
    expect(options.skipWaiting).toBe(true);
    expect(options.clientsClaim).toBe(true);
    expect(options.navigationPreload).toBe(true);
  });

  it("puts a NetworkOnly rule FIRST, before defaultCache (REVIEW #73)", () => {
    // L'ordine è la sostanza del fix: vince il primo matcher, quindi una
    // regola dopo lo spread di defaultCache non intercetterebbe nulla.
    expect(options.runtimeCaching[0].handler).toBeInstanceOf(MockNetworkOnly);
  });

  it("keeps defaultCache after the override instead of replacing it", () => {
    expect(options.runtimeCaching).toHaveLength(2);
    expect(options.runtimeCaching[1]).toBe(mockDefaultCacheEntry);
  });

  it("excludes same-origin tenant API GETs from the runtime cache", () => {
    const rule = networkOnlyRule();

    expect(
      matches(rule, "https://app.scontrinozero.it/api/export/receipts", true),
    ).toBe(true);
    expect(
      matches(
        rule,
        "https://app.scontrinozero.it/api/documents/8f1c1f6e-0000-4000-8000-000000000000/pdf",
        true,
      ),
    ).toBe(true);
    // `/v1/` è il path pre-rewrite con cui arrivano le richieste dal subdomain API.
    expect(
      matches(rule, "https://api.scontrinozero.it/v1/receipts", true),
    ).toBe(true);
  });

  it("leaves navigations and cross-origin requests to defaultCache", () => {
    const rule = networkOnlyRule();

    expect(matches(rule, "https://app.scontrinozero.it/dashboard", true)).toBe(
      false,
    );
    // La pagina pubblica scontrino resta cacheabile: non è autenticata.
    expect(matches(rule, "https://app.scontrinozero.it/r/abc", true)).toBe(
      false,
    );
    // Un path che contiene "/api/" ma non ci inizia non deve matchare.
    expect(
      matches(rule, "https://app.scontrinozero.it/help/api/guida", true),
    ).toBe(false);
    // Né un prefisso che somiglia a "/api/" o "/v1/" senza esserlo.
    expect(
      matches(rule, "https://app.scontrinozero.it/apiv1/receipts", true),
    ).toBe(false);
    expect(
      matches(rule, "https://app.scontrinozero.it/v10/receipts", true),
    ).toBe(false);
    expect(matches(rule, "https://cdn.example.com/api/receipts", false)).toBe(
      false,
    );
  });

  it("serves /offline as the navigation fallback", () => {
    const fallback = options.fallbacks.entries[0];

    expect(fallback.url).toBe("/offline");
    expect(fallback.matcher({ request: { mode: "navigate" } as Request })).toBe(
      true,
    );
    expect(fallback.matcher({ request: { mode: "cors" } as Request })).toBe(
      false,
    );
  });
});
