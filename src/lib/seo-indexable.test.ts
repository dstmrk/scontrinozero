import { afterEach, describe, expect, it, vi } from "vitest";
import { isIndexableHost, marketingBaseUrl } from "./seo-indexable";

describe("marketingBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to the production marketing apex over https", () => {
    expect(marketingBaseUrl()).toBe("https://scontrinozero.it");
  });

  it("honours a custom NEXT_PUBLIC_MARKETING_HOSTNAME", () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_HOSTNAME", "scontrini.example.org");
    expect(marketingBaseUrl()).toBe("https://scontrini.example.org");
  });

  it("points at a host that isIndexableHost considers indexable (no noindex on sitemap URLs)", () => {
    const host = new URL(marketingBaseUrl()).hostname;
    expect(isIndexableHost(host)).toBe(true);
  });
});

describe("isIndexableHost", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("indexes the production marketing apex", () => {
    expect(isIndexableHost("scontrinozero.it")).toBe(true);
  });

  it("indexes the www subdomain of the apex", () => {
    expect(isIndexableHost("www.scontrinozero.it")).toBe(true);
  });

  it("does NOT index the app subdomain (private + auth pages)", () => {
    expect(isIndexableHost("app.scontrinozero.it")).toBe(false);
  });

  it("does NOT index the sandbox host", () => {
    expect(isIndexableHost("sandbox.scontrinozero.it")).toBe(false);
  });

  it("does NOT index a self-hosted custom domain", () => {
    expect(isIndexableHost("cassa.example.com")).toBe(false);
  });

  it("is case-insensitive and strips a stray port", () => {
    expect(isIndexableHost("SCONTRINOZERO.IT:443")).toBe(true);
  });

  it("returns false for null/undefined/empty host", () => {
    expect(isIndexableHost(null)).toBe(false);
    expect(isIndexableHost(undefined)).toBe(false);
    expect(isIndexableHost("")).toBe(false);
  });

  it("honours a custom NEXT_PUBLIC_MARKETING_HOSTNAME", () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_HOSTNAME", "scontrini.example.org");
    expect(isIndexableHost("scontrini.example.org")).toBe(true);
    expect(isIndexableHost("www.scontrini.example.org")).toBe(true);
    expect(isIndexableHost("scontrinozero.it")).toBe(false);
  });
});
