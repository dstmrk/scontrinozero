import { describe, expect, it, vi } from "vitest";

describe("robots", () => {
  it("returns correct robots config", async () => {
    const { default: robots } = await import("./robots");
    const result = robots();

    expect(result).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/onboarding/"],
      },
      sitemap: "https://scontrinozero.it/sitemap.xml",
    });
  });

  it("uses NEXT_PUBLIC_APP_URL for sitemap URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://test.scontrinozero.it");

    vi.resetModules();
    const { default: robots } = await import("./robots");
    const result = robots();

    expect(result.sitemap).toBe("https://test.scontrinozero.it/sitemap.xml");

    vi.unstubAllEnvs();
  });
});
