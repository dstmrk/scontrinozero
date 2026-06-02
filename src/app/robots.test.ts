import { afterEach, describe, expect, it, vi } from "vitest";

const mockHeaderGet = vi.fn<(name: string) => string | null>();

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({ get: mockHeaderGet }),
}));

describe("robots", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mockHeaderGet.mockReset();
  });

  it("returns indexable config on the production marketing apex", async () => {
    mockHeaderGet.mockReturnValue("scontrinozero.it");
    const { default: robots } = await import("./robots");
    const result = await robots();

    expect(result).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/onboarding/"],
      },
      sitemap: "https://scontrinozero.it/sitemap.xml",
    });
  });

  it("uses NEXT_PUBLIC_APP_URL for the sitemap URL on the apex", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://test.scontrinozero.it");
    mockHeaderGet.mockReturnValue("scontrinozero.it");

    vi.resetModules();
    const { default: robots } = await import("./robots");
    const result = await robots();

    expect(result.sitemap).toBe("https://test.scontrinozero.it/sitemap.xml");
  });

  it("disallows everything and drops the sitemap on the sandbox host", async () => {
    mockHeaderGet.mockReturnValue("sandbox.scontrinozero.it");
    const { default: robots } = await import("./robots");
    const result = await robots();

    expect(result).toEqual({
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    });
    expect(result.sitemap).toBeUndefined();
  });

  it("disallows everything on a self-hosted custom domain", async () => {
    mockHeaderGet.mockReturnValue("cassa.example.com");
    const { default: robots } = await import("./robots");
    const result = await robots();

    expect(result.rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  it("disallows everything when the host header is missing", async () => {
    mockHeaderGet.mockReturnValue(null);
    const { default: robots } = await import("./robots");
    const result = await robots();

    expect(result.rules).toEqual({ userAgent: "*", disallow: "/" });
  });
});
