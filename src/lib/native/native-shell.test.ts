// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { getCapacitorBridge, isNativeShell } from "./native-shell";

type WithCapacitor = { Capacitor?: unknown };

afterEach(() => {
  delete (window as WithCapacitor).Capacitor;
});

describe("isNativeShell", () => {
  it("nel browser senza bridge Capacitor è false", () => {
    expect(isNativeShell()).toBe(false);
    expect(getCapacitorBridge()).toBeNull();
  });

  it("con il bridge di una piattaforma nativa è true", () => {
    (window as WithCapacitor).Capacitor = { isNativePlatform: () => true };
    expect(isNativeShell()).toBe(true);
  });

  it("con il bridge in modalità web è false", () => {
    (window as WithCapacitor).Capacitor = { isNativePlatform: () => false };
    expect(isNativeShell()).toBe(false);
  });

  it("un bridge senza isNativePlatform non conta come nativo", () => {
    (window as WithCapacitor).Capacitor = {};
    expect(isNativeShell()).toBe(false);
  });

  it("un bridge che lancia non rompe il render: false", () => {
    (window as WithCapacitor).Capacitor = {
      isNativePlatform: () => {
        throw new Error("boom");
      },
    };
    expect(isNativeShell()).toBe(false);
  });
});
