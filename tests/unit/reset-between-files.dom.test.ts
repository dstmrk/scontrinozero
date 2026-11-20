// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { resetSharedStateBetweenFiles } from "../reset-between-files";

/**
 * Sotto jsdom con `isolate: false` la window è la stessa per tutti i file del
 * worker: un listener lasciato da un file scatta nei successivi.
 */
describe("resetSharedStateBetweenFiles sotto jsdom", () => {
  it("rimuove i listener aggiunti a window durante il file", () => {
    const listener = vi.fn();
    window.addEventListener("reset-probe", listener);

    resetSharedStateBetweenFiles();
    window.dispatchEvent(new Event("reset-probe"));

    expect(listener).not.toHaveBeenCalled();
  });

  it("rimuove anche quelli su document, con le loro options", () => {
    const listener = vi.fn();
    document.addEventListener("reset-probe", listener, { capture: true });

    resetSharedStateBetweenFiles();
    document.dispatchEvent(new Event("reset-probe"));

    expect(listener).not.toHaveBeenCalled();
  });

  it("i listener aggiunti dopo il reset funzionano", () => {
    resetSharedStateBetweenFiles();
    const listener = vi.fn();
    window.addEventListener("reset-probe", listener);

    window.dispatchEvent(new Event("reset-probe"));

    expect(listener).toHaveBeenCalledOnce();
  });
});
