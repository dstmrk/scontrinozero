// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CapacitorBridge } from "./native-shell";
import {
  ADE_DCO_URL,
  clearAdeCookies,
  reportAdeCookieResidue,
} from "./ade-cookie-cleanup";

const { mockCaptureMessage } = vi.hoisted(() => ({
  mockCaptureMessage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureMessage: mockCaptureMessage }));

type Call = { plugin: string; method: string; options: unknown };

const HOSTS = ["ivaservizi", "iampe", "portale", "sp", "telematici"].map(
  (host) => `https://${host}.agenziaentrate.gov.it/`,
);
const EXPIRED = "Thu, 01 Jan 1970 00:00:00 GMT";

/**
 * Bridge finto. `jar` dice cosa torna `getCookies` per ogni URL letto; un
 * valore `Error` fa rigettare quella lettura.
 */
function fakeBridge(
  platform: string | undefined,
  jar: Record<string, Record<string, string> | Error> = {},
) {
  const calls: Call[] = [];
  const bridge: CapacitorBridge = {
    getPlatform: platform === undefined ? undefined : () => platform,
    nativePromise: vi.fn(
      async (plugin: string, method: string, options?: unknown) => {
        calls.push({ plugin, method, options });
        if (method === "getCookies") {
          const cookies = jar[(options as { url: string }).url] ?? {};
          if (cookies instanceof Error) throw cookies;
          return cookies;
        }
        return {};
      },
    ),
  };
  return { bridge, calls };
}

beforeEach(() => {
  mockCaptureMessage.mockReset();
});

describe("clearAdeCookies su iOS", () => {
  it("cancella dal plugin ogni cookie del dominio AdE, con un solo clearCookies", async () => {
    const { bridge, calls } = fakeBridge("ios");

    await clearAdeCookies(bridge);

    // Il plugin iOS confronta per suffisso di dominio: dal dominio
    // registrabile prende ivaservizi, iampe, portale e i cookie di
    // `.agenziaentrate.gov.it`, e nient'altro (Supabase sta su un altro host).
    expect(calls).toEqual([
      {
        plugin: "CapgoInAppBrowser",
        method: "clearCookies",
        options: { url: "https://agenziaentrate.gov.it/" },
      },
    ]);
  });

  it("un clearCookies che rigetta non risale (iOS 15/16 a browser chiuso)", async () => {
    const { bridge } = fakeBridge("ios");
    vi.mocked(bridge.nativePromise!).mockRejectedValue(
      new Error("WebView is not initialized"),
    );

    await expect(clearAdeCookies(bridge)).resolves.toBeUndefined();
  });
});

