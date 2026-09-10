import { describe, it, expect, afterEach, vi } from "vitest";
import { buildConfirmationRedirectTo } from "./confirmation-redirect";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildConfirmationRedirectTo", () => {
  it("passa da /callback, non da /dashboard", () => {
    vi.stubEnv("APP_HOSTNAME", "app.scontrinozero.it");

    expect(buildConfirmationRedirectTo()).toBe(
      "https://app.scontrinozero.it/callback?redirect=%2Fdashboard",
    );
  });

  it("segue l'override runtime dell'hostname (sandbox, self-hosted)", () => {
    vi.stubEnv("APP_HOSTNAME", "app-dev.scontrinozero.it");

    expect(buildConfirmationRedirectTo()).toContain(
      "https://app-dev.scontrinozero.it/",
    );
  });

  it("ricade sull'hostname bakato quando l'override runtime non c'è", () => {
    vi.stubEnv("APP_HOSTNAME", undefined);
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", "app.example.test");

    expect(buildConfirmationRedirectTo()).toContain(
      "https://app.example.test/",
    );
  });
});
