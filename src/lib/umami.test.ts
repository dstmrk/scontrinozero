// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { track, UMAMI_EVENTS } from "./umami";

describe("track (umami)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.umami;
  });

  it("inoltra evento e dati a window.umami.track", () => {
    const spy = vi.fn();
    window.umami = { track: spy };
    track(UMAMI_EVENTS.receiptEmitted, { plan: "pro" });
    expect(spy).toHaveBeenCalledWith("receipt_emitted", { plan: "pro" });
  });

  it("è no-op se window.umami non è definito (script non caricato / ad-blocker)", () => {
    delete window.umami;
    expect(() => track(UMAMI_EVENTS.planUpgradeClick)).not.toThrow();
  });

  it("non propaga errori sollevati dal client Umami", () => {
    window.umami = {
      track: () => {
        throw new Error("boom");
      },
    };
    expect(() => track(UMAMI_EVENTS.receiptEmitted)).not.toThrow();
  });

  it("è no-op in ambiente senza window (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => track(UMAMI_EVENTS.receiptEmitted)).not.toThrow();
  });

  it("espone nomi evento stabili", () => {
    expect(UMAMI_EVENTS.receiptEmitted).toBe("receipt_emitted");
    expect(UMAMI_EVENTS.planUpgradeClick).toBe("plan_upgrade_click");
    expect(UMAMI_EVENTS.onboardingStepCompleted).toBe(
      "onboarding_step_completed",
    );
  });
});
