import { afterEach, describe, expect, it, vi } from "vitest";
import { guideSlugs } from "@/lib/guide/articles";
import { helpSlugs } from "@/lib/help/articles";
import { categorySlugs } from "@/lib/per/categories";
import { toolSlugs } from "@/lib/strumenti/tools";

const mockHeaderGet = vi.fn<(name: string) => string | null>();

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({ get: mockHeaderGet }),
}));

async function getResponse(): Promise<Response> {
  const { GET } = await import("./route");
  return GET();
}

describe("GET /llms.txt", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mockHeaderGet.mockReset();
  });

  it("serves text/plain markdown on the production marketing apex", async () => {
    mockHeaderGet.mockReturnValue("scontrinozero.it");
    const response = await getResponse();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    const body = await response.text();
    // Formato llms.txt: H1 col nome del progetto + blockquote riassuntiva.
    expect(body.startsWith("# ScontrinoZero\n")).toBe(true);
    expect(body).toContain("\n> ");
  });

  it("lists every editorial page from the same registries as the sitemap", async () => {
    mockHeaderGet.mockReturnValue("scontrinozero.it");
    const body = await (await getResponse()).text();

    for (const slug of guideSlugs) {
      expect(body).toContain(`https://scontrinozero.it/guide/${slug}`);
    }
    for (const slug of helpSlugs) {
      expect(body).toContain(`https://scontrinozero.it/help/${slug}`);
    }
    for (const slug of categorySlugs) {
      expect(body).toContain(`https://scontrinozero.it/per/${slug}`);
    }
    for (const slug of toolSlugs) {
      expect(body).toContain(`https://scontrinozero.it/strumenti/${slug}`);
    }
    expect(body).toContain("https://scontrinozero.it/confronto");
    expect(body).toContain("https://scontrinozero.it/prezzi");
    expect(body).toContain("https://scontrinozero.it/funzionalita");
  });

  it("builds URLs only on the indexable marketing apex (never the app domain)", async () => {
    mockHeaderGet.mockReturnValue("scontrinozero.it");
    const body = await (await getResponse()).text();

    expect(body).not.toContain("app.scontrinozero.it");
  });

  it("returns 404 on a non-indexable host (sandbox)", async () => {
    mockHeaderGet.mockReturnValue("sandbox.scontrinozero.it");
    const response = await getResponse();

    expect(response.status).toBe(404);
  });

  it("returns 404 on a self-hosted custom domain", async () => {
    mockHeaderGet.mockReturnValue("cassa.example.com");
    const response = await getResponse();

    expect(response.status).toBe(404);
  });

  it("returns 404 when the host header is missing", async () => {
    mockHeaderGet.mockReturnValue(null);
    const response = await getResponse();

    expect(response.status).toBe(404);
  });
});