describe("clearAdeCookies su Android", () => {
  it("legge i cookie di ogni host AdE, HttpOnly compresi", async () => {
    const { bridge, calls } = fakeBridge("android");

    await clearAdeCookies(bridge);

    const read = calls.filter((c) => c.method === "getCookies");
    expect(read.map((c) => c.plugin)).toEqual(
      HOSTS.map(() => "CapgoInAppBrowser"),
    );
    expect(read.map((c) => c.options)).toEqual(
      HOSTS.map((url) => ({ url, includeHttpOnly: true })),
    );
  });

  it("fa scadere ogni nome nelle tre chiavi possibili su Path=/", async () => {
    const ivaservizi = "https://ivaservizi.agenziaentrate.gov.it/";
    const { bridge, calls } = fakeBridge("android", {
      [ivaservizi]: { JSESSIONID: "abc", LtpaToken2: "xyz" },
    });

    await clearAdeCookies(bridge);

    const writes = calls.filter((c) => c.method === "setCookie");
    expect(writes.every((c) => c.plugin === "CapacitorCookies")).toBe(true);
    // Host-only, Domain uguale all'host, Domain del dominio registrabile:
    // `CookieManager` le tiene come tre cookie distinti, e `getCookies` non
    // dice quale delle tre esiste.
    for (const key of ["JSESSIONID", "LtpaToken2"]) {
      expect(writes.map((c) => c.options)).toEqual(
        expect.arrayContaining(
          [
            "/",
            "/; domain=ivaservizi.agenziaentrate.gov.it",
            "/; domain=.agenziaentrate.gov.it",
          ].map((path) => ({
            url: ivaservizi,
            key,
            value: "",
            expires: EXPIRED,
            path,
          })),
        ),
      );
    }
    expect(writes).toHaveLength(6);
  });

  it("non usa mai i clear del plugin InAppBrowser né i clear globali", async () => {
    // clearCookies del plugin scrive `NOME=del` invece di cancellare;
    // clearAllCookies svuota il CookieManager di processo, Supabase compreso.
    const { bridge, calls } = fakeBridge("android", {
      [HOSTS[0]]: { JSESSIONID: "abc" },
    });

    await clearAdeCookies(bridge);

    const methods = calls.map((c) => c.method);
    expect(methods).not.toContain("clearCookies");
    expect(methods).not.toContain("clearAllCookies");
    expect(methods).not.toContain("deleteCookie");
  });

  it("una lettura o una scrittura che fallisce non ferma le altre", async () => {
    const { bridge, calls } = fakeBridge("android", {
      [HOSTS[0]]: new Error("host irraggiungibile"),
      [HOSTS[1]]: { SIAMPE: "s", SIAMPE_TAI: "t" },
    });
    const call = vi.mocked(bridge.nativePromise!);
    const original = call.getMockImplementation()!;
    call.mockImplementation(async (plugin, method, options) => {
      const result = await original(plugin, method, options);
      if (
        method === "setCookie" &&
        (options as { key: string }).key === "SIAMPE"
      ) {
        throw new Error("scrittura fallita");
      }
      return result;
    });

    await expect(clearAdeCookies(bridge)).resolves.toBeUndefined();

    const keys = calls
      .filter((c) => c.method === "setCookie")
      .map((c) => (c.options as { key: string }).key);
    expect(keys.filter((k) => k === "SIAMPE_TAI")).toHaveLength(3);
  });

  it("aspetta tutte le scritture anche se una fallisce subito", async () => {
    // Altrimenti il controllo del residuo rilegge mentre le altre scritture
    // sono ancora in volo, e segnala cookie che stanno per sparire.
    const { bridge } = fakeBridge("android", {
      [HOSTS[0]]: { LtpaToken2: "a", SIAMPE: "b" },
    });
    const call = vi.mocked(bridge.nativePromise!);
    const original = call.getMockImplementation()!;
    let releaseSlowWrites!: () => void;
    const slowWrites = new Promise<void>((resolve) => {
      releaseSlowWrites = resolve;
    });
    call.mockImplementation(async (plugin, method, options) => {
      if (method !== "setCookie") return original(plugin, method, options);
      if ((options as { key: string }).key === "SIAMPE") {
        throw new Error("scrittura fallita");
      }
      await slowWrites;
      return {};
    });

    let done = false;
    const pending = clearAdeCookies(bridge).then(() => {
      done = true;
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(done).toBe(false);

    releaseSlowWrites();
    await pending;
    expect(done).toBe(true);
  });

  it("senza cookie non scrive niente", async () => {
    const { bridge, calls } = fakeBridge("android");

    await clearAdeCookies(bridge);

    expect(calls.some((c) => c.method === "setCookie")).toBe(false);
  });
});

describe("bridge che lancia su getPlatform", () => {
  it("né la pulizia né il controllo rigettano: la cattura li attende", async () => {
    const { bridge, calls } = fakeBridge("ios");
    bridge.getPlatform = () => {
      throw new Error("bridge rotto");
    };

    await expect(clearAdeCookies(bridge)).resolves.toBeUndefined();
    await expect(reportAdeCookieResidue(bridge)).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });
});

describe("clearAdeCookies fuori da iOS e Android", () => {
  it.each([["web"], [undefined]])(
    "piattaforma %s: nessuna chiamata",
    async (platform) => {
      const { bridge, calls } = fakeBridge(platform);

      await clearAdeCookies(bridge);

      expect(calls).toEqual([]);
    },
  );
});

describe("reportAdeCookieResidue", () => {
  it("iOS: nomi rimasti → warning Sentry con i soli nomi, mai i valori", async () => {
    const { bridge, calls } = fakeBridge("ios", {
      "https://agenziaentrate.gov.it/": {
        LtpaToken2: "valore-segreto",
        JSESSIONID: "altro-segreto",
      },
    });

    await reportAdeCookieResidue(bridge);

    expect(calls).toEqual([
      {
        plugin: "CapgoInAppBrowser",
        method: "getCookies",
        options: {
          url: "https://agenziaentrate.gov.it/",
          includeHttpOnly: true,
        },
      },
    ]);
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    const [message, context] = mockCaptureMessage.mock.calls[0];
    expect(message).toMatch(/cookie AdE/);
    expect(context).toEqual({
      level: "warning",
      tags: { flow: "spid-capture", platform: "ios" },
      extra: { cookieNames: ["JSESSIONID", "LtpaToken2"] },
    });
    expect(JSON.stringify(mockCaptureMessage.mock.calls)).not.toMatch(
      /segreto/,
    );
  });

  it("Android: rilegge ogni host e la pagina del DCO, e unisce i nomi", async () => {
    // I cookie con un Path sotto /ser/ si vedono solo dalla pagina del DCO.
    const { bridge, calls } = fakeBridge("android", {
      [HOSTS[0]]: { LtpaToken2: "a" },
      [HOSTS[1]]: { LtpaToken2: "a", SIAMPE: "b" },
      [ADE_DCO_URL]: { FATSC: "c" },
    });

    await reportAdeCookieResidue(bridge);

    expect(calls.map((c) => (c.options as { url: string }).url)).toEqual([
      ...HOSTS,
      ADE_DCO_URL,
    ]);
    expect(mockCaptureMessage.mock.calls[0][1]).toMatchObject({
      tags: { platform: "android" },
      extra: { cookieNames: ["FATSC", "LtpaToken2", "SIAMPE"] },
    });
  });

  it("un cookie senza nome non finisce nel warning", async () => {
    const { bridge } = fakeBridge("ios", {
      "https://agenziaentrate.gov.it/": { "": "x" },
    });

    await reportAdeCookieResidue(bridge);

    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("niente rimasto: nessun evento", async () => {
    const { bridge } = fakeBridge("android");

    await reportAdeCookieResidue(bridge);

    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("se la rilettura fallisce non segnala e non risale", async () => {
    const { bridge } = fakeBridge("ios", {
      "https://agenziaentrate.gov.it/": new Error("plugin assente"),
    });

    await expect(reportAdeCookieResidue(bridge)).resolves.toBeUndefined();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("fuori da iOS e Android non legge niente", async () => {
    const { bridge, calls } = fakeBridge("web");

    await reportAdeCookieResidue(bridge);

    expect(calls).toEqual([]);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});
