import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vibrate } from "./haptics";

describe("vibrate", () => {
  let mockVibrate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockVibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      value: mockVibrate,
      writable: true,
      configurable: true,
    });
  });

  it("chiama navigator.vibrate([8]) per il pattern light", () => {
    vibrate("light");
    expect(mockVibrate).toHaveBeenCalledWith([8]);
  });

  it("chiama navigator.vibrate([15, 25, 60]) per il pattern success", () => {
    vibrate("success");
    expect(mockVibrate).toHaveBeenCalledWith([15, 25, 60]);
  });

  it("chiama il pattern corretto per error", () => {
    vibrate("error");
    expect(mockVibrate).toHaveBeenCalledWith([14, 10, 14, 10, 14, 10, 14]);
  });

  it("chiama il pattern corretto per warning", () => {
    vibrate("warning");
    expect(mockVibrate).toHaveBeenCalledWith([15, 15, 15, 15, 15]);
  });

  it("non lancia se navigator.vibrate non è supportato (browser legacy)", () => {
    Object.defineProperty(navigator, "vibrate", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(() => vibrate("light")).not.toThrow();
    expect(mockVibrate).not.toHaveBeenCalled();
  });

  it("non lancia in ambiente SSR dove navigator non è definito", () => {
    vi.stubGlobal("navigator", undefined);
    expect(() => vibrate("light")).not.toThrow();
    expect(mockVibrate).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
