import { describe, expect, it, vi } from "vitest";

describe("sitemap", () => {
  it("returns all pages with correct structure", async () => {
    const { default: sitemap } = await import("./sitemap");
    const result = sitemap();

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      url: "https://scontrinozero.it",
      changeFrequency: "monthly",
      priority: 1,
    });
    expect(result[1]).toMatchObject({
      url: "https://scontrinozero.it/privacy",
      changeFrequency: "yearly",
      priority: 0.3,
    });
    expect(result[2]).toMatchObject({
      url: "https://scontrinozero.it/termini",
      changeFrequency: "yearly",
      priority: 0.3,
    });
  });

  it("uses NEXT_PUBLIC_APP_URL when set", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://test.scontrinozero.it");

    // Re-import to pick up the new env
    vi.resetModules();
    const { default: sitemap } = await import("./sitemap");
    const result = sitemap();

    expect(result[0].url).toBe("https://test.scontrinozero.it");
    expect(result[1].url).toBe("https://test.scontrinozero.it/privacy");

    vi.unstubAllEnvs();
  });

  it("includes lastModified as Date for all entries", async () => {
    vi.resetModules();
    const { default: sitemap } = await import("./sitemap");
    const result = sitemap();

    for (const entry of result) {
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });
});
