// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { CapacitorBridge } from "./native-shell";
import {
  ADE_PORTAL_LOGIN_URL,
  captureSpidCookieHeader,
  isDcoUrl,
  toCookieHeader,
} from "./spid-capture";

type Listener = (data: { url?: string }) => void;

/** Bridge finto: registra i listener e lascia al test emettere gli eventi. */
function fakeBridge(cookies: Record<string, string> = { JSESSIONID: "abc" }) {
  const listeners = new Map<string, Listener>();
  const removed: string[] = [];
  const calls: { method: string; options: unknown }[] = [];
  const bridge: CapacitorBridge = {
    isNativePlatform: () => true,
    nativePromise: vi.fn(
      async (_plugin: string, method: string, options?: unknown) => {
        calls.push({ method, options });
        if (method === "getCookies") return cookies;
        return {};
      },
    ),
    addListener: vi.fn((_plugin: string, event: string, cb: Listener) => {
      listeners.set(event, cb);
      return {
        remove: () => {
          removed.push(event);
        },
      };
    }),
  };
  const emit = (event: string, data: { url?: string }) =>
    listeners.get(event)?.(data);
  return { bridge, emit, calls, removed };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("toCookieHeader", () => {
  it("unisce le coppie nel formato dell'header Cookie", () => {
    expect(toCookieHeader({ a: "1", b: "x=y==" })).toBe("a=1; b=x=y==");
  });

  it("salta nomi o valori vuoti", () => {
    expect(toCookieHeader({ "": "1", b: "", c: "3" })).toBe("c=3");
  });
});

describe("isDcoUrl", () => {
  it.each([
    "https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/",
    "https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/#/home",
  ])("riconosce la pagina del DCO: %s", (url) => {
    expect(isDcoUrl(url)).toBe(true);
  });

  it.each([
    ADE_PORTAL_LOGIN_URL,
    "https://evil.example/ser/documenticommercialionline/",
    "http://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/",
    "non-un-url",
  ])("non la confonde con altro: %s", (url) => {
    expect(isDcoUrl(url)).toBe(false);
  });
});

describe("captureSpidCookieHeader", () => {
  it("apre il portale, aspetta il DCO, legge i cookie HttpOnly e chiude", async () => {
    const { bridge, emit, calls, removed } = fakeBridge({
      JSESSIONID: "abc",
      LtpaToken2: "xyz",
    });

    const pending = captureSpidCookieHeader(bridge);
    await flush();
    expect(calls[0]).toMatchObject({
      method: "openWebView",
      options: expect.objectContaining({ url: ADE_PORTAL_LOGIN_URL }),
    });

    emit("urlChangeEvent", { url: ADE_PORTAL_LOGIN_URL });
    emit("urlChangeEvent", {
      url: "https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/",
    });

    await expect(pending).resolves.toBe("JSESSIONID=abc; LtpaToken2=xyz");
    expect(calls.find((c) => c.method === "getCookies")?.options).toEqual({
      url: "https://ivaservizi.agenziaentrate.gov.it/",
      includeHttpOnly: true,
    });
    expect(calls.at(-1)?.method).toBe("close");
    expect(removed.sort()).toEqual(["closeEvent", "urlChangeEvent"]);
  });

  it("se l'utente chiude il browser prima del DCO restituisce null", async () => {
    const { bridge, emit, calls } = fakeBridge();

    const pending = captureSpidCookieHeader(bridge);
    await flush();
    emit("closeEvent", { url: ADE_PORTAL_LOGIN_URL });

    await expect(pending).resolves.toBeNull();
    expect(calls.some((c) => c.method === "getCookies")).toBe(false);
  });

  it("cattura una volta sola anche se il DCO cambia URL più volte", async () => {
    const { bridge, emit, calls } = fakeBridge();
    const dco =
      "https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/";

    const pending = captureSpidCookieHeader(bridge);
    await flush();
    emit("urlChangeEvent", { url: dco });
    emit("urlChangeEvent", { url: `${dco}#/vendita` });
    emit("closeEvent", { url: dco });
    await pending;

    expect(calls.filter((c) => c.method === "getCookies")).toHaveLength(1);
  });

  it("nessun cookie letto: null, e il browser si chiude comunque", async () => {
    const { bridge, emit, calls } = fakeBridge({});

    const pending = captureSpidCookieHeader(bridge);
    await flush();
    emit("urlChangeEvent", {
      url: "https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/",
    });

    await expect(pending).resolves.toBeNull();
    expect(calls.at(-1)?.method).toBe("close");
  });

  it("se la chiusura fallisce i cookie letti non si perdono", async () => {
    // Il login SPID è costato all'utente un secondo fattore: un errore nel
    // chiudere la webview non deve buttarlo via.
    const { bridge, emit } = fakeBridge({ JSESSIONID: "abc" });
    const call = vi.mocked(bridge.nativePromise!);
    const original = call.getMockImplementation()!;
    call.mockImplementation(async (plugin, method, options) => {
      if (method === "close") throw new Error("già chiuso");
      return original(plugin, method, options);
    });

    const pending = captureSpidCookieHeader(bridge);
    await flush();
    emit("urlChangeEvent", {
      url: "https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/",
    });

    await expect(pending).resolves.toBe("JSESSIONID=abc");
  });

  it("un errore del plugin all'apertura risale e stacca i listener", async () => {
    const { bridge, removed } = fakeBridge();
    vi.mocked(bridge.nativePromise!).mockRejectedValueOnce(
      new Error("plugin assente"),
    );

    await expect(captureSpidCookieHeader(bridge)).rejects.toThrow(
      "plugin assente",
    );
    expect(removed.sort()).toEqual(["closeEvent", "urlChangeEvent"]);
  });

  it("senza bridge nativo fallisce subito", async () => {
    await expect(captureSpidCookieHeader(null)).rejects.toThrow(/nativ/i);
  });
});
