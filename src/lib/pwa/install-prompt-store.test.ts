// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type BeforeInstallPromptEvent,
  clearDeferredPrompt,
  getDeferredPrompt,
  initInstallPromptCapture,
  resetInstallPromptStoreForTests,
  subscribeInstallPrompt,
} from "./install-prompt-store";

function makeInstallPromptEvent(): BeforeInstallPromptEvent {
  const event = new Event("beforeinstallprompt") as BeforeInstallPromptEvent;
  event.preventDefault = vi.fn();
  return event;
}

afterEach(() => {
  resetInstallPromptStoreForTests();
  vi.restoreAllMocks();
});

describe("install-prompt-store", () => {
  it("ritorna null prima che l'evento scatti", () => {
    initInstallPromptCapture();
    expect(getDeferredPrompt()).toBeNull();
  });

  it("cattura l'evento beforeinstallprompt e ne previene il default", () => {
    initInstallPromptCapture();
    const event = makeInstallPromptEvent();

    window.dispatchEvent(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(getDeferredPrompt()).toBe(event);
  });

  it("cattura un evento emesso PRIMA che un subscriber si registri (race)", () => {
    initInstallPromptCapture();
    const event = makeInstallPromptEvent();
    window.dispatchEvent(event);

    // Subscriber tardivo: deve comunque vedere l'evento già bufferizzato.
    const unsubscribe = subscribeInstallPrompt(() => {});
    expect(getDeferredPrompt()).toBe(event);
    unsubscribe();
  });

  it("notifica i subscriber alla cattura dell'evento", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeInstallPrompt(callback);

    window.dispatchEvent(makeInstallPromptEvent());

    expect(callback).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("non notifica più dopo l'unsubscribe", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeInstallPrompt(callback);
    unsubscribe();

    window.dispatchEvent(makeInstallPromptEvent());

    expect(callback).not.toHaveBeenCalled();
  });

  it("clearDeferredPrompt azzera lo stato e notifica", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeInstallPrompt(callback);
    window.dispatchEvent(makeInstallPromptEvent());
    callback.mockClear();

    clearDeferredPrompt();

    expect(getDeferredPrompt()).toBeNull();
    expect(callback).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("azzera lo stato quando l'app viene installata (appinstalled)", () => {
    initInstallPromptCapture();
    window.dispatchEvent(makeInstallPromptEvent());
    expect(getDeferredPrompt()).not.toBeNull();

    window.dispatchEvent(new Event("appinstalled"));

    expect(getDeferredPrompt()).toBeNull();
  });

  it("è idempotente: init multipli non duplicano i listener", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    initInstallPromptCapture();
    initInstallPromptCapture();
    initInstallPromptCapture();

    const beforeInstallCalls = addSpy.mock.calls.filter(
      ([type]) => type === "beforeinstallprompt",
    );
    expect(beforeInstallCalls).toHaveLength(1);
  });
});
