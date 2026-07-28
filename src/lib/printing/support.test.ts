// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { getBluetoothPrintSupport } from "./support";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * `vi.stubGlobal("navigator", …)` sostituisce `globalThis.navigator` (che in
 * jsdom è `window.navigator`): è lo stesso pattern già usato per
 * `navigator.share` in `src/app/r/[documentId]/share-button.test.tsx`.
 */
function stubNavigator(nav: Record<string, unknown>) {
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0", ...nav });
}

describe("getBluetoothPrintSupport", () => {
  it("riporta supported quando l'adattatore è disponibile", async () => {
    stubNavigator({ bluetooth: { getAvailability: async () => true } });
    await expect(getBluetoothPrintSupport()).resolves.toEqual({
      status: "supported",
    });
  });

  it("riporta adapter-off quando il Bluetooth è spento", async () => {
    // Caso frequentissimo al banco: va diagnosticato PRIMA di aprire il
    // chooser, altrimenti l'utente vede una lista vuota e non capisce perché.
    stubNavigator({ bluetooth: { getAvailability: async () => false } });
    await expect(getBluetoothPrintSupport()).resolves.toEqual({
      status: "adapter-off",
    });
  });

  it("riporta unsupported-browser su Safari/iOS, dove navigator.bluetooth non esiste", async () => {
    stubNavigator({});
    await expect(getBluetoothPrintSupport()).resolves.toEqual({
      status: "unsupported-browser",
    });
  });

  it("distingue la webview in-app, dove Web Bluetooth è disattivato per policy", async () => {
    // Il link aperto da Instagram/Facebook gira in una WebView Android, dove
    // requestDevice non esiste (MDN BCD: webview_android = false). Merita un
    // messaggio diverso da "browser non supportato": basta aprire in Chrome.
    stubNavigator({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; SM-S911B; wv) AppleWebKit/537.36 Instagram 300.0",
    });
    await expect(getBluetoothPrintSupport()).resolves.toEqual({
      status: "in-app-webview",
    });
  });

  it("considera supportato un browser senza getAvailability invece di bloccarlo", async () => {
    // getAvailability è arrivata in Chrome 78: se manca ma requestDevice c'è,
    // meglio provare che negare la feature a priori.
    stubNavigator({ bluetooth: { requestDevice: () => {} } });
    await expect(getBluetoothPrintSupport()).resolves.toEqual({
      status: "supported",
    });
  });

  it("non propaga un throw di getAvailability (Permissions-Policy che nega bluetooth)", async () => {
    stubNavigator({
      bluetooth: {
        getAvailability: async () => {
          throw new DOMException("denied", "SecurityError");
        },
      },
    });
    await expect(getBluetoothPrintSupport()).resolves.toEqual({
      status: "unsupported-browser",
    });
  });

  it("è SSR-safe: senza navigator non lancia", async () => {
    vi.stubGlobal("navigator", undefined);
    await expect(getBluetoothPrintSupport()).resolves.toEqual({
      status: "unsupported-browser",
    });
  });
});
